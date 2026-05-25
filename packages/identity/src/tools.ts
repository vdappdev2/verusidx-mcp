import { z } from 'zod';
import { mkdirSync, writeFileSync, readFileSync, unlinkSync, readdirSync, rmdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  rpcCall,
  auditLog,
  isReadOnly,
  assertWriteEnabled,
  VerusError,
  getCommitmentsDir,
} from '@verusidx/shared';

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function ok(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

function fail(category: string, message: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: category, message }, null, 2) }],
    isError: true as const,
  };
}

function handleError(err: unknown) {
  if (err instanceof VerusError) {
    return fail(err.category, err.message);
  }
  return fail('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
}

// ---------------------------------------------------------------------------
// Commitment file helpers
// ---------------------------------------------------------------------------

function getCommitmentPath(chain: string, name: string): string {
  return join(getCommitmentsDir(), chain, `${name}.json`);
}

function saveCommitment(chain: string, name: string, data: unknown): void {
  const filePath = getCommitmentPath(chain, name);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify({ ...data as Record<string, unknown>, savedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
}

function loadCommitment(chain: string, name: string): Record<string, unknown> | null {
  const filePath = getCommitmentPath(chain, name);
  try {
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function deleteCommitment(chain: string, name: string): void {
  const filePath = getCommitmentPath(chain, name);
  try { unlinkSync(filePath); } catch { /* ignore */ }

  const chainDir = dirname(filePath);
  try {
    const remaining = readdirSync(chainDir);
    if (remaining.length === 0) rmdirSync(chainDir);
  } catch { /* ignore */ }

  const commitmentsDir = getCommitmentsDir();
  try {
    const remaining = readdirSync(commitmentsDir);
    if (remaining.length === 0) rmdirSync(commitmentsDir);
  } catch { /* ignore */ }
}

const SERVER_NAME = 'verusidx-identity-mcp';

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerTools(server: McpServer): void {
  server.tool(
    'getidentity',
    'Look up a VerusID by name or i-address.',
    {
      chain: z.string().describe('Chain to query (e.g., "VRSC")'),
      identity: z.string().describe('VerusID name or i-address'),
      height: z.number().optional(),
      txproof: z.boolean().optional(),
      txproofheight: z.number().optional(),
    },
    async ({ chain, identity, height, txproof, txproofheight }) => {
      try {
        const params: unknown[] = [identity];
        if (height !== undefined) params.push(height);
        const result = await rpcCall(chain, 'getidentity', params);
        return ok(result);
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.tool(
    'register_name_commitment',
    'Step 1: Commit a VerusID name to the blockchain. This saves the salt locally for Step 2.',
    {
      chain: z.string(),
      name: z.string(),
      controladdress: z.string().optional(),
      referralidentity: z.string().optional(),
      parentnameorid: z.string().optional(),
      sourceoffunds: z.string().optional(),
    },
    async ({ chain, name, controladdress, referralidentity, parentnameorid, sourceoffunds }) => {
      try {
        assertWriteEnabled();
        const params: unknown[] = [name];
        if (controladdress) params.push(controladdress);
        if (referralidentity) params.push(referralidentity);
        if (parentnameorid) params.push(parentnameorid);
        if (sourceoffunds) params.push(sourceoffunds);

        const result = await rpcCall(chain, 'registernamecommitment', params);
        saveCommitment(chain, name, result);
        return ok(result);
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.tool(
    'register_identity',
    'Step 2: Finalise VerusID registration using the locally saved salt from Step 1.',
    {
      chain: z.string(),
      jsonidregistration: z.any(),
      returntx: z.boolean().optional(),
      feeoffer: z.number().optional(),
      sourceoffunds: z.string().optional(),
    },
    async ({ chain, jsonidregistration, returntx, feeoffer, sourceoffunds }) => {
      try {
        assertWriteEnabled();

        const reg = jsonidregistration as Record<string, unknown>;
        const nameRes = reg.namereservation as Record<string, unknown> | undefined;
        const idName = nameRes?.name as string | undefined;

        // ✅ VANGUARD FIX: Merge salt from local disk
        if (idName) {
          const saved = loadCommitment(chain, idName);
          if (saved) {
            const savedRes = (saved as any).namereservation;
            reg.txid = (saved as any).txid;
            reg.namereservation = {
              ...nameRes,
              name: savedRes.name,
              salt: savedRes.salt,
            };
          }
        }

        const params: unknown[] = [reg];
        if (returntx !== undefined) params.push(returntx);
        if (feeoffer !== undefined) params.push(feeoffer);
        if (sourceoffunds !== undefined) params.push(sourceoffunds);

        const result = await rpcCall(chain, 'registeridentity', params);
        if (idName && !returntx) deleteCommitment(chain, idName);
        return ok(result);
      } catch (err) {
        return handleError(err);
      }
    },
  );
}
