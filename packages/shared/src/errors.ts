import type { ErrorCategory } from './types.js';

/**
 * Normalized error from Verus daemon RPC calls.
 *
 * Every error from the daemon (or from pre-RPC guards like spending limits)
 * is wrapped in this class with a machine-readable category.
 */
export class VerusError extends Error {
  readonly category: ErrorCategory;
  readonly code: number | undefined;
  readonly retryable: boolean;

  constructor(category: ErrorCategory, message: string, code?: number) {
    super(message);
    this.name = 'VerusError';
    this.category = category;
    this.code = code;
    this.retryable = RETRYABLE_CATEGORIES.has(category);
  }
}

const RETRYABLE_CATEGORIES = new Set<ErrorCategory>([
  'CONNECTION_FAILED',
]);

/**
 * Known daemon error codes mapped to categories.
 *
 * Bitcoin/Zcash/Verus JSON-RPC error codes:
 * -1:  general error
 * -5:  invalid address or key not found (identity/currency not found)
 * -6:  insufficient funds
 * -8:  invalid parameter
 * -32601: method not found
 */
const CODE_TO_CATEGORY: Record<number, ErrorCategory> = {
  [-32601]: 'METHOD_NOT_FOUND',
  [-8]: 'INVALID_PARAMS',
  [-6]: 'INSUFFICIENT_FUNDS',
};

/**
 * Message patterns for errors where the code alone isn't specific enough.
 * Checked in order — first match wins.
 */
const MESSAGE_PATTERNS: Array<{ pattern: RegExp; category: ErrorCategory }> = [
  { pattern: /identity.*not found/i, category: 'IDENTITY_NOT_FOUND' },
  { pattern: /cannot find.*identity/i, category: 'IDENTITY_NOT_FOUND' },
  { pattern: /no such identity/i, category: 'IDENTITY_NOT_FOUND' },
  { pattern: /currency.*not found/i, category: 'CURRENCY_NOT_FOUND' },
  { pattern: /cannot find.*currency/i, category: 'CURRENCY_NOT_FOUND' },
  { pattern: /no such currency/i, category: 'CURRENCY_NOT_FOUND' },
  { pattern: /insufficient funds/i, category: 'INSUFFICIENT_FUNDS' },
  { pattern: /invalid.*param/i, category: 'INVALID_PARAMS' },
];

/**
 * Normalize a daemon RPC error into a VerusError.
 *
 * @param code - The JSON-RPC error code from the daemon
 * @param message - The error message from the daemon
 */
export function normalizeRpcError(code: number, message: string): VerusError {
  // Check code-based mapping first
  const codeCategory = CODE_TO_CATEGORY[code];
  if (codeCategory) {
    return new VerusError(codeCategory, message, code);
  }

  // Identity not found uses code -5 in some daemon versions
  if (code === -5) {
    // -5 can mean identity not found OR currency not found — check message
    for (const { pattern, category } of MESSAGE_PATTERNS) {
      if (pattern.test(message)) {
        return new VerusError(category, message, code);
      }
    }
    // Default -5 to identity not found (most common case)
    return new VerusError('IDENTITY_NOT_FOUND', message, code);
  }

  // Check message patterns for any code
  for (const { pattern, category } of MESSAGE_PATTERNS) {
    if (pattern.test(message)) {
      return new VerusError(category, message, code);
    }
  }

  // Fallback — preserve original message
  return new VerusError('RPC_ERROR', message, code);
}

/**
 * Create a CONNECTION_FAILED error from a network-level failure.
 */
export function connectionError(chain: string, cause?: Error): VerusError {
  const detail = cause ? `: ${cause.message}` : '';
  return new VerusError(
    'CONNECTION_FAILED',
    `Cannot connect to ${chain} daemon${detail}`,
  );
}

/**
 * Create an AUTH_FAILED error.
 */
export function authError(chain: string): VerusError {
  return new VerusError(
    'AUTH_FAILED',
    `Authentication failed for ${chain} — check rpcuser/rpcpassword in .conf file`,
  );
}
