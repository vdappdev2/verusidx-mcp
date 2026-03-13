import { homedir, platform } from 'node:os';
import { join } from 'node:path';

/**
 * OS-specific path utilities for verusidx-mcp.
 *
 * Covers:
 * - Chain data directories (Komodo/CHAIN/, Verus/pbaas/)
 * - verusidx-mcp config directory (registry, audit logs, spending limits)
 * - verusd binary default locations
 */

type Platform = 'darwin' | 'win32' | 'linux';

function getPlatform(): Platform {
  const p = platform();
  if (p === 'darwin' || p === 'win32') return p;
  return 'linux'; // treat all non-mac/win as linux
}

function getAppData(): string {
  return process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
}

// --- Chain data directories ---

/** Primary chain data directory (Komodo-style). */
export function getChainDataDir(): string {
  const p = getPlatform();
  switch (p) {
    case 'darwin':
      return join(homedir(), 'Library', 'Application Support', 'Komodo');
    case 'win32':
      return join(getAppData(), 'Komodo');
    default:
      return join(homedir(), '.komodo');
  }
}

/** PBaaS data directory (Verus-style). */
export function getPbaasDir(): string {
  const p = getPlatform();
  switch (p) {
    case 'darwin':
      return join(homedir(), 'Library', 'Application Support', 'Verus', 'pbaas');
    case 'win32':
      return join(getAppData(), 'Verus', 'pbaas');
    default:
      return join(homedir(), '.verus', 'pbaas');
  }
}

/** Get the expected .conf file path for a chain in the Komodo data dir. */
export function getChainConfPath(chainName: string): string {
  return join(getChainDataDir(), chainName, `${chainName}.conf`);
}

// --- verusidx-mcp config directory ---

/** Root config directory for verusidx-mcp. */
export function getConfigDir(): string {
  const p = getPlatform();
  switch (p) {
    case 'darwin':
      return join(homedir(), 'Library', 'Application Support', 'verusidx-mcp');
    case 'win32':
      return join(getAppData(), 'verusidx-mcp');
    default:
      return join(homedir(), '.config', 'verusidx-mcp');
  }
}

/** Path to the chain registry file. */
export function getRegistryPath(): string {
  return join(getConfigDir(), 'chains.json');
}

/** Path to the spending limits config file. */
export function getSpendingLimitsPath(): string {
  const custom = process.env.VERUSIDX_SPENDING_LIMITS_PATH;
  if (custom) return custom;
  return join(getConfigDir(), 'spending-limits.json');
}

/** Audit log directory. */
export function getAuditDir(): string {
  const custom = process.env.VERUSIDX_AUDIT_DIR;
  if (custom) return custom;
  return join(getConfigDir(), 'audit');
}

/** Commitment storage directory for identity registration. */
export function getCommitmentsDir(): string {
  return join(homedir(), '.verusidx', 'commitments');
}

// --- verusd binary locations ---

/** Default locations to search for the verusd binary, after env var and PATH. */
export function getVerusdDefaultPaths(): string[] {
  const p = getPlatform();
  switch (p) {
    case 'darwin':
      return [
        '/Applications/Verus-Desktop.app/Contents/Resources/verusd/verusd',
        join(homedir(), 'verus-cli', 'verusd'),
      ];
    case 'win32':
      return [
        join(process.env.ProgramFiles || 'C:\\Program Files', 'VerusCoin', 'verusd.exe'),
        join(homedir(), 'verus-cli', 'verusd.exe'),
      ];
    default:
      return [
        '/opt/verus/verusd',
        join(homedir(), 'verus-cli', 'verusd'),
      ];
  }
}
