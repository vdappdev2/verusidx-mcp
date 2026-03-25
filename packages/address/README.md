# @verusidx/address-mcp

MCP server for Verus address management — generate, validate, and list transparent and shielded addresses.

## Setup

**Prerequisite:** `@verusidx/chain-mcp` must be configured and `refresh_chains` called at least once so the chain registry exists.

Add to your MCP client config (e.g., Claude Code `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "verusidx-address": {
      "command": "npx",
      "args": ["-y", "@verusidx/address-mcp"],
      "env": {}
    }
  }
}
```

**Alternative: local install.** If you prefer a pinned version or offline use, install into a project directory with `npm install @verusidx/address-mcp` (or `pnpm add` / `yarn add`) and point your config at the local path instead of using `npx`.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VERUSIDX_READ_ONLY` | `false` | Set to `true` to disable write tools (`getnewaddress`, `z_getnewaddress`). Read tools remain available. |
| `VERUSIDX_AUDIT_LOG` | `true` | Set to `false` to disable audit logging of write operations. |
| `VERUSIDX_AUDIT_DIR` | OS default | Custom directory for audit log files. |

### Read-Only Mode

Set `VERUSIDX_READ_ONLY=true` to disable write tools. In read-only mode, 4 tools remain available:

- `validateaddress` — check if a transparent address is valid and whether the wallet owns it
- `z_validateaddress` — validate shielded z-addresses and check wallet ownership
- `getaddressesbyaccount` — list transparent addresses
- `z_listaddresses` — list shielded addresses

Write tools (`getnewaddress`, `z_getnewaddress`) are not registered and won't appear in the tool list.

You can set read-only mode independently per MCP server. For example, keep address-mcp read-write while running send-mcp in read-only mode.

## Tools

### Always available (including read-only mode)

| Tool | Description |
|---|---|
| `validateaddress` | Validate an address and return info (isvalid, ismine, type) |
| `z_validateaddress` | Validate a shielded z-address and return info (isvalid, ismine, type, key components) |
| `getaddressesbyaccount` | List all transparent addresses for an account |
| `z_listaddresses` | List all shielded addresses in the wallet |

### Write tools (disabled in read-only mode)

| Tool | Description |
|---|---|
| `getnewaddress` | Generate a new transparent R-address for receiving payments |
| `z_getnewaddress` | Generate a new shielded Sapling address (zs-address) for private transactions |

## Audit Logging

All write operations (`getnewaddress`, `z_getnewaddress`) are logged to date-stamped JSONL files in the audit directory. Each entry records the tool name, chain, parameters, result, and success status. Logs are append-only with `0600` permissions.

## Requirements

- Node.js >= 18.0.0
- `@verusidx/chain-mcp` installed and `refresh_chains` called (chain registry must exist)
- At least one Verus daemon running for RPC tools
