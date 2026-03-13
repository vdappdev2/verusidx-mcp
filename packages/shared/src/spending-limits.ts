import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { getSpendingLimitsPath } from './platform.js';
import { VerusError } from './errors.js';
import type { SpendingLimitsConfig } from './types.js';

/**
 * Spending limits — pre-RPC guard that prevents transactions exceeding
 * configured per-currency limits.
 *
 * Config file: spending-limits.json (location OS-specific, or VERUSIDX_SPENDING_LIMITS_PATH)
 * Format: { "VRSC": 50, "BTC": 0.01, "Bridge.vETH": 0.1 }
 * Currency name matching is case-insensitive (Verus names are case-insensitive on-chain).
 *
 * If the file doesn't exist, ensureSpendingLimitsFile() creates it with safe
 * defaults on first run. Users can edit or delete it to adjust limits.
 */

/** Default spending limits created on first run. */
const DEFAULT_LIMITS: SpendingLimitsConfig = {
  VRSC: 10,
};

let cachedLimits: Map<string, number> | null = null;
let cachedPath: string | null = null;

/**
 * Load spending limits from the config file.
 * Returns an empty map if the file doesn't exist.
 */
function loadLimits(): Map<string, number> {
  const path = getSpendingLimitsPath();

  // Return cached if same path (limits don't change at runtime)
  if (cachedLimits && cachedPath === path) return cachedLimits;

  const limits = new Map<string, number>();

  try {
    const content = readFileSync(path, 'utf-8');
    const config = JSON.parse(content) as SpendingLimitsConfig;

    for (const [currency, limit] of Object.entries(config)) {
      if (typeof limit === 'number' && limit >= 0) {
        limits.set(currency.toLowerCase(), limit);
      }
    }
  } catch {
    // File doesn't exist or is invalid — no limits enforced
  }

  cachedLimits = limits;
  cachedPath = path;
  return limits;
}

/**
 * Get the configured spending limit for a currency.
 * Returns undefined if no limit is configured (uncapped).
 */
export function getSpendingLimit(currency: string): number | undefined {
  const limits = loadLimits();
  return limits.get(currency.toLowerCase());
}

/**
 * Check a set of currency amounts against spending limits.
 * Throws SPENDING_LIMIT_EXCEEDED if any limit is exceeded.
 *
 * @param amounts - Map of currency name to total amount being spent/offered
 */
export function checkSpendingLimits(amounts: Map<string, number>): void {
  const limits = loadLimits();
  if (limits.size === 0) return; // No limits configured

  for (const [currency, amount] of amounts) {
    const limit = limits.get(currency.toLowerCase());
    if (limit !== undefined && amount > limit) {
      throw new VerusError(
        'SPENDING_LIMIT_EXCEEDED',
        `Amount ${amount} ${currency} exceeds configured spending limit of ${limit} ${currency}`,
      );
    }
  }
}

/**
 * Extract and sum currency amounts from sendcurrency outputs.
 * Returns a map of currency name → total amount.
 *
 * Handles multi-output sends by summing per currency.
 */
export function sumOutputAmounts(
  outputs: Array<{ currency?: string; amount?: number }>,
): Map<string, number> {
  const sums = new Map<string, number>();

  for (const output of outputs) {
    const currency = output.currency;
    const amount = output.amount;
    if (!currency || typeof amount !== 'number' || amount <= 0) continue;

    const current = sums.get(currency) ?? 0;
    sums.set(currency, current + amount);
  }

  return sums;
}

/**
 * Ensure the spending limits file exists. If it doesn't, create it with
 * safe defaults so users have a safety net out of the box.
 *
 * Call this on startup from any MCP server that enforces spending limits.
 * Only writes if the file doesn't already exist — never overwrites user config.
 */
export function ensureSpendingLimitsFile(): void {
  const limitsPath = getSpendingLimitsPath();
  if (existsSync(limitsPath)) return;

  try {
    mkdirSync(dirname(limitsPath), { recursive: true });
    const content = JSON.stringify(DEFAULT_LIMITS, null, 2) + '\n';
    writeFileSync(limitsPath, content, { mode: 0o600 });
  } catch {
    // Best-effort — don't break startup if we can't write
  }
}

/**
 * Clear the cached spending limits (for testing or config reload).
 */
export function clearSpendingLimitsCache(): void {
  cachedLimits = null;
  cachedPath = null;
}
