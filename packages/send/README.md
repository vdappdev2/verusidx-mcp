# @verusidx/send-mcp

MCP server for sending, converting, and transferring currency on Verus. Covers simple sends, currency conversions through fractional baskets, cross-chain transfers, currency/ID exports, balance queries, and transaction history.

## Setup

**Prerequisite:** `@verusidx/chain-mcp` must be configured and `refresh_chains` called at least once so the chain registry exists.

Add to your MCP client config (e.g., Claude Code `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "verusidx-send": {
      "command": "npx",
      "args": ["@verusidx/send-mcp"],
      "env": {}
    }
  }
}
```

**Alternative: local install.** If you prefer a pinned version or offline use, install into a project directory with `npm install @verusidx/send-mcp` (or `pnpm add` / `yarn add`) and point your config at the local path instead of using `npx`.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VERUSIDX_READ_ONLY` | `false` | Set to `true` to disable write tools. All read tools remain available. |
| `VERUSIDX_AUDIT_LOG` | `true` | Set to `false` to disable audit logging of write operations. |
| `VERUSIDX_AUDIT_DIR` | OS default | Custom directory for audit log files. |

### Read-Only Mode

Set `VERUSIDX_READ_ONLY=true` to disable write tools. In read-only mode, 7 tools remain available:

- All read tools (`getcurrencybalance`, `getcurrencyconverters`, `estimateconversion`, `listcurrencies`, `z_getoperationstatus`, `gettransaction`, `listtransactions`)

The write tool (`sendcurrency`) is not registered and won't appear in the tool list.

You can set read-only mode independently per MCP server. For example, keep send-mcp read-write while running identity-mcp in read-only mode.

## Tools

### Always available (including read-only mode)

| Tool | Description |
|---|---|
| `getcurrencybalance` | Get multi-currency balances for an address (transparent, z-address, VerusID, wildcards) |
| `getcurrencyconverters` | Find fractional baskets that can convert between specified currencies |
| `estimateconversion` | Estimate conversion output with fees and slippage (read-only preview) |
| `listcurrencies` | List and search currencies with filters (launch state, system type, reserves) |
| `z_getoperationstatus` | Check the status of async operations (companion to `sendcurrency`) |
| `gettransaction` | Get detailed info about a wallet transaction by txid |
| `listtransactions` | List recent wallet transactions with pagination |

### Write tools (disabled in read-only mode)

| Tool | Description |
|---|---|
| `sendcurrency` | Send, convert, or cross-chain transfer currency — returns an opid to poll |

## Async Send Workflow

`sendcurrency` is asynchronous. It returns an operation ID, not a transaction ID:

1. **`sendcurrency`** — returns an `opid` (e.g., `"opid-f4422247-..."`)
2. **Poll `z_getoperationstatus`** with the opid
3. When `status` is `"success"`, `result.txid` contains the transaction ID
4. Optionally call `gettransaction` with the txid for full details

## Spending Limits

On first run, send-mcp creates a default `spending-limits.json` if one doesn't exist:

```json
{
  "VRSC": 10
}
```

This caps any single `sendcurrency` call at 10 VRSC. Edit the file to adjust limits — add entries for any currency (e.g., `{ "VRSC": 100, "Bridge.vETH": 0.5 }`). Currency names are case-insensitive. To remove all limits, set the file contents to `{}` (empty object).

File location:
- **macOS:** `~/Library/Application Support/verusidx-mcp/spending-limits.json`
- **Linux:** `~/.config/verusidx-mcp/spending-limits.json`
- **Windows:** `%APPDATA%\verusidx-mcp\spending-limits.json`
- **Override:** set `VERUSIDX_SPENDING_LIMITS_PATH` environment variable

## Audit Logging

All write operations are logged to date-stamped JSONL files in the audit directory. Each entry records the tool name, chain, parameters (with sensitive fields summarized), result, and success status. Logs are append-only with `0600` permissions.

## Requirements

- Node.js >= 18.0.0
- `@verusidx/chain-mcp` installed and `refresh_chains` called (chain registry must exist)
- At least one Verus daemon running for RPC tools
