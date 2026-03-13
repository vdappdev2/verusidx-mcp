import { readFileSync } from 'node:fs';
import type { ConfValues } from './types.js';

/**
 * Parse a Verus/Komodo .conf file for RPC credentials and port.
 *
 * Format: key=value lines, # comments, no sections.
 * Returns null if the file cannot be read.
 */
export function parseConfFile(confPath: string): ConfValues | null {
  let content: string;
  try {
    content = readFileSync(confPath, 'utf-8');
  } catch {
    return null;
  }

  const values: ConfValues = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();

    switch (key) {
      case 'rpcuser':
        values.rpcuser = value;
        break;
      case 'rpcpassword':
        values.rpcpassword = value;
        break;
      case 'rpcport':
        values.rpcport = value;
        break;
      case 'rpchost':
        values.rpchost = value;
        break;
    }
  }

  return values;
}
