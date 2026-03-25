# @verusidx/data-mcp

MCP server for Verus on-chain data retrieval, decryption, signing, and verification. Completes the store-retrieve-decrypt pipeline that starts with `sendcurrency:data` (send-mcp), and provides signing/verification tools for off-chain data workflows.

## Setup

**Prerequisite:** `@verusidx/chain-mcp` must be configured and `refresh_chains` called at least once so the chain registry exists.

Add to your MCP client config (e.g., Claude Code `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "verusidx-data": {
      "command": "npx",
      "args": ["-y", "@verusidx/data-mcp"],
      "env": {}
    }
  }
}
```

**Alternative: local install.** If you prefer a pinned version or offline use, install into a project directory with `npm install @verusidx/data-mcp` (or `pnpm add` / `yarn add`) and point your config at the local path instead of using `npx`.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VERUSIDX_READ_ONLY` | `false` | Set to `true` to disable write tools (`z_importviewingkey`). All other tools including `signdata` and `verifysignature` remain available. |
| `VERUSIDX_AUDIT_LOG` | `true` | Set to `false` to disable audit logging of write operations. |
| `VERUSIDX_AUDIT_DIR` | OS default | Custom directory for audit log files. |

### Read-Only Mode

Set `VERUSIDX_READ_ONLY=true` to disable write tools. In read-only mode, 6 tools remain available:

- `z_listreceivedbyaddress` — list data/transactions received at a z-address
- `decryptdata` — decrypt on-chain data
- `z_exportviewingkey` — export viewing key for read-only decryption access
- `z_viewtransaction` — inspect shielded transaction details
- `signdata` — sign data (does not modify chain or wallet state)
- `verifysignature` — verify signatures (does not modify chain or wallet state)

Write tools (`z_importviewingkey`) are not registered and won't appear in the tool list.

You can set read-only mode independently per MCP server.

## Tools

### Always available (including read-only mode)

| Tool | Description |
|---|---|
| `z_listreceivedbyaddress` | List transactions and data received at a shielded address. Data txs have `amount: 0` with a data descriptor in the memo. |
| `decryptdata` | Decrypt on-chain data using a data descriptor, optional viewing key, and txid. Supports both z-address data and identity content. |
| `z_exportviewingkey` | Export the extended viewing key (EVK) for a z-address. Grants read-only decryption access. |
| `z_viewtransaction` | View detailed shielded transaction information including spends, outputs, and memos. |
| `signdata` | Sign data with a VerusID or R-address. Supports message, file, hex, base64, hash, vdxfdata, and MMR inputs. Can encrypt to a z-address. |
| `verifysignature` | Verify a signature produced by `signdata`. Checks against identity keys at signing height or current keys. |

### Write tools (disabled in read-only mode)

| Tool | Description |
|---|---|
| `z_importviewingkey` | Import a viewing key to enable decryption of data encrypted to another z-address. |

## Data Workflow

```
Store:     sendcurrency:data  (send-mcp)
              |
List:      z_listreceivedbyaddress  (data-mcp)
              |
Decrypt:   decryptdata + z_exportviewingkey  (data-mcp)

Sign:      signdata  (data-mcp)
Verify:    verifysignature  (data-mcp)

Share access: z_exportviewingkey -> z_importviewingkey  (data-mcp)
```

### Retrieving encrypted data (step by step)

1. **List received data** — call `z_listreceivedbyaddress` with the z-address. Data transactions appear with `amount: 0` and a memo containing the data descriptor.

2. **Export viewing key** (if needed) — call `z_exportviewingkey` to get the EVK. Skip this if the wallet already holds the z-address spending key.

3. **Decrypt** — call `decryptdata` with the data descriptor from step 1, the txid, `retrieve: true`, and the EVK from step 2. Returns hex-encoded decrypted content.

4. **Decode** — the `objectdata` field is hex. For text messages, decode hex to UTF-8.

## Audit Logging

Write operations (`z_importviewingkey`) are logged to date-stamped JSONL files in the audit directory. Each entry records the tool name, chain, parameters, result, and success status. Logs are append-only with `0600` permissions.

## Requirements

- Node.js >= 18.0.0
- `@verusidx/chain-mcp` installed and `refresh_chains` called (chain registry must exist)
- At least one Verus daemon running for RPC tools
