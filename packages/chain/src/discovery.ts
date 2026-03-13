import { readdirSync, accessSync, existsSync, constants } from 'node:fs';
import { join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  parseConfFile,
  getChainDataDir,
  getPbaasDir,
  getChainConfPath,
  getVerusdDefaultPaths,
  writeRegistry,
  type RpcCredentials,
  type ChainEntry,
  type LocalChainEntry,
  type RemoteChainEntry,
  type ChainRegistry,
} from '@verusidx/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PingResult = {
  running: true;
  getinfo: Record<string, unknown>;
} | {
  running: false;
  error: string;
};

export interface DiscoveryResult {
  registry: ChainRegistry;
  reachability: Record<string, { running: boolean; error?: string }>;
}

// ---------------------------------------------------------------------------
// Ping — lightweight getinfo with short timeout
// ---------------------------------------------------------------------------

/**
 * Ping a daemon with a `getinfo` call using a short timeout.
 *
 * Does NOT use the shared rpcCall() because:
 * - During first discovery, the registry doesn't exist yet
 * - We need configurable timeout (6s default vs 30s in shared)
 */
export async function pingChain(
  creds: RpcCredentials,
  timeoutMs = 6000,
): Promise<PingResult> {
  const url = `http://${creds.host}:${creds.port}`;
  const credentials = Buffer.from(`${creds.user}:${creds.password}`).toString('base64');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'Authorization': `Basic ${credentials}`,
      },
      body: JSON.stringify({
        jsonrpc: '1.0',
        id: 'ping',
        method: 'getinfo',
        params: [],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      return { running: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json() as { result: Record<string, unknown> | null; error: unknown };
    if (data.error || !data.result) {
      return { running: false, error: 'getinfo returned error' };
    }

    return { running: true, getinfo: data.result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { running: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Chain scanning
// ---------------------------------------------------------------------------

interface ScannedChain {
  name: string;
  entry: LocalChainEntry;
  creds: RpcCredentials | null;
}

/**
 * Scan the Komodo data directory for chains with .conf files.
 * Respects VERUSIDX_DATA_DIR override.
 */
function scanKomodoDir(): ScannedChain[] {
  const dataDir = process.env.VERUSIDX_DATA_DIR || getChainDataDir();
  const results: ScannedChain[] = [];

  let dirs: string[];
  try {
    dirs = readdirSync(dataDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch {
    return results;
  }

  for (const dir of dirs) {
    const confPath = join(dataDir, dir, `${dir}.conf`);
    if (!existsSync(confPath)) continue;

    const conf = parseConfFile(confPath);
    if (!conf?.rpcuser || !conf?.rpcpassword) continue;

    const port = conf.rpcport ? parseInt(conf.rpcport, 10) : undefined;
    if (!port || isNaN(port)) continue;

    const host = conf.rpchost || '127.0.0.1';
    const entry: LocalChainEntry = { confPath, host, port };
    const creds: RpcCredentials = { host, port, user: conf.rpcuser, password: conf.rpcpassword };

    results.push({ name: dir, entry, creds });
  }

  return results;
}

/**
 * Scan the PBaaS directory for chains with hex-encoded folder names.
 * Returns a map of hex folder name → scanned chain data.
 */
function scanPbaasDir(): Map<string, ScannedChain> {
  const pbaasDir = getPbaasDir();
  const results = new Map<string, ScannedChain>();

  let dirs: string[];
  try {
    dirs = readdirSync(pbaasDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch {
    return results;
  }

  for (const dir of dirs) {
    // PBaaS dirs may have a .conf file with a different name pattern
    // Look for any .conf file in the directory
    let confFiles: string[];
    try {
      confFiles = readdirSync(join(pbaasDir, dir))
        .filter(f => f.endsWith('.conf'));
    } catch {
      continue;
    }

    if (confFiles.length === 0) continue;
    const confPath = join(pbaasDir, dir, confFiles[0]);

    const conf = parseConfFile(confPath);
    if (!conf?.rpcuser || !conf?.rpcpassword) continue;

    const port = conf.rpcport ? parseInt(conf.rpcport, 10) : undefined;
    if (!port || isNaN(port)) continue;

    const host = conf.rpchost || '127.0.0.1';
    const entry: LocalChainEntry = { confPath, host, port };
    const creds: RpcCredentials = { host, port, user: conf.rpcuser, password: conf.rpcpassword };

    results.set(dir, { name: dir, entry, creds });
  }

  return results;
}

/**
 * Resolve PBaaS hex folder names to friendly names via the VRSC daemon.
 *
 * Calls `listcurrencies {"systemtype":"pbaas"}` on VRSC and matches
 * `currencyidhex` to hex folder names. Unresolved hex names are kept as-is.
 *
 * Best-effort — if VRSC isn't running, returns entries with hex names.
 */
async function resolvePbaasNames(
  hexEntries: Map<string, ScannedChain>,
  vrscCreds: RpcCredentials | null,
): Promise<ScannedChain[]> {
  if (hexEntries.size === 0) return [];

  const resolved: ScannedChain[] = [];
  const unresolved = new Map(hexEntries);

  if (vrscCreds) {
    try {
      const pingResult = await pingChain(vrscCreds);
      if (pingResult.running) {
        // Make a direct RPC call to listcurrencies on VRSC
        const url = `http://${vrscCreds.host}:${vrscCreds.port}`;
        const credentials = Buffer.from(`${vrscCreds.user}:${vrscCreds.password}`).toString('base64');

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
            'Authorization': `Basic ${credentials}`,
          },
          body: JSON.stringify({
            jsonrpc: '1.0',
            id: 'listcurrencies',
            method: 'listcurrencies',
            params: [{ systemtype: 'pbaas' }],
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (response.ok) {
          const data = await response.json() as {
            result: Array<{ currencydefinition: { fullyqualifiedname: string; currencyidhex: string } }> | null;
          };

          if (data.result) {
            for (const currency of data.result) {
              const hex = currency.currencydefinition?.currencyidhex;
              const name = currency.currencydefinition?.fullyqualifiedname;
              if (hex && name && unresolved.has(hex)) {
                const scanned = unresolved.get(hex)!;
                resolved.push({ ...scanned, name });
                unresolved.delete(hex);
              }
            }
          }
        }
      }
    } catch {
      // Best-effort — keep hex names
    }
  }

  // Add unresolved entries with their hex folder names
  for (const [, scanned] of unresolved) {
    resolved.push(scanned);
  }

  return resolved;
}

/**
 * Parse VERUSIDX_EXTRA_CHAINS env var for remote daemons.
 * Format: name:host:port:user:pass, comma-separated
 */
function parseExtraChains(): Array<{ name: string; entry: RemoteChainEntry }> {
  const envVal = process.env.VERUSIDX_EXTRA_CHAINS;
  if (!envVal) return [];

  const results: Array<{ name: string; entry: RemoteChainEntry }> = [];

  for (const part of envVal.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const segments = trimmed.split(':');
    if (segments.length < 5) continue;

    const [name, host, portStr, user, ...passwordParts] = segments;
    const port = parseInt(portStr, 10);
    if (!name || !host || isNaN(port) || !user) continue;

    // Password may contain colons, rejoin remaining segments
    const password = passwordParts.join(':');
    if (!password) continue;

    results.push({
      name,
      entry: { host, port, user, password },
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main discovery
// ---------------------------------------------------------------------------

/**
 * Discover all chains (local + PBaaS + remote) and write the registry.
 *
 * This is the core logic behind the `refresh_chains` tool.
 */
export async function discoverChains(): Promise<DiscoveryResult> {
  // 1. Scan Komodo data dir
  const komodoChains = scanKomodoDir();

  // 2. Scan PBaaS dir
  const pbaasHexEntries = scanPbaasDir();

  // 3. Find VRSC credentials for PBaaS name resolution
  const vrscChain = komodoChains.find(c => c.name === 'VRSC');
  const vrscCreds = vrscChain?.creds ?? null;

  // 4. Resolve PBaaS hex names
  const pbaasChains = await resolvePbaasNames(pbaasHexEntries, vrscCreds);

  // 5. Parse extra chains
  const extraChains = parseExtraChains();

  // 6. Build chains record (deduplicate: Komodo wins over PBaaS for same name)
  const chains: Record<string, ChainEntry> = {};
  for (const c of komodoChains) {
    chains[c.name] = c.entry;
  }
  for (const c of pbaasChains) {
    if (!chains[c.name]) {
      chains[c.name] = c.entry;
    }
  }
  for (const c of extraChains) {
    chains[c.name] = c.entry;
  }

  // 7. Check reachability for all chains
  const reachability: Record<string, { running: boolean; error?: string }> = {};

  // Build a creds map for pinging
  const credsMap = new Map<string, RpcCredentials>();
  for (const c of komodoChains) {
    if (c.creds) credsMap.set(c.name, c.creds);
  }
  for (const c of pbaasChains) {
    if (c.creds) credsMap.set(c.name, c.creds);
  }
  for (const c of extraChains) {
    credsMap.set(c.name, {
      host: c.entry.host,
      port: c.entry.port,
      user: c.entry.user,
      password: c.entry.password,
    });
  }

  const pingPromises = Object.keys(chains).map(async (name) => {
    const creds = credsMap.get(name);
    if (!creds) {
      reachability[name] = { running: false, error: 'No credentials' };
      return;
    }
    const result = await pingChain(creds);
    reachability[name] = result.running
      ? { running: true }
      : { running: false, error: result.error };
  });

  await Promise.allSettled(pingPromises);

  // 8. Build and write registry
  const registry: ChainRegistry = {
    version: 1,
    discoveredAt: new Date().toISOString(),
    chains,
  };

  writeRegistry(registry);

  return { registry, reachability };
}

// ---------------------------------------------------------------------------
// verusd binary discovery
// ---------------------------------------------------------------------------

/**
 * Find the verusd binary path.
 *
 * Checks in order:
 * 1. VERUSIDX_BIN_PATH env var (directory containing verusd)
 * 2. PATH lookup via `which verusd`
 * 3. OS-specific default locations from getVerusdDefaultPaths()
 */
export function findVerusdBinary(): string | null {
  // 1. Env var — directory containing verusd
  const binPath = process.env.VERUSIDX_BIN_PATH;
  if (binPath) {
    const candidate = join(binPath, 'verusd');
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Env var set but binary not found at that path
    }
  }

  // 2. PATH lookup
  try {
    const result = execFileSync('which', ['verusd'], {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    if (result) return result;
  } catch {
    // Not on PATH
  }

  // 3. OS-specific defaults
  for (const candidate of getVerusdDefaultPaths()) {
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}
