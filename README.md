# VerusIDX MCP Servers

[![npm](https://img.shields.io/npm/v/@verusidx/chain-mcp?label=chain-mcp)](https://www.npmjs.com/package/@verusidx/chain-mcp)
[![npm](https://img.shields.io/npm/v/@verusidx/identity-mcp?label=identity-mcp)](https://www.npmjs.com/package/@verusidx/identity-mcp)
[![npm](https://img.shields.io/npm/v/@verusidx/send-mcp?label=send-mcp)](https://www.npmjs.com/package/@verusidx/send-mcp)
[![npm](https://img.shields.io/npm/v/@verusidx/address-mcp?label=address-mcp)](https://www.npmjs.com/package/@verusidx/address-mcp)
[![npm](https://img.shields.io/npm/v/@verusidx/marketplace-mcp?label=marketplace-mcp)](https://www.npmjs.com/package/@verusidx/marketplace-mcp)
[![npm](https://img.shields.io/npm/v/@verusidx/data-mcp?label=data-mcp)](https://www.npmjs.com/package/@verusidx/data-mcp)
[![npm](https://img.shields.io/npm/v/@verusidx/definecurrency-mcp?label=definecurrency-mcp)](https://www.npmjs.com/package/@verusidx/definecurrency-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

7 [MCP](https://modelcontextprotocol.io/) servers giving AI agents direct, local access to the [Verus](https://verus.io/) blockchain — **48 tools, zero cloud dependencies**. No API keys. No accounts. No intermediary between the agent and the chain.

Works with [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Cursor](https://cursor.com/), and any MCP-compatible client.

## What Can an Agent Do?

- **Identity** — create, update, revoke, and recover [VerusIDs](https://docs.verus.io/verusid/) (protocol-level blockchain identities with on-chain data storage)
- **Data** — store, retrieve, and decrypt on-chain data; sign and verify with SHA-256, Blake2b, Keccak-256, or Merkle Mountain Range proofs; share decryption access via viewing keys
- **Send & convert** — move currency, convert through fractional baskets, cross-chain transfers via PBaaS bridges
- **Create currencies** — define tokens, fractional reserve baskets, centralized currencies, ERC-20 mapped tokens
- **Trade** — on-chain atomic swaps for currency-for-currency, currency-for-ID, or ID-for-ID
- **Privacy** — shielded transactions via Sapling zero-knowledge proofs

## Quick Start

**Prerequisites:** a running [Verus daemon](https://verus.io/wallet) and Node.js 18+.

Add the foundation server to your MCP client config:

```json
{
  "mcpServers": {
    "verusidx-chain": {
      "command": "npx",
      "args": ["-y", "@verusidx/chain-mcp"]
    }
  }
}
```

Then tell your AI to call `refresh_chains` — it discovers your local daemons automatically. That's it.

No separate install step — `npx` fetches and runs the package on demand. Add more servers as you need them (see below).

## Servers

| Package | Tools | Purpose |
|---|---|---|
| [`@verusidx/chain-mcp`](packages/chain/) | 11 | Foundation — chain discovery, daemon management, health checks, currency lookup, raw transactions, RPC help |
| [`@verusidx/identity-mcp`](packages/identity/) | 11 | Create, manage, and query VerusIDs |
| [`@verusidx/send-mcp`](packages/send/) | 8 | Send, convert, and transfer currency; check balances and conversions |
| [`@verusidx/data-mcp`](packages/data/) | 7 | Retrieve, decrypt, sign, and verify on-chain data; manage viewing keys |
| [`@verusidx/address-mcp`](packages/address/) | 5 | Generate, validate, and list transparent and shielded addresses |
| [`@verusidx/marketplace-mcp`](packages/marketplace/) | 5 | On-chain offers and trades |
| [`@verusidx/definecurrency-mcp`](packages/definecurrency/) | 1 | Define and launch new currencies |

**`chain-mcp` is the foundation.** It discovers running daemons and writes a registry file that all other servers read. Install it first. Every tool requires a `chain` parameter (e.g., `"VRSC"`, `"vrsctest"`) — there is no default chain.

### Adding More Servers

Each server is independent — add or remove without affecting the others:

```json
{
  "mcpServers": {
    "verusidx-chain": {
      "command": "npx",
      "args": ["-y", "@verusidx/chain-mcp"]
    },
    "verusidx-identity": {
      "command": "npx",
      "args": ["-y", "@verusidx/identity-mcp"]
    },
    "verusidx-send": {
      "command": "npx",
      "args": ["-y", "@verusidx/send-mcp"]
    },
    "verusidx-data": {
      "command": "npx",
      "args": ["-y", "@verusidx/data-mcp"]
    }
  }
}
```

Same pattern for `@verusidx/address-mcp`, `@verusidx/marketplace-mcp`, and `@verusidx/definecurrency-mcp`. See each package's README for details.

## Safety

Giving an AI agent access to a wallet has real consequences. These servers are designed with that in mind.

| Feature | How it works |
|---|---|
| **Read-only mode** | Set `VERUSIDX_READ_ONLY=true` per-server — write tools aren't just disabled, they're not registered. The AI can't see or attempt them. |
| **Spending limits** | Per-currency caps in `spending-limits.json`, enforced before the RPC call reaches the daemon. Default: 10 VRSC per transaction. |
| **Audit logging** | Every write operation logged to date-stamped, append-only JSONL files with `0600` permissions. |
| **No new attack surface** | Credentials read from the daemon's own `.conf` file. No cloud storage. No env vars with passwords. |
| **Minimal dependencies** | Shared library has zero runtime deps. MCP servers depend on exactly 2 packages: `@modelcontextprotocol/sdk` and `zod`. |

## Architecture

```
AI Client (Claude Code, Cursor, etc.)
    |
    |  stdio (local process, no network)
    v
verusidx MCP servers (7 servers, 48 tools)
    |
    |  JSON-RPC over localhost
    v
verusd (your local Verus daemon)
```

- **Shared library** (`@verusidx/shared`) — registry reader, RPC client with credential caching, error normalization, audit logging, spending limits, read-only guard. Zero runtime dependencies.
- **Chain registry** — `chains.json` written atomically by chain-mcp, read by all other servers via `stat()`-based cache invalidation.
- **Each server runs as a separate process** via stdio transport. No shared memory between servers.

## Configuration

Environment variables you can set (optional):

| Variable | Applies to | Description |
|---|---|---|
| `VERUSIDX_READ_ONLY` | All servers | `true` to disable write tools. Set per-server for fine-grained control. |
| `VERUSIDX_AUDIT_LOG` | All servers | `false` to disable audit logging (default: enabled) |
| `VERUSIDX_AUDIT_DIR` | All servers | Custom audit log directory |
| `VERUSIDX_SPENDING_LIMITS_PATH` | All servers | Custom path to `spending-limits.json` |
| `VERUSIDX_DATA_DIR` | chain-mcp | Override the chain data directory for discovery |
| `VERUSIDX_EXTRA_CHAINS` | chain-mcp | Add remote daemons. Format: `name:host:port:user:pass`, comma-separated |
| `VERUSIDX_BIN_PATH` | chain-mcp | Directory containing the `verusd` binary (if not on PATH) |

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

Add entries for any currency: `{ "VRSC": 100, "Bridge.vETH": 0.5 }`. Currency names are case-insensitive.

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
│   ├── data/            # @verusidx/data-mcp
│   ├── definecurrency/  # @verusidx/definecurrency-mcp
│   ├── marketplace/     # @verusidx/marketplace-mcp
│   └── address/         # @verusidx/address-mcp
└── tool-specs/          # Agent-facing tool description specs
```

### Supply Chain Security

- Zero runtime dependencies in the shared library (Node built-ins + built-in `fetch`)
- MCP servers depend only on `@modelcontextprotocol/sdk` and `zod`
- `onlyBuiltDependencies: []` blocks dependency install scripts
- All credentials read from daemon `.conf` files — never stored by the MCP servers

## About Verus

[Verus](https://docs.verus.io/) is an open-source, fair-launch blockchain — no ICO, no premine, no VC funding. Running since 2018 with hybrid PoW/PoS consensus and a CPU-mineable hash algorithm (VerusHash 2.2).

There are no smart contracts. Identity, data storage, DeFi conversions, atomic swaps, privacy (Sapling zk-proofs), and cross-chain bridges (PBaaS) are all consensus-level protocol features. For AI agents that need to transact reliably, protocol-level guarantees beat contract-level ones.

## License

[MIT](LICENSE)
