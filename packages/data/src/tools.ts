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

const SERVER_NAME = 'verusidx-data-mcp';

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerTools(server: McpServer): void {
  // ------ Read-only tools (always registered) ------

  // ---- Data retrieval pipeline ----

  server.tool(
    'z_listreceivedbyaddress',
    'List transactions and data received at a shielded (z) address. Data transactions appear with amount: 0 and a memo containing the data descriptor (a JSON object keyed by the VDXF datadescriptor address). Use this as step 1 of the data retrieval pipeline: list received data, then pass the descriptor to decryptdata. Value transactions appear with their amount and standard memo.',
    {
      chain: z.string().describe('Chain to query (e.g., "VRSC", "vrsctest")'),
      address: z.string().describe('The shielded (zs-) address to list received transactions for.'),
      minconf: z.number().optional().default(1).describe('Only include transactions confirmed at least this many times. Default: 1.'),
    },
    async ({ chain, address, minconf }) => {
      try {
        const result = await rpcCall(chain, 'z_listreceivedbyaddress', [address, minconf]);
        return ok(result);
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.tool(
    'decryptdata',
    'Decrypt data stored on-chain. Accepts a data descriptor (from z_listreceivedbyaddress memo), viewing key (EVK or IVK), and optional txid. With retrieve: true, the daemon fetches and decrypts the referenced data. Always pass the EVK (from z_exportviewingkey) — without it the daemon returns still-encrypted data even if the wallet holds the spending key. For encrypted identity content, pass the original encrypted DataDescriptor from signdata (not the on-chain version, which may have modified flags). Alternatively, use iddata to query and decrypt identity content by identityid and vdxfkey.',
    {
      chain: z.string().describe('Chain to query (e.g., "VRSC", "vrsctest")'),
      datadescriptor: z.record(z.unknown()).optional().describe('Data descriptor object to decrypt. Typically the JSON object from z_listreceivedbyaddress memo (the value under the i4GC1YGEVD21... VDXF key). Either datadescriptor or iddata is required.'),
      iddata: z.object({
        identityid: z.string().describe('Identity name or i-address to query content from.'),
        vdxfkey: z.string().optional().describe('VDXF key (i-address) to filter content by.'),
        startheight: z.number().optional().describe('Start block height for content query range.'),
        endheight: z.number().optional().describe('End block height for content query range.'),
        getlast: z.boolean().optional().describe('If true, return only the most recent content entry.'),
      }).optional().describe('Query identity content and decrypt in one step. Alternative to datadescriptor. Returns an error if the identity has no stored content for the given parameters. Note: may fail for encrypted content stored via updateidentity due to flags modification.'),
      evk: z.string().optional().describe('Sapling extended full viewing key for decryption. Always pass this — export via z_exportviewingkey. Without it, data is returned still encrypted.'),
      ivk: z.string().optional().describe('Hex incoming viewing key for decryption.'),
      txid: z.string().optional().describe('Transaction ID containing the data. Required when retrieve is true and the data references the same transaction.'),
      retrieve: z.boolean().optional().describe('If true, fetch the data from its on-chain reference and decrypt. Default: false.'),
    },
    async ({ chain, datadescriptor, iddata, evk, ivk, txid, retrieve }) => {
      try {
        const decryptObj: Record<string, unknown> = {};
        if (datadescriptor !== undefined) decryptObj.datadescriptor = datadescriptor;
        if (iddata !== undefined) decryptObj.iddata = iddata;
        if (evk !== undefined) decryptObj.evk = evk;
        if (ivk !== undefined) decryptObj.ivk = ivk;
        if (txid !== undefined) decryptObj.txid = txid;
        if (retrieve !== undefined) decryptObj.retrieve = retrieve;

        const result = await rpcCall(chain, 'decryptdata', [decryptObj]);
        return ok(result);
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.tool(
    'z_exportviewingkey',
    'Export the extended viewing key (EVK) for a shielded address. The viewing key allows decryption of all data encrypted to this z-address without granting spending authority. Share it to grant read-only access. Pass the returned key as the evk parameter to decryptdata.',
    {
      chain: z.string().describe('Chain to query (e.g., "VRSC", "vrsctest")'),
      address: z.string().describe('The shielded (zs-) address to export the viewing key for.'),
    },
    async ({ chain, address }) => {
      try {
        const result = await rpcCall(chain, 'z_exportviewingkey', [address]);
        return ok(result);
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.tool(
    'z_viewtransaction',
    'View detailed shielded transaction information including spends and outputs for a z-transaction in the wallet. Shows addresses, amounts, memos, and output indices. Useful for inspecting data-carrying transactions to understand their structure before decryption.',
    {
      chain: z.string().describe('Chain to query (e.g., "VRSC", "vrsctest")'),
      txid: z.string().describe('Transaction ID to inspect.'),
    },
    async ({ chain, txid }) => {
      try {
        const result = await rpcCall(chain, 'z_viewtransaction', [txid]);
        return ok(result);
      } catch (err) {
        return handleError(err);
      }
    },
  );

  // ---- Data signing and verification ----

  server.tool(
    'signdata',
    'Sign data with a VerusID or transparent address. Generates a hash of the provided data and signs it. Supports multiple input modes (message, file, hex, base64, pre-computed hash, vdxfdata) and hash algorithms (sha256, sha256D, blake2b, keccak256). Can sign a single piece of data or build a Merkle Mountain Range (MMR) over multiple items. For multi-sig identities, pass an existing partial signature to accumulate signatures. Can also encrypt data to a z-address via encrypttoaddress — returns both plaintext and encrypted versions with an SSK for selective disclosure. Supports vdxfdata input — as a string (equivalent to message) or as a JSON object (VDXF binary serialization, producing a different hash). Use the object form to sign data in the same canonical format as on-chain identity contentmultimap entries. Available in read-only mode — signing does not spend funds or change blockchain/wallet state.',
    {
      chain: z.string().describe('Chain to sign on (e.g., "VRSC", "vrsctest")'),
      address: z.string().describe('VerusID name or R-address to sign with. A R-address produces a simple signature.'),
      message: z.string().optional().describe('Text message to sign.'),
      filename: z.string().optional().describe('File path to sign. Requires -enablefileencryption daemon flag.'),
      messagehex: z.string().optional().describe('Hex-encoded data to sign.'),
      messagebase64: z.string().optional().describe('Base64-encoded data to sign. Note: may not work in all daemon versions — prefer messagehex if base64 fails.'),
      datahash: z.string().optional().describe('Pre-computed 256-bit hex hash to sign directly.'),
      mmrdata: z.array(z.record(z.unknown())).optional().describe('Array of data objects for MMR signing. Each element: {"filename" or "message" or "serializedhex" or "serializedbase64" or "vdxfdata" or "datahash": "value"}.'),
      mmrsalt: z.array(z.string()).optional().describe('Array of salt strings to protect privacy of MMR leaf nodes.'),
      mmrhashtype: z.string().optional().describe('Hash type for MMR: "sha256", "sha256D", "blake2b", "keccak256". Default: "blake2b".'),
      prefixstring: z.string().optional().describe('Extra string hashed during signing — must be supplied for verification.'),
      vdxfkeys: z.array(z.string()).optional().describe('Array of VDXF keys or i-addresses to bind to the signature.'),
      vdxfkeynames: z.array(z.string()).optional().describe('Array of VDXF key names or friendly name IDs (no i-addresses).'),
      boundhashes: z.array(z.string()).optional().describe('Array of hex hashes to bind to the signature.'),
      hashtype: z.string().optional().describe('Hash algorithm: "sha256" (default), "sha256D", "blake2b", "keccak256".'),
      signature: z.string().optional().describe('Existing base64 signature for multi-sig accumulation.'),
      encrypttoaddress: z.string().optional().describe('Sapling z-address to encrypt data to. Returns both encrypted and plaintext versions. The encrypted DataDescriptor can be stored on an identity via updateidentity or sent via sendcurrency.'),
      vdxfdata: z.union([z.string(), z.record(z.unknown())]).optional().describe('VDXF-encoded structured data. String form hashes the raw string (equivalent to message). Object form performs VDXF binary serialization before hashing — use for canonical signing of VDXF-structured content such as contentmultimap entries.'),
      createmmr: z.boolean().optional().describe('If true (or if multiple items are provided), returns MMR data and root signature.'),
    },
    async ({ chain, address, message, filename, messagehex, messagebase64, datahash, mmrdata, mmrsalt, mmrhashtype, prefixstring, vdxfkeys, vdxfkeynames, boundhashes, hashtype, signature, encrypttoaddress, vdxfdata, createmmr }) => {
      try {
        const sigObj: Record<string, unknown> = { address };
        if (message !== undefined) sigObj.message = message;
        if (filename !== undefined) sigObj.filename = filename;
        if (messagehex !== undefined) sigObj.messagehex = messagehex;
        if (messagebase64 !== undefined) sigObj.messagebase64 = messagebase64;
        if (datahash !== undefined) sigObj.datahash = datahash;
        if (mmrdata !== undefined) sigObj.mmrdata = mmrdata;
        if (mmrsalt !== undefined) sigObj.mmrsalt = mmrsalt;
        if (mmrhashtype !== undefined) sigObj.mmrhashtype = mmrhashtype;
        if (prefixstring !== undefined) sigObj.prefixstring = prefixstring;
        if (vdxfkeys !== undefined) sigObj.vdxfkeys = vdxfkeys;
        if (vdxfkeynames !== undefined) sigObj.vdxfkeynames = vdxfkeynames;
        if (boundhashes !== undefined) sigObj.boundhashes = boundhashes;
        if (hashtype !== undefined) sigObj.hashtype = hashtype;
        if (signature !== undefined) sigObj.signature = signature;
        if (encrypttoaddress !== undefined) sigObj.encrypttoaddress = encrypttoaddress;
        if (vdxfdata !== undefined) sigObj.vdxfdata = vdxfdata;
        if (createmmr !== undefined) sigObj.createmmr = createmmr;

        const result = await rpcCall(chain, 'signdata', [sigObj]);
        return ok(result);
      } catch (err) {
        return handleError(err);
      }
    },
  );

  server.tool(
    'verifysignature',
    'Verify a signature produced by signdata. Checks that the signature is valid for the given data and identity/address. Returns signaturestatus: "verified" or "invalid" — always check this field. By default, validates against the identity\'s keys at the block height stored in the signature — use checklatest to verify against the identity\'s current keys instead.',
    {
      chain: z.string().describe('Chain to verify on (e.g., "VRSC", "vrsctest")'),
      address: z.string().describe('VerusID name or R-address to verify against.'),
      message: z.string().optional().describe('Text message that was signed.'),
      filename: z.string().optional().describe('File path that was signed.'),
      messagehex: z.string().optional().describe('Hex-encoded data that was signed.'),
      messagebase64: z.string().optional().describe('Base64-encoded data that was signed.'),
      datahash: z.string().optional().describe('Pre-computed 256-bit hex hash that was signed.'),
      prefixstring: z.string().optional().describe('Prefix string used during signing (must match).'),
      vdxfkeys: z.array(z.string()).optional().describe('VDXF keys bound during signing (must match).'),
      vdxfkeynames: z.array(z.string()).optional().describe('VDXF key names bound during signing (must match).'),
      boundhashes: z.array(z.string()).optional().describe('Hashes bound during signing (must match).'),
      hashtype: z.string().optional().describe('Hash algorithm used during signing. Default: "sha256".'),
      signature: z.string().describe('Base64-encoded signature to verify.'),
      checklatest: z.boolean().optional().describe('If true, verify against the identity\'s current keys. Default: false (verify against keys at the signing height stored in the signature).'),
    },
    async ({ chain, address, message, filename, messagehex, messagebase64, datahash, prefixstring, vdxfkeys, vdxfkeynames, boundhashes, hashtype, signature, checklatest }) => {
      try {
        // verifysignature builds a JSON object parameter
        // Daemon param spec uses "address" key (despite example showing "identity")
        const verifyObj: Record<string, unknown> = { address, signature };
        // Daemon bug: verifysignature hashes "message" differently than signdata,
        // producing a different hash for the same string. Convert message to messagehex
        // so the raw bytes are hashed identically to signdata.
        if (message !== undefined) verifyObj.messagehex = Buffer.from(message, 'utf8').toString('hex');
        if (filename !== undefined) verifyObj.filename = filename;
        if (messagehex !== undefined) verifyObj.messagehex = messagehex;
        if (messagebase64 !== undefined) verifyObj.messagebase64 = messagebase64;
        if (datahash !== undefined) verifyObj.datahash = datahash;
        if (prefixstring !== undefined) verifyObj.prefixstring = prefixstring;
        if (vdxfkeys !== undefined) verifyObj.vdxfkeys = vdxfkeys;
        if (vdxfkeynames !== undefined) verifyObj.vdxfkeynames = vdxfkeynames;
        if (boundhashes !== undefined) verifyObj.boundhashes = boundhashes;
        if (hashtype !== undefined) verifyObj.hashtype = hashtype;
        if (checklatest !== undefined) verifyObj.checklatest = checklatest;

        const result = await rpcCall(chain, 'verifysignature', [verifyObj]);
        return ok(result);
      } catch (err) {
        return handleError(err);
      }
    },
  );

  // ------ Write tools (registered only when not read-only) ------

  if (!isReadOnly()) {
    server.tool(
      'z_importviewingkey',
      'Import a viewing key to enable decryption of data encrypted to another z-address. Grants read-only access without spending authority. The key can be obtained from z_exportviewingkey. After import, decryptdata can decrypt data encrypted to that address without passing the key explicitly. Note: rescan can take minutes if scanning a large block range.',
      {
        chain: z.string().describe('Chain to import on (e.g., "VRSC", "vrsctest")'),
        vkey: z.string().describe('The viewing key to import (from z_exportviewingkey).'),
        rescan: z.enum(['yes', 'no', 'whenkeyisnew']).optional().default('whenkeyisnew').describe('Whether to rescan the wallet for transactions: "yes", "no", or "whenkeyisnew" (default).'),
        startHeight: z.number().optional().default(0).describe('Block height to start rescan from. Default: 0.'),
      },
      async ({ chain, vkey, rescan, startHeight }) => {
        try {
          assertWriteEnabled();
          const result = await rpcCall(chain, 'z_importviewingkey', [vkey, rescan, startHeight]);

          auditLog({
            server: SERVER_NAME,
            tool: 'z_importviewingkey',
            chain,
            params: { rescan, startHeight },
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
