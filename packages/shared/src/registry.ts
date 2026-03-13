import { readFileSync, writeFileSync, renameSync, mkdirSync, statSync, constants } from 'node:fs';
import { dirname } from 'node:path';
import { parseConfFile } from './conf-parser.js';
import { getRegistryPath } from './platform.js';
import type { ChainRegistry, ChainEntry, RpcCredentials } from './types.js';
import { isLocalChain } from './types.js';

/**
 * Chain registry reader with stat()-based invalidation and credential resolution.
 *
 * Usage:
 *   const reader = new RegistryReader();
 *   const chains = reader.getChains();        // all chains
 *   const creds = reader.getCredentials('VRSC'); // resolved credentials
 */
export class RegistryReader {
  private registryPath: string;
  private cached: ChainRegistry | null = null;
  private cachedMtimeMs = 0;

  constructor(registryPath?: string) {
    this.registryPath = registryPath ?? getRegistryPath();
  }

  /**
   * Read the registry, re-reading from disk only if mtime changed.
   * Returns null if the registry file doesn't exist.
   */
  read(): ChainRegistry | null {
    let stat;
    try {
      stat = statSync(this.registryPath);
    } catch {
      // File doesn't exist
      this.cached = null;
      this.cachedMtimeMs = 0;
      return null;
    }

    if (this.cached && stat.mtimeMs === this.cachedMtimeMs) {
      return this.cached;
    }

    try {
      const content = readFileSync(this.registryPath, 'utf-8');
      this.cached = JSON.parse(content) as ChainRegistry;
      this.cachedMtimeMs = stat.mtimeMs;
      return this.cached;
    } catch {
      this.cached = null;
      this.cachedMtimeMs = 0;
      return null;
    }
  }

  /** Force a re-read from disk on next access. */
  invalidate(): void {
    this.cached = null;
    this.cachedMtimeMs = 0;
  }

  /** Get all chains from the registry. */
  getChains(): Record<string, ChainEntry> {
    const registry = this.read();
    return registry?.chains ?? {};
  }

  /** Get a specific chain entry. */
  getChain(chainName: string): ChainEntry | undefined {
    return this.getChains()[chainName];
  }

  /** Get the discoveredAt timestamp. */
  getDiscoveredAt(): string | null {
    return this.read()?.discoveredAt ?? null;
  }

  /**
   * Resolve RPC credentials for a chain.
   *
   * - Local chains: reads credentials from the .conf file on disk
   * - Remote chains: uses credentials from the registry entry
   */
  resolveCredentials(entry: ChainEntry): RpcCredentials | null {
    if (isLocalChain(entry)) {
      const conf = parseConfFile(entry.confPath);
      if (!conf?.rpcuser || !conf?.rpcpassword) return null;
      return {
        host: entry.host,
        port: entry.port,
        user: conf.rpcuser,
        password: conf.rpcpassword,
      };
    }

    // Remote chain — credentials are in the registry
    return {
      host: entry.host,
      port: entry.port,
      user: entry.user,
      password: entry.password,
    };
  }
}

/**
 * Write a chain registry atomically.
 *
 * Writes to a temp file then renames — on POSIX, rename() is atomic
 * at the filesystem level, so readers see either the old or new file.
 */
export function writeRegistry(registry: ChainRegistry, registryPath?: string): void {
  const path = registryPath ?? getRegistryPath();
  const dir = dirname(path);
  const tmpPath = `${path}.tmp`;

  mkdirSync(dir, { recursive: true, mode: 0o700 });

  const content = JSON.stringify(registry, null, 2) + '\n';
  writeFileSync(tmpPath, content, { mode: 0o600 });
  renameSync(tmpPath, path);
}
