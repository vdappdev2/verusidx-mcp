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

const SERVER_NAME = 'verusidx-address-mcp';

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerTools(server: McpServer): void {
  // ------ Read-only tools (always registered) ------

  server.tool(
    'validateaddress',
    'Validate an address and return detailed information about it. Returns whether the address is valid, whether it belongs to this wallet (ismine), the address type, and associated metadata. Use this to verify addresses before sending funds, or to check if a given address is controlled by the local wallet.',
    {
      chain: z.string().describe('Chain to query (e.g., "VRSC", "vrsctest")'),
      address: z.string().describe('The transparent address to validate (R-address or i-address)'),
    },
    async ({ chain, address }) => {
      try {
        const result = await rpcCall(chain, 'validateaddress', [address]);
        return ok(result);
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.tool(
    'getaddressesbyaccount',
    'List all transparent addresses for an account. In Verus, the default account is "" (empty string). Returns an array of R-addresses associated with the account. Use this to see all transparent addresses the wallet has generated.',
    {
      chain: z.string().describe('Chain to query (e.g., "VRSC", "vrsctest")'),
      account: z.string().default('').describe('Account name. Use "" (empty string) for the default account. In Verus, all addresses typically belong to the default account.'),
    },
    async ({ chain, account }) => {
      try {
        const result = await rpcCall(chain, 'getaddressesbyaccount', [account]);
        return ok(result);
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.tool(
    'z_listaddresses',
    'List all shielded (Sapling) addresses in the wallet. Returns an array of zs-addresses. Use this to see all shielded addresses available for private transactions, or to find an existing shielded address for use as an identity privateaddress.',
    {
      chain: z.string().describe('Chain to query (e.g., "VRSC", "vrsctest")'),
      includeWatchonly: z.boolean().optional().default(false).describe('Also include watchonly addresses. Default: false.'),
    },
    async ({ chain, includeWatchonly }) => {
      try {
        const result = await rpcCall(chain, 'z_listaddresses', [includeWatchonly]);
        return ok(result);
      } catch (err) {
        return handleError(err);
      }
    },
  );

  // ------ Write tools (registered only when not read-only) ------

  if (!isReadOnly()) {
    server.tool(
      'getnewaddress',
      'Generate a new transparent (R-address) for receiving payments. Use this to create fresh addresses for identity primaryaddresses, change addresses, or destination addresses. Each call generates a unique address from the wallet\'s keypool.',
      { chain: z.string().describe('Chain to generate address on (e.g., "VRSC", "vrsctest")') },
      async ({ chain }) => {
        try {
          assertWriteEnabled();
          const result = await rpcCall(chain, 'getnewaddress', []);

          auditLog({
            server: SERVER_NAME,
            tool: 'getnewaddress',
            chain,
            params: {},
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
      'z_getnewaddress',
      'Generate a new shielded Sapling address (zs-address) for private transactions. Use this to create addresses for identity privateaddress fields or private sends. Each call generates a unique shielded address.',
      { chain: z.string().describe('Chain to generate address on (e.g., "VRSC", "vrsctest")') },
      async ({ chain }) => {
        try {
          assertWriteEnabled();
          const result = await rpcCall(chain, 'z_getnewaddress', ['sapling']);

          auditLog({
            server: SERVER_NAME,
            tool: 'z_getnewaddress',
            chain,
            params: {},
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
