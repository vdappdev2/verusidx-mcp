# @verusidx/definecurrency-mcp

MCP server for defining and launching new currencies on Verus — simple tokens, fractional basket currencies, centralized tokens, ID control tokens, and Ethereum ERC-20 mapped tokens.

## Setup

**Prerequisite:** `@verusidx/chain-mcp` must be configured and `refresh_chains` called at least once so the chain registry exists.

Add to your MCP client config (e.g., Claude Code `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "verusidx-definecurrency": {
      "command": "npx",
      "args": ["-y", "@verusidx/definecurrency-mcp"],
      "env": {}
    }
  }
}
```

**Alternative: local install.** If you prefer a pinned version or offline use, install into a project directory with `npm install @verusidx/definecurrency-mcp` (or `pnpm add` / `yarn add`) and point your config at the local path instead of using `npx`.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VERUSIDX_READ_ONLY` | `false` | Set to `true` to disable all tools. This is a write-only MCP — no tools are available in read-only mode. |
| `VERUSIDX_AUDIT_LOG` | `true` | Set to `false` to disable audit logging. |
| `VERUSIDX_AUDIT_DIR` | OS default | Custom directory for audit log files. |

### Read-Only Mode

This is a **write-only MCP**. Setting `VERUSIDX_READ_ONLY=true` disables the only tool (`definecurrency`), leaving zero tools registered.

## Tools

| Tool | Description |
|---|---|
| `definecurrency` | Define a new currency — returns signed tx hex to broadcast via `sendrawtransaction` (chain-mcp) |

## Launch Workflow

`definecurrency` creates a signed transaction but does **not** broadcast it:

1. Ensure a VerusID with the currency name exists and is controlled by the wallet
2. **`definecurrency`** — returns `{txid, tx, hex}`
3. **`sendrawtransaction`** (chain-mcp) with the `hex` — broadcasts the definition
4. Wait for the preconversion timeframe (minimum 20 blocks)
5. **`getcurrency`** (chain-mcp) to verify the currency launched

## Currency Types

| Options | Type | Description |
|---|---|---|
| `32` | Simple token | Basic token, optionally with preconversion funding |
| `33` | Basket currency | Fractional reserve currency supporting on-chain conversions |
| `2080` | ID control token | Single-satoshi token granting revoke/recover authority |

Common options shown. Combine values for variants (e.g., `41` = basket + referrals, `34` = token + ID-restricted). See `tool-specs/definecurrency.md` for the full options table, field reference, and examples.

Set `proofprotocol: 2` for centralized tokens (rootID can mint/burn), or `proofprotocol: 3` for Ethereum ERC-20 mapped tokens.

## Audit Logging

All `definecurrency` calls are logged to date-stamped JSONL files in the audit directory. The hex is truncated in audit entries. Logs are append-only with `0600` permissions.

## Requirements

- Node.js >= 18.0.0
- `@verusidx/chain-mcp` installed and `refresh_chains` called (chain registry must exist)
- At least one Verus daemon running
- A VerusID matching the currency name, controlled by the wallet
