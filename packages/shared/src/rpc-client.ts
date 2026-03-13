import { RegistryReader } from './registry.js';
import { VerusError, normalizeRpcError, connectionError, authError } from './errors.js';
import type { RpcCredentials, RpcRequest, RpcResponse } from './types.js';

const RPC_TIMEOUT = 30_000;

/**
 * In-memory credential cache per chain.
 * Credentials are read from .conf files (local) or registry (remote)
 * and cached here. Invalidated on auth failure for one retry.
 */
const credentialCache = new Map<string, RpcCredentials>();

/** Shared registry reader instance. */
let registryReader: RegistryReader | null = null;

function getRegistry(): RegistryReader {
  if (!registryReader) {
    registryReader = new RegistryReader();
  }
  return registryReader;
}

/**
 * Allow tests or custom setups to provide their own RegistryReader.
 */
export function setRegistryReader(reader: RegistryReader): void {
  registryReader = reader;
}

/**
 * Resolve credentials for a chain, using cache when available.
 */
function resolveCredentials(chain: string, skipCache = false): RpcCredentials {
  if (!skipCache) {
    const cached = credentialCache.get(chain);
    if (cached) return cached;
  }

  const registry = getRegistry();
  const entry = registry.getChain(chain);
  if (!entry) {
    throw new VerusError(
      'CONNECTION_FAILED',
      `Chain "${chain}" not found in registry. Run refresh_chains to update.`,
    );
  }

  const creds = registry.resolveCredentials(entry);
  if (!creds) {
    throw new VerusError(
      'AUTH_FAILED',
      `Cannot resolve credentials for chain "${chain}". Check .conf file exists and contains rpcuser/rpcpassword.`,
    );
  }

  credentialCache.set(chain, creds);
  return creds;
}

/**
 * Make a single HTTP JSON-RPC call to a daemon.
 */
async function rawRpcCall<T>(creds: RpcCredentials, method: string, params: unknown[]): Promise<T> {
  const url = `http://${creds.host}:${creds.port}`;
  const credentials = Buffer.from(`${creds.user}:${creds.password}`).toString('base64');

  const request: RpcRequest = {
    jsonrpc: '1.0',
    id: `verusidx-${Date.now()}`,
    method,
    params,
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'Authorization': `Basic ${credentials}`,
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(RPC_TIMEOUT),
    });
  } catch (err) {
    // Network-level failure — timeout, ECONNREFUSED, etc.
    throw connectionError(method, err instanceof Error ? err : undefined);
  }

  // HTTP 401/403 → auth failure
  if (response.status === 401 || response.status === 403) {
    throw authError(method);
  }

  if (!response.ok) {
    throw new VerusError(
      'RPC_ERROR',
      `RPC HTTP error: ${response.status} ${response.statusText}`,
    );
  }

  const data: RpcResponse<T> = await response.json() as RpcResponse<T>;

  if (data.error) {
    throw normalizeRpcError(data.error.code, data.error.message);
  }

  if (data.result === null || data.result === undefined) {
    throw new VerusError('RPC_ERROR', `RPC returned null result for ${method}`);
  }

  return data.result;
}

/**
 * Make an RPC call to a chain's daemon.
 *
 * Handles:
 * - Credential resolution from registry + .conf files
 * - In-memory credential caching
 * - Auth failure retry (invalidate cache, re-read .conf, retry once)
 * - Error normalization
 *
 * @param chain - Chain name as it appears in the registry (e.g., "VRSC", "vrsctest")
 * @param method - RPC method name (e.g., "getinfo", "sendcurrency")
 * @param params - RPC method parameters
 */
export async function rpcCall<T = unknown>(chain: string, method: string, params: unknown[] = []): Promise<T> {
  const creds = resolveCredentials(chain);

  try {
    return await rawRpcCall<T>(creds, method, params);
  } catch (err) {
    if (err instanceof VerusError && err.category === 'AUTH_FAILED') {
      // Auth failure — invalidate cache, re-read .conf, retry once
      credentialCache.delete(chain);
      getRegistry().invalidate();
      const freshCreds = resolveCredentials(chain, true);
      return rawRpcCall<T>(freshCreds, method, params);
    }

    if (err instanceof VerusError && err.category === 'CONNECTION_FAILED') {
      // Connection failure — invalidate registry cache so next call re-reads
      // (the chain may have moved ports after a restart)
      credentialCache.delete(chain);
      getRegistry().invalidate();
    }

    throw err;
  }
}

/**
 * Clear the credential cache for a specific chain or all chains.
 */
export function clearCredentialCache(chain?: string): void {
  if (chain) {
    credentialCache.delete(chain);
  } else {
    credentialCache.clear();
  }
}
