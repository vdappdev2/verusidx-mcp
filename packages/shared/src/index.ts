// Types
export type {
  LocalChainEntry,
  RemoteChainEntry,
  ChainEntry,
  ChainRegistry,
  RpcCredentials,
  ConfValues,
  ErrorCategory,
  SpendingLimitsConfig,
  AuditEntry,
  RpcRequest,
  RpcResponse,
} from './types.js';
export { isLocalChain, isRemoteChain } from './types.js';

// Platform
export {
  getChainDataDir,
  getPbaasDir,
  getChainConfPath,
  getConfigDir,
  getRegistryPath,
  getSpendingLimitsPath,
  getAuditDir,
  getCommitmentsDir,
  getVerusdDefaultPaths,
} from './platform.js';

// Conf parser
export { parseConfFile } from './conf-parser.js';

// Errors
export { VerusError, normalizeRpcError, connectionError, authError } from './errors.js';

// Registry
export { RegistryReader, writeRegistry } from './registry.js';

// RPC client
export { rpcCall, setRegistryReader, clearCredentialCache } from './rpc-client.js';

// Audit logger
export { auditLog } from './audit-logger.js';

// Spending limits
export {
  getSpendingLimit,
  checkSpendingLimits,
  sumOutputAmounts,
  ensureSpendingLimitsFile,
  clearSpendingLimitsCache,
} from './spending-limits.js';

// Read-only guard
export { isReadOnly, assertWriteEnabled } from './read-only-guard.js';
