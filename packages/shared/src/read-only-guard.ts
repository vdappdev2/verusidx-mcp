import { VerusError } from './errors.js';

/**
 * Check if the server is running in read-only mode.
 */
export function isReadOnly(): boolean {
  return process.env.VERUSIDX_READ_ONLY === 'true';
}

/**
 * Guard function for write tools. Call at the start of any write tool handler.
 * Throws a WRITE_DISABLED VerusError if read-only mode is active.
 *
 * This catches stale client tool lists — if a client cached the tool list
 * before read-only mode was enabled, it may try to call a write tool that
 * should no longer be available.
 */
export function assertWriteEnabled(): void {
  if (isReadOnly()) {
    throw new VerusError(
      'WRITE_DISABLED',
      'This server is running in read-only mode (VERUSIDX_READ_ONLY=true). Write tools are not available.',
    );
  }
}
