/**
 * Chain registry types — the JSON structure written by chain-mcp
 * and read by all other MCPs.
 */

/** A local chain discovered from a .conf file on disk. */
export interface LocalChainEntry {
  confPath: string;
  host: string;
  port: number;
}

/** A remote chain added via VERUSIDX_EXTRA_CHAINS env var. */
export interface RemoteChainEntry {
  host: string;
  port: number;
  user: string;
  password: string;
}

export type ChainEntry = LocalChainEntry | RemoteChainEntry;

export function isLocalChain(entry: ChainEntry): entry is LocalChainEntry {
  return 'confPath' in entry;
}

export function isRemoteChain(entry: ChainEntry): entry is RemoteChainEntry {
  return !('confPath' in entry);
}

/** The chain registry file written to disk as chains.json. */
export interface ChainRegistry {
  version: number;
  discoveredAt: string;
  chains: Record<string, ChainEntry>;
}

/**
 * Credentials resolved from a .conf file or remote entry.
 */
export interface RpcCredentials {
  host: string;
  port: number;
  user: string;
  password: string;
}

/**
 * Parsed values from a Verus/Komodo .conf file.
 */
export interface ConfValues {
  rpcuser?: string;
  rpcpassword?: string;
  rpcport?: string;
  rpchost?: string;
}

/**
 * Error categories for normalized daemon errors.
 */
export type ErrorCategory =
  | 'CONNECTION_FAILED'
  | 'AUTH_FAILED'
  | 'METHOD_NOT_FOUND'
  | 'INVALID_PARAMS'
  | 'INSUFFICIENT_FUNDS'
  | 'IDENTITY_NOT_FOUND'
  | 'CURRENCY_NOT_FOUND'
  | 'INVALID_ADDRESS'
  | 'INVALID_KEY'
  | 'DECRYPT_FAILED'
  | 'SPENDING_LIMIT_EXCEEDED'
  | 'WRITE_DISABLED'
  | 'RPC_ERROR';

/**
 * Spending limits config — currency name (case-insensitive) to max amount.
 */
export type SpendingLimitsConfig = Record<string, number>;

/**
 * Audit log entry for a write operation.
 */
export interface AuditEntry {
  timestamp: string;
  server: string;
  tool: string;
  chain: string;
  params: unknown;
  result: unknown;
  success: boolean;
}

/**
 * JSON-RPC request/response types.
 */
export interface RpcRequest {
  jsonrpc: '1.0';
  id: string;
  method: string;
  params: unknown[];
}

export interface RpcResponse<T = unknown> {
  result: T | null;
  error: { code: number; message: string } | null;
  id: string;
}
