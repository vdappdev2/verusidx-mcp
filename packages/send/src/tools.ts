import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  rpcCall,
  auditLog,
  isReadOnly,
  assertWriteEnabled,
  VerusError,
  checkSpendingLimits,
  sumOutputAmounts,
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

const SERVER_NAME = 'verusidx-send-mcp';

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerTools(server: McpServer): void {
  // ------ Read-only tools (always registered) ------

  server.tool(
    'getcurrencybalance',
    'Get multi-currency balances for a specific address. Returns all currency balances held at the address, including the native chain currency and any reserve/token currencies. Supports transparent addresses, private (z) addresses, VerusIDs, and wildcard patterns. Use this for detailed per-address multi-currency holdings. For a quick overview of the wallet\'s total native balance, use getwalletinfo in chain-mcp instead.',
    {
      chain: z.string().describe('Chain to query (e.g., "VRSC", "vrsctest")'),
      address: z.union([
        z.string(),
        z.object({
          address: z.string(),
          currency: z.string(),
        }),
      ]).describe('Address to check. Can be a string ("alice@", "R...", "i*", "R*", "*") or an object {"address": "...", "currency": "currencyname"} to filter to a specific currency.'),
      minconf: z.number().optional().describe('Only include transactions confirmed at least this many times. Default: 1.'),
      friendlynames: z.boolean().optional().describe('Use friendly names instead of i-addresses for currency keys. Default: true.'),
      includeshared: z.boolean().optional().describe('Include outputs that can also be spent by others. Default: false.'),
    },
    async ({ chain, address, minconf, friendlynames, includeshared }) => {
      try {
        // getcurrencybalance "address" (minconf) (friendlynames) (includeshared)
        // Daemon expects the first param as a string — if address is an object
        // (e.g., {"address":"...","currency":"..."}), JSON-stringify it so the
        // daemon can parse it internally.
        const addressParam = typeof address === 'object' && address !== null
          ? JSON.stringify(address)
          : address;
        const params: unknown[] = [addressParam];
        if (minconf !== undefined || friendlynames !== undefined || includeshared !== undefined) {
          params.push(minconf ?? 1);
        }
        if (friendlynames !== undefined || includeshared !== undefined) {
          params.push(friendlynames ?? true);
        }
        if (includeshared !== undefined) {
          params.push(includeshared);
        }
        const result = await rpcCall(chain, 'getcurrencybalance', params);
        return ok(result);
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.tool(
    'getcurrencyconverters',
    'Find fractional basket currencies that can convert between specified currencies. Returns all baskets that hold the listed currencies as reserves, along with their current state (reserves, prices, conversion volumes). Use this to discover conversion paths before calling estimateconversion or sendcurrency with convertto. Two input modes: simple (pass currency names) or advanced (pass a query object with target conversion details).',
    {
      chain: z.string().describe('Chain to query (e.g., "VRSC", "vrsctest")'),
      currencies: z.array(z.string()).optional().describe('Simple mode: array of currency names. Returns all baskets containing all listed currencies as reserves.'),
      params: z.record(z.unknown()).optional().describe('Advanced mode: query object with convertto, fromcurrency, targetprice, amount, slippage fields. See tool spec for details.'),
    },
    async ({ chain, currencies, params: queryParams }) => {
      try {
        // Simple mode: getcurrencyconverters "currency1" "currency2" ...
        // Advanced mode: getcurrencyconverters '{"convertto":"...", ...}'
        let rpcParams: unknown[];
        if (queryParams) {
          rpcParams = [queryParams];
        } else if (currencies && currencies.length > 0) {
          // Each currency is a separate string argument
          rpcParams = [...currencies];
        } else {
          return fail('INVALID_PARAMS', 'Provide either currencies (array of names) or params (query object).');
        }
        const result = await rpcCall(chain, 'getcurrencyconverters', rpcParams);
        return ok(result);
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.tool(
    'estimateconversion',
    'Estimate the output of converting one currency to another, accounting for pending conversions, fees, and slippage. Does not broadcast a transaction — this is a read-only estimate. Use this before sendcurrency with convertto to preview the expected output. Can estimate a single conversion or an array of conversions using the same basket. IMPORTANT: when both source and destination currencies are reserves of a fractional basket (neither is the basket itself), you MUST specify "via" with the basket name — use getcurrencyconverters to find valid baskets. For more options (getcurrencyconverters filters out low-reserve baskets), use listcurrencies with {"converter":["currency1","currency2"]} to discover all baskets holding those reserves. Omitting "via" for reserve-to-reserve conversions will fail.',
    {
      chain: z.string().describe('Chain to query (e.g., "VRSC", "vrsctest")'),
      conversion: z.union([
        z.object({
          currency: z.string().describe('Source currency name'),
          amount: z.number().describe('Amount of source currency to convert'),
          convertto: z.string().describe('Destination currency name'),
          via: z.string().optional().describe('Fractional basket to convert through. REQUIRED when both source and destination are reserve currencies (e.g., VRSC→vDEX via SUPER🛒). Use getcurrencyconverters to discover valid baskets.'),
          preconvert: z.boolean().optional().describe('Convert at market price before currency launch'),
        }),
        z.array(z.object({
          currency: z.string(),
          amount: z.number(),
          convertto: z.string(),
          via: z.string().optional(),
          preconvert: z.boolean().optional(),
        })),
      ]).describe('Single conversion object or array of conversion objects.'),
    },
    async ({ chain, conversion }) => {
      try {
        const result = await rpcCall(chain, 'estimateconversion', [conversion]);
        return ok(result);
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.tool(
    'listcurrencies',
    'List and search currencies registered on the blockchain. Returns an array of currency definitions with their current state. Supports filtering by launch state, system type, source system, and converter reserves. Without a query object, returns all currencies on the local chain. Use filters when possible — unfiltered queries on mainnet can return very large result sets.',
    {
      chain: z.string().describe('Chain to query (e.g., "VRSC", "vrsctest")'),
      query: z.record(z.unknown()).optional().describe('Filter object with optional fields: launchstate ("prelaunch"|"launched"|"refund"|"complete"), systemtype ("local"|"imported"|"gateway"|"pbaas"), fromsystem (system name or i-address), converter (string[] of reserve currencies).'),
      startblock: z.number().optional().describe('Only return currencies defined at or after this block height.'),
      endblock: z.number().optional().describe('Only return currencies defined at or before this block height.'),
    },
    async ({ chain, query, startblock, endblock }) => {
      try {
        // listcurrencies (query) (startblock) (endblock)
        const params: unknown[] = [];
        if (query !== undefined || startblock !== undefined || endblock !== undefined) {
          params.push(query ?? {});
        }
        if (startblock !== undefined || endblock !== undefined) {
          params.push(startblock ?? 0);
        }
        if (endblock !== undefined) {
          params.push(endblock);
        }
        const result = await rpcCall(chain, 'listcurrencies', params);
        return ok(result);
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.tool(
    'z_getoperationstatus',
    'Check the status of async operations. Returns status, result, and timing for one or more operations. Operations remain in memory after completion — call this to retrieve results. This is the companion tool to sendcurrency, which returns an operation ID that must be polled here to get the transaction ID. Without operationids, returns all operations known to the node.',
    {
      chain: z.string().describe('Chain to query (e.g., "VRSC", "vrsctest")'),
      operationids: z.array(z.string()).optional().describe('Array of operation IDs to check (e.g., ["opid-f4422247-..."]). Omit to return all operations.'),
    },
    async ({ chain, operationids }) => {
      try {
        const params: unknown[] = [];
        if (operationids !== undefined) {
          params.push(operationids);
        }
        const result = await rpcCall(chain, 'z_getoperationstatus', params);
        return ok(result);
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.tool(
    'gettransaction',
    'Get detailed information about a wallet transaction by transaction ID. Returns amounts, confirmations, block info, and detailed input/output breakdowns including reserve transfers and multi-currency details. The transaction must be in the node\'s wallet.',
    {
      chain: z.string().describe('Chain to query (e.g., "VRSC", "vrsctest")'),
      txid: z.string().describe('The transaction ID'),
      includewatchonly: z.boolean().optional().describe('Include watchonly addresses in balance calculation and details. Default: false.'),
    },
    async ({ chain, txid, includewatchonly }) => {
      try {
        const params: unknown[] = [txid];
        if (includewatchonly !== undefined) {
          params.push(includewatchonly);
        }
        const result = await rpcCall(chain, 'gettransaction', params);
        return ok(result);
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.tool(
    'listtransactions',
    'List recent wallet transactions with pagination. Returns an array of transactions including sends, receives, and multi-currency operations. Each entry includes amounts, confirmations, block info, and — for multi-currency transactions — token amounts and reserve output details. Results are returned most-recent-last.',
    {
      chain: z.string().describe('Chain to query (e.g., "VRSC", "vrsctest")'),
      count: z.number().optional().describe('Number of transactions to return. Default: 10.'),
      from: z.number().optional().describe('Number of transactions to skip (for pagination). Default: 0.'),
      includewatchonly: z.boolean().optional().describe('Include watchonly addresses. Default: false.'),
    },
    async ({ chain, count, from, includewatchonly }) => {
      try {
        // listtransactions "account" count from includewatchonly
        // account is always "*" (all accounts)
        const params: unknown[] = ['*'];
        if (count !== undefined || from !== undefined || includewatchonly !== undefined) {
          params.push(count ?? 10);
        }
        if (from !== undefined || includewatchonly !== undefined) {
          params.push(from ?? 0);
        }
        if (includewatchonly !== undefined) {
          params.push(includewatchonly);
        }
        const result = await rpcCall(chain, 'listtransactions', params);
        return ok(result);
      } catch (err) {
        return handleError(err);
      }
    },
  );

  // ------ Write tools (registered only when not read-only) ------

  if (!isReadOnly()) {
    server.tool(
      'sendcurrency',
      'Send, convert, or cross-chain transfer currency. This is the primary tool for moving value on Verus. Supports simple sends, currency conversions through fractional baskets, cross-chain transfers, currency/ID exports, minting, burning, and data storage. Returns an operation ID (opid) — poll z_getoperationstatus with the opid to check for completion and get the resulting transaction ID. If returntxtemplate is true, returns the raw transaction template instead of broadcasting. IMPORTANT: when converting between two reserve currencies (neither is the basket itself), you MUST include "via" with the basket name in the output — use getcurrencyconverters to find valid baskets. For more options (getcurrencyconverters filters out low-reserve baskets), use listcurrencies with {"converter":["currency1","currency2"]} to discover all baskets holding those reserves.',
      {
        chain: z.string().describe('Chain to send on (e.g., "VRSC", "vrsctest")'),
        fromaddress: z.string().describe('Source address for funds. If the user has not specified a preferred address, ask which address to use or if they prefer a wildcard ("*", "R*", "i*", or "z*" for private txs).'),
        outputs: z.array(z.object({
          address: z.string().describe('Destination address — VerusID, R-address, z-address. For cross-chain: append "@chainname".'),
          amount: z.number().describe('Amount to send in the source currency. Can be 0 for export-only operations.'),
          currency: z.string().describe('Source currency name (e.g., "VRSC", "vrsctest")'),
          convertto: z.string().optional().describe('Currency to convert to.'),
          via: z.string().optional().describe('Fractional basket to convert through. REQUIRED when both source and destination are reserve currencies (e.g., VRSC→vDEX via SUPER🛒). Use getcurrencyconverters to discover valid baskets.'),
          exportto: z.string().optional().describe('Chain or system name to export/send to (e.g., "vDEX", "vETH").'),
          exportid: z.boolean().optional().describe('If true, export the full identity to the destination chain.'),
          exportcurrency: z.boolean().optional().describe('If true, export the currency definition to the destination chain.'),
          feecurrency: z.string().optional().describe('Currency to use for paying the fee.'),
          addconversionfees: z.boolean().optional().describe('If true, calculate additional fees so the full amount is converted after fees.'),
          refundto: z.string().optional().describe('Address for refunds on pre-conversions. Defaults to fromaddress.'),
          memo: z.string().optional().describe('String message for z-address destinations.'),
          data: z.record(z.unknown()).optional().describe('Data-only output. See signdata in identity-mcp for the data object format.'),
          preconvert: z.boolean().optional().describe('Convert at market price before currency launch.'),
          burn: z.boolean().optional().describe('Destroy the currency and subtract from supply.'),
          mintnew: z.boolean().optional().describe('Create new currency. Must send from the currency\'s ID and the currency must be centralized.'),
        })).describe('Array of output objects'),
        minconf: z.number().optional().describe('Only use funds confirmed at least this many times. Default: 1.'),
        feeamount: z.number().optional().describe('Specific fee amount instead of default miner\'s fee.'),
        returntxtemplate: z.boolean().optional().describe('If true, returns the raw transaction template (hex + output totals) instead of broadcasting. Default: false.'),
      },
      async ({ chain, fromaddress, outputs, minconf, feeamount, returntxtemplate }) => {
        try {
          assertWriteEnabled();

          // Pre-RPC spending limits check
          const amounts = sumOutputAmounts(outputs);
          checkSpendingLimits(amounts);

          // sendcurrency "fromaddress" '[outputs]' (minconf) (feeamount) (returntxtemplate)
          const params: unknown[] = [fromaddress, outputs];
          if (minconf !== undefined || feeamount !== undefined || returntxtemplate !== undefined) {
            params.push(minconf ?? 1);
          }
          if (feeamount !== undefined || returntxtemplate !== undefined) {
            params.push(feeamount ?? 0);
          }
          if (returntxtemplate !== undefined) {
            params.push(returntxtemplate);
          }

          const result = await rpcCall(chain, 'sendcurrency', params);

          auditLog({
            server: SERVER_NAME,
            tool: 'sendcurrency',
            chain,
            params: {
              fromaddress,
              outputs: outputs.map(o => ({
                address: o.address,
                amount: o.amount,
                currency: o.currency,
                convertto: o.convertto,
                via: o.via,
                exportto: o.exportto,
              })),
              minconf,
              feeamount,
              returntxtemplate,
            },
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
