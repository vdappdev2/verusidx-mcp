# @verusidx/chain-mcp

Foundation MCP server for the Verus blockchain. Handles chain discovery, daemon management, health checks, and raw transaction operations. All other verusidx MCP servers depend on this one.

## Setup

Add to your MCP client config (e.g., Claude Code `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "verusidx-chain": {
      "command": "npx",
      "args": ["@verusidx/chain-mcp"],
      "env": {}
    }
  }
}
```

**Alternative: local install.** If you prefer a pinned version or offline use, install into a project directory with `npm install @verusidx/chain-mcp` (or `pnpm add` / `yarn add`) and point your config at the local path instead of using `npx`.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VERUSIDX_READ_ONLY` | `false` | Set to `true` to disable write tools (`verusd`, `stop`, `sendrawtransaction`, `signrawtransaction`). Read tools and `refresh_chains` remain available. |
| `VERUSIDX_DATA_DIR` | OS default | Override the chain data directory for discovery. Defaults to `~/Library/Application Support/Komodo` (macOS), `~/.komodo` (Linux), `%AppData%\Komodo` (Windows). |
| `VERUSIDX_EXTRA_CHAINS` | — | Add remote daemons. Format: `name:host:port:user:pass`, comma-separated. Example: `remote-vrsc:192.168.1.50:27486:rpcuser:rpcpass` |
| `VERUSIDX_BIN_PATH` | — | Directory containing the `verusd` binary. If not set, searches PATH then OS-specific default locations. |
| `VERUSIDX_AUDIT_LOG` | `true` | Set to `false` to disable audit logging of write operations. |
| `VERUSIDX_AUDIT_DIR` | OS default | Custom directory for audit log files. Defaults to `~/.config/verusidx-mcp/audit` (Linux), `~/Library/Application Support/verusidx-mcp/audit` (macOS). |

### Read-Only Mode

Set `VERUSIDX_READ_ONLY=true` to run in read-only mode. This is useful for monitoring, research, or exploration — no blockchain state can be modified. Write tools are not registered (they won't appear in the tool list). If a stale client attempts to call a write tool anyway, it receives a `WRITE_DISABLED` error.

You can set read-only mode independently per MCP server. For example, keep chain-mcp read-write (for `refresh_chains` and daemon management) while running send-mcp in read-only mode.

## Tools

### Always available

| Tool | Description |
|---|---|
| `getinfo` | Get blockchain and node info (version, block height, connections, sync status) |
| `getwalletinfo` | Get wallet balances (confirmed, unconfirmed, immature, reserve currencies) |
| `help` | Get daemon documentation for any RPC command |
| `getblockcount` | Get current block height (lightweight) |
| `getcurrency` | Get full definition and state of a currency (reserves, weights, prices, fees) |
| `status` | Check registry freshness and daemon reachability |
| `refresh_chains` | Re-run chain discovery and rewrite the registry file |

### Write tools (disabled in read-only mode)

| Tool | Description |
|---|---|
| `stop` | Stop a running daemon (terminates the process for ALL clients) |
| `verusd` | Start a Verus daemon instance (spawns detached process) |
| `sendrawtransaction` | Broadcast a signed raw transaction to the network |
| `signrawtransaction` | Sign inputs of a raw transaction (for multisig workflows) |

## Chain Registry

On first run, call `refresh_chains` to discover local chains. The server scans for `.conf` files in the chain data directory and PBaaS directory, checks which daemons are running, and writes a registry file (`chains.json`). All other verusidx MCP servers read this file to know what chains are available.

Every tool that talks to a daemon requires a `chain` parameter (e.g., `"VRSC"`, `"vrsctest"`). There is no default chain — the agent or user always specifies which chain to operate on.

## Audit Logging

All write operations (`stop`, `verusd`, `sendrawtransaction`, `signrawtransaction`, `refresh_chains`) are logged to date-stamped JSONL files in the audit directory. Each entry records the tool name, chain, parameters, result, and success status. Logs are append-only with `0600` permissions.

## Requirements

- Node.js >= 18.0.0
- At least one Verus daemon installed (for `verusd` tool) or already running (for RPC tools)
