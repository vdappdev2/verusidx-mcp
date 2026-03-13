import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getAuditDir } from './platform.js';
import type { AuditEntry } from './types.js';

/**
 * Date-stamped append-only audit logger for write operations.
 *
 * Each day gets a new JSONL file (e.g., 2026-03-11.jsonl).
 * Files are created with 0600 permissions since params may contain
 * addresses/amounts. Retention is the operator's responsibility.
 *
 * Disabled with VERUSIDX_AUDIT_LOG=false.
 */

function isAuditEnabled(): boolean {
  return process.env.VERUSIDX_AUDIT_LOG !== 'false';
}

function getTodayFilename(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}.jsonl`;
}

/**
 * Log a write operation to the audit trail.
 *
 * Called by MCP server tool handlers after a write operation completes
 * (success or failure). Read-only operations are not logged.
 */
export function auditLog(entry: Omit<AuditEntry, 'timestamp'>): void {
  if (!isAuditEnabled()) return;

  const auditDir = getAuditDir();
  const filePath = join(auditDir, getTodayFilename());

  const fullEntry: AuditEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };

  try {
    mkdirSync(auditDir, { recursive: true, mode: 0o700 });
    appendFileSync(filePath, JSON.stringify(fullEntry) + '\n', { mode: 0o600 });
  } catch {
    // Audit logging is best-effort — don't let a logging failure
    // break the actual operation. Write to stderr so it's visible.
    process.stderr.write(
      `verusidx-mcp: audit log write failed for ${filePath}\n`,
    );
  }
}
