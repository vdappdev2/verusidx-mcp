import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  rpcCall,
  auditLog,
  isReadOnly,
  assertWriteEnabled,
  VerusError,
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

const SERVER_NAME = 'verusidx-definecurrency-mcp';

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerTools(server: McpServer): void {
  // definecurrency is write-only — no tools registered in read-only mode

  if (!isReadOnly()) {
    server.tool(
      'definecurrency',
      'Define a new currency on the blockchain. Creates a signed transaction that defines the currency — the transaction is NOT broadcast automatically. The returned hex must be sent via sendrawtransaction (in chain-mcp) to actually launch the currency. Supports simple tokens (options: 32), fractional basket currencies (options: 33), centralized tokens (proofprotocol: 2), ID control tokens (options: 2080), and Ethereum ERC-20 mapped tokens (proofprotocol: 3). A VerusID with the same name must exist, be controlled by the wallet, and have sufficient funds to pay the definition fee. Only root IDs can define currencies (except ID control tokens, which subIDs can also define). After broadcasting, wait for the preconversion timeframe (minimum 20 blocks), then verify with getcurrency (chain-mcp). FEE DISCOVERY: Call getcurrency (chain-mcp) on the chain\'s own currency (e.g., "VRSC" or the PBaaS chain name). Regular currencies cost currencyregistrationfee (e.g., 200 VRSC on mainnet). ID control tokens (options: 2080) cost much less — the chain\'s idimportfees value (e.g., 0.02 VRSC on mainnet). The defining ID must hold these funds.',
      {
        chain: z.string().describe('Chain to define the currency on (e.g., "VRSC", "vrsctest")'),
        definition: z.record(z.unknown()).describe('Currency definition object. Required fields: name (string, must match an existing VerusID), options (number, bitfield — 32=token, 33=basket, 2080=ID control token). Optional fields: proofprotocol (1=decentralized, 2=centralized, 3=ERC-20), currencies (string[], reserve currencies), weights (number[], must sum to 1.0), conversions (number[], preconversion prices), initialsupply (number, required for baskets), preallocations (object[]), initialcontributions (number[]), minpreconversion (number[]), maxpreconversion (number[]), prelaunchcarveout (number), prelaunchdiscount (number), idregistrationfees (number), idreferrallevels (number), idimportfees (number), startblock (number), endblock (number), expiryheight (number), nativecurrencyid (object, for ERC-20), systemid (string), parent (string), launchsystemid (string).'),
      },
      async ({ chain, definition }) => {
        try {
          assertWriteEnabled();

          // definecurrency '{"name":"...","options":...}'
          const result = await rpcCall(chain, 'definecurrency', [definition]);

          const defName = (definition as Record<string, unknown>).name as string | undefined;

          auditLog({
            server: SERVER_NAME,
            tool: 'definecurrency',
            chain,
            params: {
              name: defName,
              options: (definition as Record<string, unknown>).options,
              proofprotocol: (definition as Record<string, unknown>).proofprotocol,
            },
            result: {
              txid: (result as Record<string, unknown>)?.txid,
              hex: typeof (result as Record<string, unknown>)?.hex === 'string'
                ? ((result as Record<string, unknown>).hex as string).slice(0, 20) + '...'
                : undefined,
            },
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
