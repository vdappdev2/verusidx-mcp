# @verusidx/identity-mcp

MCP server for creating, managing, querying, and signing with VerusIDs. Covers the full identity lifecycle — registration, updates, revocation, recovery, timelocks — plus VDXF key resolution and cryptographic signing/verification.

## Setup

**Prerequisite:** `@verusidx/chain-mcp` must be configured and `refresh_chains` called at least once so the chain registry exists.

Add to your MCP client config (e.g., Claude Code `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "verusidx-identity": {
      "command": "npx",
      "args": ["@verusidx/identity-mcp"],
      "env": {}
    }
  }
}
```

**Alternative: local install.** If you prefer a pinned version or offline use, install into a project directory with `npm install @verusidx/identity-mcp` (or `pnpm add` / `yarn add`) and point your config at the local path instead of using `npx`.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VERUSIDX_READ_ONLY` | `false` | Set to `true` to disable write tools. Read tools and signing tools (`signdata`, `verifysignature`) remain available. |
| `VERUSIDX_AUDIT_LOG` | `true` | Set to `false` to disable audit logging of write operations. |
| `VERUSIDX_AUDIT_DIR` | OS default | Custom directory for audit log files. |

### Read-Only Mode

Set `VERUSIDX_READ_ONLY=true` to disable write tools. In read-only mode, 6 tools remain available:

- All read tools (`getidentity`, `getidentitycontent`, `getidentityhistory`, `getvdxfid`)
- Signing tools (`signdata`, `verifysignature`) — signing reads the private key but does not spend funds or change blockchain/wallet state

Write tools (`registernamecommitment`, `registeridentity`, `updateidentity`, `revokeidentity`, `recoveridentity`, `setidentitytimelock`) are not registered and won't appear in the tool list.

You can set read-only mode independently per MCP server. For example, keep identity-mcp read-write while running send-mcp in read-only mode.

## Tools

### Always available (including read-only mode)

| Tool | Description |
|---|---|
| `getidentity` | Look up a VerusID by name or i-address — current state, authorities, content, wallet relationship |
| `getidentitycontent` | Get identity content/data with optional VDXF key filter and height range (cumulative) |
| `getidentityhistory` | Full revision history — one snapshot per update transaction |
| `getvdxfid` | Resolve a VDXF URI to its on-chain i-address, with optional key/hash/index binding |
| `signdata` | Sign data with a VerusID or t-address (message, file, hex, base64, hash, or MMR) |
| `verifysignature` | Verify a signature produced by `signdata` |

### Write tools (disabled in read-only mode)

| Tool | Description |
|---|---|
| `registernamecommitment` | Step 1 of ID registration — create a name commitment transaction |
| `registeridentity` | Step 2 of ID registration — register using a confirmed commitment |
| `updateidentity` | Update identity fields (addresses, content, authorities) |
| `revokeidentity` | Revoke an identity (safety mechanism for key compromise) |
| `recoveridentity` | Recover a revoked/compromised identity with new keys |
| `setidentitytimelock` | Set or modify a spending timelock on an identity |

## Identity Registration (Two-Step)

Registering a new VerusID is a two-step process:

1. **`registernamecommitment`** — creates a commitment that reserves the name without revealing it (prevents front-running). The commitment data is automatically saved to `~/.verusidx/commitments/<chain>/<name>.json`.

2. **Wait 1 block** for the commitment to confirm.

3. **`registeridentity`** — registers the identity using the confirmed commitment. On success, the saved commitment file is cleaned up.

The commitment file persists across conversations. If a session ends between steps 1 and 2, the next session can pick up where it left off.

## Timelock Safety

The `updateidentity`, `registeridentity`, and `recoveridentity` tools warn that `timelock` must only be set to `0` in the identity definition. Setting `timelock` to any other value can lock the identity — potentially making it unspendable for an extremely long time or permanently. Use `setidentitytimelock` instead, which provides safe `unlockatblock` and `setunlockdelay` controls.

## Audit Logging

All write operations are logged to date-stamped JSONL files in the audit directory. Each entry records the tool name, chain, parameters, result, and success status. Logs are append-only with `0600` permissions.

## Requirements

- Node.js >= 18.0.0
- `@verusidx/chain-mcp` installed and `refresh_chains` called (chain registry must exist)
- At least one Verus daemon running for RPC tools
