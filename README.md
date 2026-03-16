# VerusIDX MCP Servers

A suite of [MCP](https://modelcontextprotocol.io/) servers for the [Verus](https://verus.io/) blockchain ecosystem. Each server is focused on a specific workflow — chain management, identity, address management, currency transfers, currency creation, and marketplace trading.

## Servers

| Package | Tools | Purpose |
|---|---|---|
| [`@verusidx/chain-mcp`](packages/chain/) | 11 | Foundation — chain discovery, daemon management, health checks, currency lookup, raw transactions, RPC help |
| [`@verusidx/identity-mcp`](packages/identity/) | 13 | Create, manage, query, and sign with VerusIDs |
| [`@verusidx/send-mcp`](packages/send/) | 8 | Send, convert, and transfer currency; check balances and conversions |
| [`@verusidx/definecurrency-mcp`](packages/definecurrency/) | 1 | Define and launch new currencies (tokens, baskets, ID control tokens) |
| [`@verusidx/marketplace-mcp`](packages/marketplace/) | 5 | On-chain offers and trades |
| [`@verusidx/address-mcp`](packages/address/) | 5 | Generate, validate, and list transparent and shielded addresses |

**`chain-mcp` is the foundation.** It discovers running daemons and writes a registry file that all other servers read. Install it first and run `refresh_chains` before using any other server.

## Quick Start

Add the foundation server to your MCP client config (Claude Code, Cursor, etc.):

```json
{
  "mcpServers": {
    "verusidx-chain": {
      "command": "npx",
      "args": ["-y", "@verusidx/chain-mcp"],
      "env": {}
    }
  }
}
```

No separate install step — `npx` fetches and runs the package on demand. For a pinned version or offline use, install locally with `npm install` (or `pnpm add` / `yarn add`) and point your config at the local path. See each package's README for its config block.

Then in your MCP client, call `refresh_chains` to discover local daemons. Every tool requires a `chain` parameter (e.g., `"VRSC"`, `"vrsctest"`) — there is no default chain.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  MCP Client (Claude Code, Cursor, etc.)                  │
└──┬──────┬──────┬──────┬──────┬──────────┬────────────────┘
   │      │      │      │      │          │  stdio
 ┌─▼───┐ ┌▼───┐ ┌▼────┐ ┌▼───┐ ┌▼──────────┐ ┌▼────┐
 │chain│ │ id │ │send│ │def │ │marketplace│ │addr │
 │ mcp │ │mcp │ │mcp │ │mcp │ │   mcp     │ │ mcp │
 └──┬──┘ └─┬──┘ └─┬──┘ └─┬──┘ └─────┬─────┘ └──┬──┘
    │       │      │      │          │           │
 ┌──▼───────▼──────▼──────▼──────────▼───────────▼───┐
 │              @verusidx/shared                      │
 │  registry · rpc-client · errors · audit            │
 └────────────────────┬──────────────────────────────┘
                      │  JSON-RPC over HTTP
 ┌────────────────────▼──────────────────────────────┐
 │           verusd (one or more daemons)             │
 └───────────────────────────────────────────────────┘
```

- **Shared library** (`@verusidx/shared`) — registry reader, RPC client with credential caching, error normalization, audit logging, spending limits, read-only guard. Zero runtime dependencies.
- **Chain registry** — `chains.json` written atomically by chain-mcp, read by all other servers via `stat()`-based cache invalidation.
- **Each server runs as a separate process** via stdio transport. No shared memory between servers.

## Configuration

All servers share these environment variables:

| Variable | Description |
|---|---|
| `VERUSIDX_READ_ONLY` | `true` to disable write tools. Set per-server for fine-grained control. |
| `VERUSIDX_AUDIT_LOG` | `false` to disable audit logging (default: enabled) |
| `VERUSIDX_AUDIT_DIR` | Custom audit log directory |
| `VERUSIDX_SPENDING_LIMITS_PATH` | Custom path to `spending-limits.json`. Default: `<config-dir>/spending-limits.json` |

Server-specific variables are documented in each package's README.

### Spending Limits

Servers that send funds (`send-mcp`, `marketplace-mcp`) enforce per-currency spending limits. A default `spending-limits.json` is created automatically on first run:

```json
{
  "VRSC": 10
}
```

This caps any single `sendcurrency` call at 10 VRSC. To adjust limits, edit the file at:
- **macOS:** `~/Library/Application Support/verusidx-mcp/spending-limits.json`
- **Linux:** `~/.config/verusidx-mcp/spending-limits.json`
- **Windows:** `%APPDATA%\verusidx-mcp\spending-limits.json`

Add entries for any currency: `{ "VRSC": 100, "Bridge.vETH": 0.5 }`. Currency names are case-insensitive. To remove all limits, set the file contents to `{}` (empty object). To override the path, set `VERUSIDX_SPENDING_LIMITS_PATH`.

## Development

```bash
# Prerequisites: Node.js >= 18, pnpm
pnpm install
pnpm -r build              # build all packages
pnpm -r test               # test all packages

# Build a specific server and its dependencies
pnpm --filter @verusidx/chain-mcp... build

```

### Project Structure

```
verusidx-mcp/
├── packages/
│   ├── shared/          # @verusidx/shared — internal library
│   ├── chain/           # @verusidx/chain-mcp — foundation server
│   ├── identity/        # @verusidx/identity-mcp
│   ├── send/            # @verusidx/send-mcp
│   ├── definecurrency/  # @verusidx/definecurrency-mcp
│   ├── marketplace/     # @verusidx/marketplace-mcp
│   └── address/         # @verusidx/address-mcp
└── tool-specs/          # Agent-facing tool description specs
```

### Supply Chain Security

- Zero runtime dependencies in the shared library (Node built-ins + built-in `fetch`)
- MCP servers depend only on `@modelcontextprotocol/sdk` and `zod`
- `onlyBuiltDependencies: []` blocks dependency install scripts
- All credentials read from daemon `.conf` files — never stored by the MCP servers (except remote daemons in the registry with `0600` permissions)
