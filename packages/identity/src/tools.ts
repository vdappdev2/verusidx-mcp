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

  // Clean up empty chain directory
  const chainDir = dirname(filePath);
  try {
    const remaining = readdirSync(chainDir);
    if (remaining.length === 0) rmdirSync(chainDir);
  } catch { /* ignore */ }

  // Clean up empty commitments directory
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
  // ------ Read-only tools (always registered) ------

  server.tool(
    'getidentity',
    'Look up a VerusID by name or i-address. Returns the identity\'s current state including primary addresses, signing authorities, content data (contentmultimap), revocation/recovery authorities, and wallet relationship (canspendfor/cansignfor). Optionally retrieve the identity as it existed at a specific block height. Use this to check if an identity exists, inspect its configuration, or verify wallet authority before performing write operations.',
    {
      chain: z.string().describe('Chain to query (e.g., "VRSC", "vrsctest")'),
      identity: z.string().describe('VerusID name (e.g., "alice@") or i-address'),
      height: z.number().optional().describe('Return identity as of this block height. Default: current height. Pass -1 to include mempool.'),
      txproof: z.boolean().optional().describe('If true, returns a proof of the identity. Default: false.'),
      txproofheight: z.number().optional().describe('Height from which to generate the proof. Default: same as height.'),
    },
    async ({ chain, identity, height, txproof, txproofheight }) => {
      try {
        const params: unknown[] = [identity];
        if (height !== undefined || txproof !== undefined || txproofheight !== undefined) {
          params.push(height ?? 0);
        }
        if (txproof !== undefined || txproofheight !== undefined) {
          params.push(txproof ?? false);
        }
        if (txproofheight !== undefined) {
          params.push(txproofheight);
        }
        const result = await rpcCall(chain, 'getidentity', params);
        return ok(result);
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.tool(
    'getidentitycontent',
    'Get identity content/data with optional VDXF key filter and height range. Returns the cumulative content state — all content across all updates within the specified range. Unlike getidentityhistory, this does not return per-revision snapshots. Use this to read structured data stored on an identity (profiles, timestamps, application data) without needing to process the full revision history.',
    {
      chain: z.string().describe('Chain to query (e.g., "VRSC", "vrsctest")'),
      identity: z.string().describe('VerusID name (e.g., "alice@") or i-address'),
      heightstart: z.number().optional().describe('Only return content from this height forward (inclusive). Default: 0.'),
      heightend: z.number().optional().describe('Only return content up to this height (inclusive). Default: 0 (max height). Pass -1 to include mempool.'),
      txproofs: z.boolean().optional().describe('If true, returns proofs. Default: false.'),
      txproofheight: z.number().optional().describe('Height from which to generate proofs.'),
      vdxfkey: z.string().optional().describe('Filter to a specific VDXF key. The key is automatically bound to the identity and multimap key.'),
      keepdeleted: z.boolean().optional().describe('If true, include deleted items. Default: false.'),
    },
    async ({ chain, identity, heightstart, heightend, txproofs, txproofheight, vdxfkey, keepdeleted }) => {
      try {
        // getidentitycontent identity heightstart heightend txproofs txproofheight vdxfkey keepdeleted
        const params: unknown[] = [identity];
        params.push(heightstart ?? 0);
        params.push(heightend ?? 0);
        params.push(txproofs ?? false);
        params.push(txproofheight ?? 0);
        if (vdxfkey !== undefined || keepdeleted !== undefined) {
          params.push(vdxfkey ?? '');
        }
        if (keepdeleted !== undefined) {
          params.push(keepdeleted);
        }
        const result = await rpcCall(chain, 'getidentitycontent', params);
        return ok(result);
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.tool(
    'getidentityhistory',
    'Get the full revision history of a VerusID. Returns an array of identity snapshots, one per update transaction. Each entry shows the identity state as it was set in that specific transaction, along with the block hash, height, and transaction details. Use this to audit changes to an identity over time — primary address changes (transfers), content updates, authority changes, etc. Note: each history entry\'s contentmultimap shows only the content set in that specific update, not the cumulative state.',
    {
      chain: z.string().describe('Chain to query (e.g., "VRSC", "vrsctest")'),
      identity: z.string().describe('VerusID name (e.g., "alice@") or i-address'),
      heightstart: z.number().optional().describe('Only return history from this height forward (inclusive). Default: 0.'),
      heightend: z.number().optional().describe('Only return history up to this height (inclusive). Default: 0 (max height). Pass -1 to include mempool.'),
      txproofs: z.boolean().optional().describe('If true, returns proofs. Default: false.'),
      txproofheight: z.number().optional().describe('Height from which to generate proofs.'),
    },
    async ({ chain, identity, heightstart, heightend, txproofs, txproofheight }) => {
      try {
        const params: unknown[] = [identity];
        params.push(heightstart ?? 0);
        params.push(heightend ?? 0);
        params.push(txproofs ?? false);
        if (txproofheight !== undefined) {
          params.push(txproofheight);
        }
        const result = await rpcCall(chain, 'getidentityhistory', params);
        return ok(result);
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.tool(
    'getvdxfid',
    'Get the VDXF key ID from a URI string. Converts a human-readable VDXF URI (e.g., "vrsc::system.currency.export") into its on-chain i-address representation. Optionally combine with additional data (another VDXF key, a 256-bit hash, or an index number) to derive bound keys. Use this to resolve VDXF key names to i-addresses before querying getidentitycontent with a vdxfkey filter.',
    {
      chain: z.string().describe('Chain to query (e.g., "VRSC", "vrsctest")'),
      vdxfuri: z.string().describe('VDXF URI string (e.g., "vrsc::system.currency.export", "idname::userdefinedgroup.subgroup.name")'),
      vdxfkey: z.string().optional().describe('VDXF key or i-address to combine via hash'),
      uint256: z.string().optional().describe('256-bit hex hash to combine with the key'),
      indexnum: z.number().optional().describe('Integer to combine with the key'),
    },
    async ({ chain, vdxfuri, vdxfkey, uint256, indexnum }) => {
      try {
        // getvdxfid "vdxfuri" '{"vdxfkey":..., "uint256":..., "indexnum":...}'
        const params: unknown[] = [vdxfuri];
        if (vdxfkey !== undefined || uint256 !== undefined || indexnum !== undefined) {
          const bindObj: Record<string, unknown> = {};
          if (vdxfkey !== undefined) bindObj.vdxfkey = vdxfkey;
          if (uint256 !== undefined) bindObj.uint256 = uint256;
          if (indexnum !== undefined) bindObj.indexnum = indexnum;
          params.push(bindObj);
        }
        const result = await rpcCall(chain, 'getvdxfid', params);
        return ok(result);
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.tool(
    'listidentities',
    'List VerusIDs in the local wallet. Returns all identities that this wallet can spend for, sign for, or watch. Use this to discover which identities are available before performing identity operations. By default includes identities we can spend for and sign for, but not watch-only.',
    {
      chain: z.string().describe('Chain to query (e.g., "VRSC", "vrsctest")'),
      includecanspend: z.boolean().optional().describe('Include identities we can spend/authorize for. Default: true.'),
      includecansign: z.boolean().optional().describe('Include identities we can only sign for but not spend. Default: true.'),
      includewatchonly: z.boolean().optional().describe('Include identities we can neither sign nor spend, but are watched or are co-signers. Default: false.'),
    },
    async ({ chain, includecanspend, includecansign, includewatchonly }) => {
      try {
        // listidentities (includecanspend) (includecansign) (includewatchonly)
        const params: unknown[] = [];
        if (includecanspend !== undefined || includecansign !== undefined || includewatchonly !== undefined) {
          params.push(includecanspend ?? true);
        }
        if (includecansign !== undefined || includewatchonly !== undefined) {
          params.push(includecansign ?? true);
        }
        if (includewatchonly !== undefined) {
          params.push(includewatchonly);
        }
        const result = await rpcCall(chain, 'listidentities', params);
        return ok(result);
      } catch (err) {
        return handleError(err);
      }
    },
  );

  // ------ Write tools (registered only when not read-only) ------

  if (!isReadOnly()) {
    server.tool(
      'registernamecommitment',
      'Step 1 of identity registration. Creates a name commitment transaction that reserves a name without revealing it. The commitment hides the name itself while ensuring miners cannot front-run the registration. After this tool succeeds, wait 1 block before calling registeridentity (step 2). The commitment data is saved to disk so it persists across conversations — if a session ends before registration, the next session can pick up the commitment. Names must not have leading, trailing, or multiple consecutive spaces and must not include: \\ / : * ? " < > | @',
      {
        chain: z.string().describe('Chain to register on (e.g., "VRSC", "vrsctest")'),
        name: z.string().describe('The unique name to commit to. Creating a commitment is not a registration — if the name already exists, the daemon will reject the transaction.'),
        controladdress: z.string().describe('Address that will control this commitment. Must be present in the current wallet. This is not necessarily the address that will control the actual identity.'),
        referralidentity: z.string().optional().describe('Friendly name or i-address of a referral identity, used to lower network cost of the ID.'),
        parentnameorid: z.string().optional().describe('Parent name or currency i-address. Dictates issuance rules and pricing. Only for PBaaS sub-identities.'),
        sourceoffunds: z.string().optional().describe('Source address for funds. If the user has not specified a preferred address, ask which address to use or if they prefer a wildcard ("*", "R*", "i*"). Sub-ID creation requires a transparent address.'),
      },
      async ({ chain, name, controladdress, referralidentity, parentnameorid, sourceoffunds }) => {
        try {
          assertWriteEnabled();

          // registernamecommitment "name" "controladdress" ("referralidentity") ("parentnameorid") ("sourceoffunds")
          const params: unknown[] = [name, controladdress];
          if (referralidentity !== undefined || parentnameorid !== undefined || sourceoffunds !== undefined) {
            params.push(referralidentity ?? '');
          }
          if (parentnameorid !== undefined || sourceoffunds !== undefined) {
            params.push(parentnameorid ?? '');
          }
          if (sourceoffunds !== undefined) {
            params.push(sourceoffunds);
          }

          const result = await rpcCall(chain, 'registernamecommitment', params);

          // Save commitment to disk for cross-session persistence
          saveCommitment(chain, name, result);

          auditLog({
            server: SERVER_NAME,
            tool: 'registernamecommitment',
            chain,
            params: { name, controladdress, referralidentity, parentnameorid },
            result,
            success: true,
          });

          return ok(result);
        } catch (err) {
          return handleError(err);
        }
      },
    );

    server.tool(
      'registeridentity',
      'Step 2 of identity registration. Uses a confirmed name commitment to register the identity on-chain. The commitment must have been mined (wait 1 block after registernamecommitment). The tool checks for saved commitment data from a previous registernamecommitment call — if available, the agent does not need to pass the commitment details manually. On successful registration, the saved commitment file is cleaned up. IDENTITY DEFINITION: Keep it minimal — only include fields you are explicitly setting to non-default values. Omit revocationauthority/recoveryauthority to default to self. TIMELOCK: Do NOT include timelock in the identity JSON unless you deliberately intend to set an absolute block height lock. Omitting timelock defaults to 0 (unlocked). To configure timelocks safely after registration, use setidentitytimelock which provides setunlockdelay and unlockatblock controls. Setting a timelock value here creates an absolute block height lock that CANNOT be removed by updateidentity — only by revoke+recover. Omit privateaddress unless explicitly assigning one. SAFETY: NEVER set revocationauthority to another identity while leaving recoveryauthority as self — if the identity is revoked by the external authority, it cannot recover itself (recovery requires the recovery authority to act, and a revoked identity cannot authorize its own recovery). This bricks the identity. If delegating revocation, always also delegate recovery to a different identity. POSITIONAL PARAMS: The daemon RPC is positional: registeridentity jsonidregistration (returntx) (feeoffer) (sourceoffunds). If passing sourceoffunds, you must also fill returntx and feeoffer. FEE DISCOVERY: Call getcurrency (chain-mcp) on the parent currency to find idregistrationfees. For basket currencies, if idimportfees is a satoshi-scale value it encodes a reserve currency index: 0.00000000 = first reserve (index 0), 0.00000001 = second reserve (index 1), etc. The idregistrationfees amount is then denominated in that reserve currency — calculate how much of the basket currency equals that amount at current conversion prices. Example: idregistrationfees=15 + idimportfees=0.00000001 (index 1=USD) means 15 USD worth of the basket currency. Default idimportfees (e.g., 0.02) means the fee is in the basket currency itself, but defaults may differ per chain — check getcurrency to verify. FEE SHORTCUT: If unsure of the exact fee (especially with reserve-denominated fees and referral discounts), pass feeoffer=0.00000001 — the daemon will reject and return the minimum required fee in the error message, then retry with that amount.',
      {
        chain: z.string().describe('Chain to register on (e.g., "VRSC", "vrsctest")'),
        jsonidregistration: z.record(z.unknown()).describe('Registration object containing: txid (from registernamecommitment), namereservation {name, salt, referral}, and identity definition {name, parent, primaryaddresses, minimumsignatures}. Only include revocationauthority/recoveryauthority if delegating to a DIFFERENT identity (defaults to self) — accepts friendly name (e.g., "alice@") or i-address. TIMELOCK: Do NOT include timelock unless you deliberately intend to set an absolute block height lock. An absolute lock CANNOT be removed by updateidentity — only by revoke+recover. If setting a timelock, ensure revocationauthority and recoveryauthority are set to identities that can perform the revoke+recover to remove it. Omit timelock to default to 0 (unlocked). Use setidentitytimelock after registration for safe timelock configuration. Omit privateaddress unless explicitly assigning one.'),
        returntx: z.boolean().optional().describe('If true, return the signed transaction hex instead of broadcasting. Default: false.'),
        feeoffer: z.number().optional().describe('Amount to offer miner/staker for the registration fee. Default: standard price.'),
        sourceoffunds: z.string().optional().describe('Source address for funds. If the user has not specified a preferred address, ask which address to use or if they prefer a wildcard ("*", "R*", "i*"). Sub-ID creation requires a transparent address.'),
      },
      async ({ chain, jsonidregistration, returntx, feeoffer, sourceoffunds }) => {
        try {
          assertWriteEnabled();

          // registeridentity jsonidregistration (returntx) (feeoffer) (sourceoffunds)
          const params: unknown[] = [jsonidregistration];
          if (returntx !== undefined || feeoffer !== undefined || sourceoffunds !== undefined) {
            params.push(returntx ?? false);
          }
          if (feeoffer !== undefined || sourceoffunds !== undefined) {
            params.push(feeoffer ?? 0);
          }
          if (sourceoffunds !== undefined) {
            params.push(sourceoffunds);
          }

          const result = await rpcCall(chain, 'registeridentity', params);

          // Clean up commitment file on success
          const idName = (jsonidregistration as Record<string, unknown>).namereservation
            ? ((jsonidregistration as Record<string, unknown>).namereservation as Record<string, unknown>).name as string
            : undefined;
          if (idName) {
            deleteCommitment(chain, idName);
          }

          auditLog({
            server: SERVER_NAME,
            tool: 'registeridentity',
            chain,
            params: { name: idName, returntx },
            result,
            success: true,
          });

          return ok(result);
        } catch (err) {
          return handleError(err);
        }
      },
    );

    server.tool(
      'updateidentity',
      'Update an identity\'s fields — primary addresses, content, authorities, or any other mutable property. The wallet must hold authority to update (either primary authority, or token authority if tokenupdate is true). Pass the full identity definition with the desired changes. Fields not included revert to defaults — to preserve existing values, first read them with getidentity and include them in the update. Always include "parent" in the identity definition. PRIVATEADDRESS BEHAVIOR: Omit privateaddress entirely to preserve the existing one (carried over). Pass null to clear/remove it. Include a new zs1... address to change it. Empty string "" does NOT clear — daemon treats it the same as omitting. TIMELOCK: Do NOT include timelock in the identity JSON unless you deliberately intend to set an absolute block height lock. An absolute lock CANNOT be removed by updateidentity — only by revoke+recover. If setting a timelock, ensure revocationauthority and recoveryauthority are set to identities that can perform the revoke+recover to remove it. Omit timelock entirely to preserve the current value. Setting timelock to 0 is ONLY valid when there is no active timelock — it will be rejected if any timelock (delay or absolute) is currently set. Use setidentitytimelock for safe timelock configuration. SAFETY: NEVER set revocationauthority to another identity while leaving recoveryauthority as self — if revoked by the external authority, the identity cannot recover itself (a revoked identity cannot authorize its own recovery). This bricks the identity. If delegating revocation, always also delegate recovery to a different identity.',
      {
        chain: z.string().describe('Chain to update on (e.g., "VRSC", "vrsctest")'),
        jsonidentity: z.record(z.unknown()).describe('New identity definition. Must include "name" at minimum. Always include "parent" to ensure correct namespace resolution. revocationauthority/recoveryauthority accept friendly name (e.g., "alice@") or i-address.'),
        returntx: z.boolean().optional().describe('If true, return signed transaction hex instead of broadcasting. Default: false.'),
        tokenupdate: z.boolean().optional().describe('If true, use the tokenized ID control token for authority. Default: false.'),
        feeoffer: z.number().optional().describe('Non-standard fee amount.'),
        sourceoffunds: z.string().optional().describe('Source address for funds. If the user has not specified a preferred address, ask which address to use or if they prefer a wildcard ("*", "R*", "i*", or "z*" for private txs).'),
      },
      async ({ chain, jsonidentity, returntx, tokenupdate, feeoffer, sourceoffunds }) => {
        try {
          assertWriteEnabled();

          // updateidentity jsonidentity (returntx) (tokenupdate) (feeoffer) (sourceoffunds)
          const params: unknown[] = [jsonidentity];
          if (returntx !== undefined || tokenupdate !== undefined || feeoffer !== undefined || sourceoffunds !== undefined) {
            params.push(returntx ?? false);
          }
          if (tokenupdate !== undefined || feeoffer !== undefined || sourceoffunds !== undefined) {
            params.push(tokenupdate ?? false);
          }
          if (feeoffer !== undefined || sourceoffunds !== undefined) {
            params.push(feeoffer ?? 0);
          }
          if (sourceoffunds !== undefined) {
            params.push(sourceoffunds);
          }

          const result = await rpcCall(chain, 'updateidentity', params);

          const idName = (jsonidentity as Record<string, unknown>).name as string | undefined;

          auditLog({
            server: SERVER_NAME,
            tool: 'updateidentity',
            chain,
            params: { name: idName, returntx, tokenupdate },
            result,
            success: true,
          });

          return ok(result);
        } catch (err) {
          return handleError(err);
        }
      },
    );

    server.tool(
      'revokeidentity',
      'Revoke an identity, making it unable to spend funds or sign transactions. Only the revocation authority (or token revocation authority) can perform this action. A revoked identity can only be restored by the recovery authority using recoveridentity. This is a safety mechanism — use it if the identity\'s private keys are compromised.',
      {
        chain: z.string().describe('Chain to revoke on (e.g., "VRSC", "vrsctest")'),
        identity: z.string().describe('VerusID name (e.g., "alice@") or i-address to revoke'),
        returntx: z.boolean().optional().describe('If true, return signed transaction hex instead of broadcasting. Default: false.'),
        tokenrevoke: z.boolean().optional().describe('If true, use the tokenized ID control token to revoke. Default: false.'),
        feeoffer: z.number().optional().describe('Non-standard fee amount.'),
        sourceoffunds: z.string().optional().describe('Source address for funds. If the user has not specified a preferred address, ask which address to use or if they prefer a wildcard ("*", "R*", "i*", or "z*" for private txs).'),
      },
      async ({ chain, identity, returntx, tokenrevoke, feeoffer, sourceoffunds }) => {
        try {
          assertWriteEnabled();

          // revokeidentity "identity" (returntx) (tokenrevoke) (feeoffer) (sourceoffunds)
          const params: unknown[] = [identity];
          if (returntx !== undefined || tokenrevoke !== undefined || feeoffer !== undefined || sourceoffunds !== undefined) {
            params.push(returntx ?? false);
          }
          if (tokenrevoke !== undefined || feeoffer !== undefined || sourceoffunds !== undefined) {
            params.push(tokenrevoke ?? false);
          }
          if (feeoffer !== undefined || sourceoffunds !== undefined) {
            params.push(feeoffer ?? 0);
          }
          if (sourceoffunds !== undefined) {
            params.push(sourceoffunds);
          }

          const result = await rpcCall(chain, 'revokeidentity', params);

          auditLog({
            server: SERVER_NAME,
            tool: 'revokeidentity',
            chain,
            params: { identity, returntx, tokenrevoke },
            result,
            success: true,
          });

          return ok(result);
        } catch (err) {
          return handleError(err);
        }
      },
    );

    server.tool(
      'recoveridentity',
      'Recover a revoked or compromised identity. Only the recovery authority (or token recovery authority) can perform this. Typically used to set new primary addresses after a key compromise, effectively transferring control to new keys. Pass the full identity definition with the desired recovery state (new primary addresses, etc.). Always include "parent" in the identity definition. PRIVATEADDRESS BEHAVIOR: Omit privateaddress entirely to preserve the existing one (carried over). Pass null to clear/remove it. Include a new zs1... address to change it. Empty string "" does NOT clear — daemon treats it the same as omitting. TIMELOCK: Do NOT include timelock in the identity JSON unless you deliberately intend to set an absolute block height lock or clear an existing one. Omitting timelock resets it to 0 (unlocked) — timelock does NOT carry over like privateaddress does. To clear a timelock via recovery, simply omit the timelock field. If setting a timelock value, ensure revocationauthority and recoveryauthority are set to identities that can perform a future revoke+recover to remove it, since absolute locks CANNOT be removed by updateidentity. Use setidentitytimelock after recovery for safe timelock configuration. SAFETY: When setting new authorities during recovery, NEVER set revocationauthority to another identity while leaving recoveryauthority as self — if later revoked by the external authority, the identity cannot recover itself. This bricks the identity. If delegating revocation, always also delegate recovery to a different identity.',
      {
        chain: z.string().describe('Chain to recover on (e.g., "VRSC", "vrsctest")'),
        jsonidentity: z.record(z.unknown()).describe('New identity definition for the recovered state. Always include "parent" for correct namespace resolution. revocationauthority/recoveryauthority accept friendly name (e.g., "alice@") or i-address.'),
        returntx: z.boolean().optional().describe('If true, return signed transaction hex instead of broadcasting. Default: false.'),
        tokenrecover: z.boolean().optional().describe('If true, use the tokenized ID control token to recover. Default: false.'),
        feeoffer: z.number().optional().describe('Non-standard fee amount.'),
        sourceoffunds: z.string().optional().describe('Source address for funds. If the user has not specified a preferred address, ask which address to use or if they prefer a wildcard ("*", "R*", "i*", or "z*" for private txs).'),
      },
      async ({ chain, jsonidentity, returntx, tokenrecover, feeoffer, sourceoffunds }) => {
        try {
          assertWriteEnabled();

          // recoveridentity jsonidentity (returntx) (tokenrecover) (feeoffer) (sourceoffunds)
          const params: unknown[] = [jsonidentity];
          if (returntx !== undefined || tokenrecover !== undefined || feeoffer !== undefined || sourceoffunds !== undefined) {
            params.push(returntx ?? false);
          }
          if (tokenrecover !== undefined || feeoffer !== undefined || sourceoffunds !== undefined) {
            params.push(tokenrecover ?? false);
          }
          if (feeoffer !== undefined || sourceoffunds !== undefined) {
            params.push(feeoffer ?? 0);
          }
          if (sourceoffunds !== undefined) {
            params.push(sourceoffunds);
          }

          const result = await rpcCall(chain, 'recoveridentity', params);

          const idName = (jsonidentity as Record<string, unknown>).name as string | undefined;

          auditLog({
            server: SERVER_NAME,
            tool: 'recoveridentity',
            chain,
            params: { name: idName, returntx, tokenrecover },
            result,
            success: true,
          });

          return ok(result);
        } catch (err) {
          return handleError(err);
        }
      },
    );

    server.tool(
      'setidentitytimelock',
      'Set or modify a timelock on a VerusID. Timelocking restricts when an identity can spend funds on this chain. This only affects the identity on the current chain. Two modes:\n\n- setunlockdelay: Set a delay (in blocks) that must pass after an unlock request. Sets flags=2 (delay lock active), timelock=N (the delay in blocks). The identity cannot spend until an unlock is triggered and the delay passes.\n\n- unlockatblock: Set an absolute block height at which the identity unlocks. When used with unlockatblock=0 on a delay-locked identity (flags=2), it TRIGGERS the unlock countdown — the daemon converts the delay into an absolute block height (approximately current_block + delay) and clears the delay flag. This is the standard way to initiate unlocking a delay-locked identity. unlockatblock=0 does NOT work on absolute block height locks (flags=0, timelock > 0) — those can only be removed by revoke+recover.\n\nExactly one of unlockatblock or setunlockdelay must be specified.\n\nTIMELOCK WORKFLOW: 1) Set delay: setunlockdelay=N → identity locked with N-block delay. 2) Trigger unlock: unlockatblock=0 → countdown starts, identity unlocks at ~current_block+N. 3) Wait for block to pass. 4) Identity can spend again. To cancel a countdown (e.g., attacker triggered unlock), the revocation authority can revoke — revocation destroys the countdown entirely. Then recover to restore the identity with no timelock.\n\nREMOVING TIMELOCKS: Delay locks (flags=2) can be cleared by revoke+recover (omit timelock in recovery JSON). Absolute locks (flags=0, timelock > 0) can ONLY be cleared by revoke+recover. updateidentity CANNOT modify or remove any timelock once set.',
      {
        chain: z.string().describe('Chain to set timelock on (e.g., "VRSC", "vrsctest")'),
        identity: z.string().describe('VerusID name (e.g., "alice@") or i-address'),
        unlockatblock: z.number().optional().describe('Absolute block height to unlock at. Mutually exclusive with setunlockdelay.'),
        setunlockdelay: z.number().optional().describe('Number of blocks to delay after unlock request. Mutually exclusive with unlockatblock.'),
        returntx: z.boolean().optional().describe('If true, return signed transaction hex instead of broadcasting. Default: false.'),
        feeoffer: z.number().optional().describe('Non-standard fee amount.'),
        sourceoffunds: z.string().optional().describe('Source address for funds. If the user has not specified a preferred address, ask which address to use or if they prefer a wildcard ("*", "R*", "i*", or "z*" for private txs).'),
      },
      async ({ chain, identity, unlockatblock, setunlockdelay, returntx, feeoffer, sourceoffunds }) => {
        try {
          assertWriteEnabled();

          if (unlockatblock === undefined && setunlockdelay === undefined) {
            return fail('INVALID_PARAMS', 'Exactly one of unlockatblock or setunlockdelay must be specified.');
          }
          if (unlockatblock !== undefined && setunlockdelay !== undefined) {
            return fail('INVALID_PARAMS', 'unlockatblock and setunlockdelay are mutually exclusive — specify only one.');
          }

          // setidentitytimelock "identity" (unlockatblock | setunlockdelay) (returntx) (feeoffer) (sourceoffunds)
          const timelockObj: Record<string, unknown> = {};
          if (unlockatblock !== undefined) timelockObj.unlockatblock = unlockatblock;
          if (setunlockdelay !== undefined) timelockObj.setunlockdelay = setunlockdelay;

          const params: unknown[] = [identity, timelockObj];
          if (returntx !== undefined || feeoffer !== undefined || sourceoffunds !== undefined) {
            params.push(returntx ?? false);
          }
          if (feeoffer !== undefined || sourceoffunds !== undefined) {
            params.push(feeoffer ?? 0);
          }
          if (sourceoffunds !== undefined) {
            params.push(sourceoffunds);
          }

          const result = await rpcCall(chain, 'setidentitytimelock', params);

          auditLog({
            server: SERVER_NAME,
            tool: 'setidentitytimelock',
            chain,
            params: { identity, unlockatblock, setunlockdelay, returntx },
            result,
            success: true,
          });

          return ok(result);
        } catch (err) {
          return handleError(err);
        }
      },
    );
  }
}
