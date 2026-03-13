# @verusidx/marketplace-mcp

MCP server for on-chain offers and trades on Verus. Supports identity swaps, currency offers, and decentralized atomic swaps — all four combinations: currency-for-currency, currency-for-identity, identity-for-currency, and identity-for-identity.

## Setup

**Prerequisite:** `@verusidx/chain-mcp` must be configured and `refresh_chains` called at least once so the chain registry exists.

Add to your MCP client config (e.g., Claude Code `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "verusidx-marketplace": {
      "command": "npx",
      "args": ["@verusidx/marketplace-mcp"],
      "env": {}
    }
  }
}
```

**Alternative: local install.** If you prefer a pinned version or offline use, install into a project directory with `npm install @verusidx/marketplace-mcp` (or `pnpm add` / `yarn add`) and point your config at the local path instead of using `npx`.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VERUSIDX_READ_ONLY` | `false` | Set to `true` to disable write tools. Read tools remain available. |
| `VERUSIDX_AUDIT_LOG` | `true` | Set to `false` to disable audit logging of write operations. |
| `VERUSIDX_AUDIT_DIR` | OS default | Custom directory for audit log files. |

### Read-Only Mode

Set `VERUSIDX_READ_ONLY=true` to disable write tools. In read-only mode, 2 tools remain available:

- `getoffers` — browse offers on the market
- `listopenoffers` — list offers from the current wallet

Write tools (`makeoffer`, `takeoffer`, `closeoffers`) are not registered and won't appear in the tool list.

## Tools

### Always available (including read-only mode)

| Tool | Description |
|---|---|
| `getoffers` | Get all open offers for a specific currency or identity (buy and sell sides) |
| `listopenoffers` | List open offers from the current wallet, with expired/unexpired filter |

### Write tools (disabled in read-only mode)

| Tool | Description |
|---|---|
| `makeoffer` | Create a new on-chain atomic swap offer |
| `takeoffer` | Accept an existing on-chain offer (atomic exchange) |
| `closeoffers` | Close/cancel open offers and reclaim locked funds |

## Offer Types

All four swap combinations are supported:

| Offer | For | Example |
|---|---|---|
| Currency | Currency | Sell 1 BTC for 5000 VRSC |
| Currency | Identity | Offer 100 VRSC for an identity |
| Identity | Currency | Sell an identity for 50 VRSC |
| Identity | Identity | Swap two identities |

### ID Control Tokens

Some identities have an associated control token (`flags: 5` in `getidentity`). These identities **cannot** be offered or requested directly — instead, offer/request the control token as a currency: `{"currency": "idname.parent", "amount": 0.00000001}`. There is exactly 1 satoshi of each control token.

## Spending Limits

On first run, marketplace-mcp creates a default `spending-limits.json` if one doesn't exist:

```json
{
  "VRSC": 10
}
```

This caps any single `makeoffer` or `takeoffer` call at 10 VRSC. Edit the file to adjust limits. To remove all limits, set the file contents to `{}` (empty object). See the root README for file location and configuration details.

## Audit Logging

All write operations are logged to date-stamped JSONL files in the audit directory. Each entry records the tool name, chain, parameters, result, and success status. Logs are append-only with `0600` permissions.

## Requirements

- Node.js >= 18.0.0
- `@verusidx/chain-mcp` installed and `refresh_chains` called (chain registry must exist)
- At least one Verus daemon running for RPC tools
