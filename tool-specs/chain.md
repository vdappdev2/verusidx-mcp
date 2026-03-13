# verusidx-chain-mcp — Tool Specs

Foundation MCP server. All other verusidx MCPs depend on this.

Every RPC tool requires a `chain` parameter — no default, no auto-selection. The agent or user always specifies which chain to operate on. The shared library routes the RPC call to the correct daemon by looking up host:port in the chain registry.

**Read-only mode (`VERUSIDX_READ_ONLY=true`):** `verusd`, `stop`, `sendrawtransaction`, and `signrawtransaction` are not registered. All other tools remain available — `refresh_chains` writes only the local registry file, not blockchain state.

---

## 1. `getinfo`

**Description:**
Get blockchain and node information for a running chain. Returns version, block height, connections, difficulty, sync status, and fee configuration. Use this to check whether a daemon is running and synced before performing operations on that chain.

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to query (e.g., `"VRSC"`, `"vrsctest"`) |

**Annotations:**
```json
{
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

**Output:**

Returns the daemon's `getinfo` response directly. Fields documented by the daemon:

| Field | Type | Description |
|---|---|---|
| `version` | number | Server version |
| `protocolversion` | number | Protocol version |
| `walletversion` | number | Wallet version |
| `blocks` | number | Current number of blocks processed |
| `timeoffset` | number | Time offset |
| `connections` | number | Number of connections |
| `tls_established` | number | Number of TLS connections established |
| `tls_verified` | number | Number of TLS connections with validated certificates |
| `proxy` | string | (optional) Proxy used by the server |
| `difficulty` | number | Current difficulty |
| `testnet` | boolean | Whether the server is using testnet |
| `keypoololdest` | number | Timestamp (seconds since epoch) of oldest pre-generated key |
| `keypoolsize` | number | How many new keys are pre-generated |
| `unlocked_until` | number | Timestamp when wallet re-locks, or 0 if locked |
| `paytxfee` | number | Transaction fee in VRSC/kB |
| `relayfee` | number | Minimum relay fee for non-free transactions in VRSC/kB |
| `errors` | string | Any error messages |

The daemon may omit fields that have null or zero values.

**Key fields for agents:**
- `blocks` — compare against network-known height to assess sync status. If the node is behind, results from other tools may be incomplete or stale.
- `connections: 0` — node is isolated and not receiving new blocks.
- `testnet` — confirms you're on the expected network.

---

## 2. `getwalletinfo`

**Description:**
Get wallet state for a running chain. Returns balances (confirmed, unconfirmed, immature, staking-eligible), reserve currency balances, transaction count, and key pool status. Use this for a quick overview of wallet health and native + reserve currency holdings.

Note: `reserve_balance` is an object keyed by currency name, showing all non-native currencies held in the wallet. For detailed per-address multi-currency balances, use `getcurrencybalance` in send-mcp.

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to query (e.g., `"VRSC"`, `"vrsctest"`) |

**Annotations:**
```json
{
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

**Output:**

Returns the daemon's `getwalletinfo` response directly. Fields documented by the daemon:

| Field | Type | Description |
|---|---|---|
| `walletversion` | number | Wallet version |
| `balance` | number | Total confirmed native currency balance |
| `reserve_balance` | object | Confirmed reserve currency balances, keyed by currency name (e.g., `{"vUSDC.vETH": 2.85, "bitcoins": 12842.81}`) |
| `unconfirmed_balance` | number | Total unconfirmed native currency balance |
| `unconfirmed_reserve_balance` | object | Unconfirmed reserve currency balances, keyed by currency name |
| `immature_balance` | number | Immature native currency balance (mining/staking rewards not yet matured) |
| `immature_reserve_balance` | object | Immature reserve currency balances, keyed by currency name |
| `eligible_staking_outputs` | number | Number of UTXOs eligible for staking |
| `eligible_staking_balance` | number | Portion of native balance eligible for staking |
| `txcount` | number | Total number of transactions in the wallet |
| `keypoololdest` | number | Timestamp (seconds since epoch) of oldest pre-generated key |
| `keypoolsize` | number | How many new keys are pre-generated |
| `unlocked_until` | number | Timestamp when wallet re-locks, or 0 if locked |
| `paytxfee` | number | Transaction fee configuration in VRSC/kB |
| `seedfp` | string | BLAKE2b-256 hash of the HD seed |

The daemon may omit fields that have null or zero values. Object-typed balance fields (`reserve_balance`, `unconfirmed_reserve_balance`, `immature_reserve_balance`) may be omitted entirely when no reserve currencies are held in that state.

**Key fields for agents:**
- `balance` — total confirmed spendable native currency.
- `reserve_balance` — all non-native currencies in the wallet. Currency names may contain spaces, dots, and mixed case (e.g., `"Number Go Up.bitcoins"`, `"vUSDC.vETH"`).
- `unlocked_until: 0` — wallet is locked. A locked wallet cannot sign transactions. The user must unlock it before any write operations.

---

## 3. `help`

**Description:**
Get daemon documentation for any RPC command. With no `command` argument, returns a list of all available RPCs grouped by category. With a command name, returns detailed usage including parameters, types, and examples.

Use this when an agent needs to understand an RPC that isn't exposed as an MCP tool, or to check exact parameter formats before constructing a complex call. This tool lives only in chain-mcp — agents using other MCPs call `help` through chain-mcp.

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to query (e.g., `"VRSC"`, `"vrsctest"`) |
| `command` | string | No | RPC command name to get help for (e.g., `"sendcurrency"`, `"getidentity"`). Omit to list all commands. |

**Annotations:**
```json
{
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

**Output:**

Returns the daemon's help text as a string. This is raw documentation formatted for CLI users — agents should parse it as unstructured text.

- **With `command`:** detailed usage for that specific RPC (parameters, types, descriptions, examples).
- **Without `command`:** all available RPCs grouped by category (Addressindex, Blockchain, Control, Identity, Marketplace, Mining, Multichain, Network, Rawtransactions, Util, Vdxf, Wallet).

---

## 4. `stop`

**Description:**
Stop a running daemon. This shuts down the daemon process for the specified chain entirely — ALL connected clients, MCP servers, CLI users, and applications connected to this daemon will lose connectivity. This is not a per-session disconnect; it terminates the daemon.

After stopping, the chain will no longer be reachable. Other MCPs will get `CONNECTION_FAILED` errors until the daemon is restarted with `verusd`. Consider calling `refresh_chains` after stopping so other MCPs see the updated state.

**Disabled in read-only mode.**

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain whose daemon to stop (e.g., `"VRSC"`, `"vrsctest"`) |
| `reason` | string | No | Reason for stopping. Not sent to the daemon — recorded only in the local audit log for accountability. |

**Annotations:**
```json
{
  "readOnlyHint": false,
  "destructiveHint": true,
  "idempotentHint": false,
  "openWorldHint": true,
  "confirmationHint": true
}
```

**Output:**

The daemon returns a string confirmation (e.g., `"Verus server stopping"`). The tool passes this through directly.

**Audit logging:** Yes. The `chain`, `reason`, and result are logged.

---

## 5. `verusd`

**Description:**
Start a Verus daemon instance. This is a system command that spawns a new process — it is NOT an RPC call to an existing daemon. The daemon runs independently of this MCP server (detached process).

After starting, the tool waits briefly and verifies the daemon launched successfully via `getinfo`. Call `refresh_chains` after a successful start so other MCPs can discover the new daemon.

**This tool does NOT use the standard `chain` parameter for RPC routing.** There is no running daemon to route to — the `chain` param here specifies which chain to *launch*.

**Disabled in read-only mode.**

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | No | Chain to start. Omit for VRSC mainnet. For other chains, provide the chain name (e.g., `"vrsctest"`). Maps to the `-chain=` flag. |
| `bootstrap` | boolean | No | Start with `-bootstrap` flag for faster initial sync. Only useful on first start or after a long time offline. Default: `false`. |
| `extra_args` | string[] | No | Additional command-line arguments passed to verusd (e.g., `["-reindex"]`). |

**Annotations:**
```json
{
  "readOnlyHint": false,
  "destructiveHint": false,
  "idempotentHint": false,
  "openWorldHint": true,
  "confirmationHint": true
}
```

**Output (designed — not a daemon response):**

Success:
```json
{
  "started": true,
  "chain": "VRSC",
  "pid": 12345,
  "message": "Daemon started. Run refresh_chains to update the chain registry."
}
```

Failure — binary not found:
```json
{
  "started": false,
  "error": "verusd binary not found — set VERUSIDX_BIN_PATH or add verusd to your PATH"
}
```

Failure — already running:
```json
{
  "started": false,
  "error": "Daemon for VRSC appears to already be running (getinfo responded on port 27486)"
}
```

**Binary path discovery** (checked in order, first match wins):
1. `VERUSIDX_BIN_PATH` env var — must point to a directory containing `verusd`
2. PATH lookup — `which verusd`
3. OS-specific defaults:
   - **macOS:** `/Applications/Verus-Desktop.app/Contents/Resources/verusd/verusd`, `~/verus-cli/verusd`
   - **Linux:** `/opt/verus/verusd`, `~/verus-cli/verusd`
   - **Windows:** `%ProgramFiles%\VerusCoin\verusd.exe`, `%USERPROFILE%\verus-cli\verusd.exe`

**Audit logging:** Yes.

---

## 6. `status`

**Description:**
Check registry freshness and daemon reachability. Use this to verify chain health before starting a workflow, or to debug why calls to other MCPs are failing.

Without a `chain` parameter, returns an overview of all registered chains. With a `chain` parameter, returns detailed status for that specific chain. For each chain checked, attempts a lightweight `getinfo` call with a short timeout (2-3 seconds). This is an on-demand health check, not a periodic heartbeat.

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | No | Specific chain to check. Omit for an overview of all registered chains. |

**Annotations:**
```json
{
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

**Output (designed — not a daemon response):**

All chains:
```json
{
  "registry_age": "2 minutes ago",
  "registry_discovered_at": "2026-03-11T12:00:00Z",
  "chains": {
    "VRSC": {
      "reachable": true,
      "blocks": 3245000,
      "connections": 8,
      "synced": true
    },
    "vrsctest": {
      "reachable": false,
      "error": "CONNECTION_FAILED"
    }
  }
}
```

Single chain:
```json
{
  "chain": "VRSC",
  "reachable": true,
  "blocks": 3245000,
  "connections": 8,
  "synced": true,
  "version": 2030451,
  "testnet": false,
  "registry_age": "2 minutes ago",
  "registry_discovered_at": "2026-03-11T12:00:00Z"
}
```

**Key fields for agents:**
- `reachable: false` — daemon is down or unreachable. Suggest starting it with `verusd` or checking network connectivity.
- `synced: true` — when `blocks` matches the chain tip. Operations on an unsynced node may return stale data.
- `registry_age` — if stale (e.g., "6 hours ago"), suggest running `refresh_chains`.

---

## 7. `refresh_chains`

**Description:**
Re-run chain discovery and rewrite the chain registry file. Call this after starting a new daemon, stopping a daemon, or when the registry appears stale.

Discovery scans OS-appropriate data directories for `.conf` files, parses them, and calls `getinfo` on each discovered chain to confirm it's running. PBaaS chains have hex-encoded folder names in the data directory — discovery resolves these to friendly names by calling `listcurrencies {"systemtype":"pbaas"}` on the VRSC daemon (the root chain where all PBaaS chains are defined) and matching `currencyidhex` to `fullyqualifiedname`. The updated registry is written atomically (write to tmp, then rename). Other MCPs detect the change on their next `stat()` check.

**Available in read-only mode** — this writes only the local registry file, not blockchain state.

**Input Schema:**

No parameters. This tool scans the filesystem and all known chains.

**Annotations:**
```json
{
  "readOnlyHint": false,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": true
}
```

**Output (designed — not a daemon response):**

```json
{
  "discovered": 3,
  "chains": {
    "VRSC": {
      "host": "127.0.0.1",
      "port": 27486,
      "running": true
    },
    "vrsctest": {
      "host": "127.0.0.1",
      "port": 27784,
      "running": true
    },
    "Bridge.vETH": {
      "host": "127.0.0.1",
      "port": 33872,
      "running": false
    }
  },
  "registry_path": "/Users/x/Library/Application Support/verusidx-mcp/chains.json",
  "message": "Registry updated. 2 of 3 discovered chains are running."
}
```

**Notes:**
- Discovery includes chains with `.conf` files that aren't currently running — they appear in the registry so the user can start them later with `verusd`.
- Remote daemons from `VERUSIDX_EXTRA_CHAINS` are included and re-checked for reachability during refresh.

**Audit logging:** Yes — registry rewrites are logged.

---

## 8. `getblockcount`

**Description:**
Get the current block count (height of the longest chain). Returns a single number — the most lightweight way to check the current block height.

Use this for polling block progress, such as waiting for a name commitment to confirm before calling `registeridentity`.

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to query (e.g., `"VRSC"`, `"vrsctest"`) |

**Annotations:**
```json
{
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

**Output:**

Returns a single number — the current block height.

---

## 9. `sendrawtransaction`

**Description:**
Broadcast a signed raw transaction to the network. Takes a hex-encoded signed transaction and submits it to the local node, which relays it to the network. Returns the transaction hash (txid) on success.

This is the companion to `definecurrency` (definecurrency-mcp) — `definecurrency` returns a signed hex that must be broadcast here. Also used for any pre-signed transaction hex, such as multisig transactions signed on another machine.

**Disabled in read-only mode.**

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to broadcast on (e.g., `"VRSC"`, `"vrsctest"`) |
| `hexstring` | string | Yes | The hex-encoded signed raw transaction |
| `allowhighfees` | boolean | No | Allow transactions with unusually high fees. Default: `false`. |

**Annotations:**
```json
{
  "readOnlyHint": false,
  "destructiveHint": false,
  "idempotentHint": false,
  "openWorldHint": true,
  "confirmationHint": true
}
```

**Output:**

Returns the transaction hash (txid) as a hex string on success. On failure, returns an error (e.g., transaction already in chain, invalid signature, missing inputs).

**Key fields for agents:**
- The returned txid can be used with `gettransaction` (send-mcp) to verify confirmation status.
- If the transaction was created by `definecurrency`, the returned txid should match the `txid` from the `definecurrency` response.
- `allowhighfees: true` — use with caution. Only set this if you know the fee is intentionally high.

**Example — broadcast a currency definition:**
```
sendrawtransaction "0400008085202f89..."
```
Returns: `"a3b70a883b11b75ad123a68e1b9e8fa38de44036f8a95e8104cd0c64dcca7b9c"`

**Audit logging:** Yes.

---

## 10. `signrawtransaction`

**Description:**
Sign inputs of a raw transaction. Takes a hex-encoded transaction and signs it with keys available in the wallet (or with explicitly provided private keys). Returns the signed hex and whether all inputs are fully signed.

Use this for multisig workflows where multiple parties need to sign — one party creates the transaction, each signer calls `signrawtransaction` with their key, and the final signed hex is broadcast via `sendrawtransaction`. Also used when a transaction was created on one machine and needs to be signed on another (e.g., a revocation authority signing an ID export on a different wallet).

For `definecurrency` in the normal single-signer case, the hex is returned already signed — `signrawtransaction` is not needed. It is only needed when additional signatures are required.

**Disabled in read-only mode.**

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to sign for (e.g., `"VRSC"`, `"vrsctest"`) |
| `hexstring` | string | Yes | The hex-encoded raw transaction to sign |
| `prevtxs` | object[] | No | Array of previous dependent transaction outputs not yet in the blockchain. Each object: `{"txid": "id", "vout": n, "scriptPubKey": "hex", "redeemScript": "hex", "amount": value}`. `redeemScript` is required for P2SH inputs. |
| `privatekeys` | string[] | No | Array of base58-encoded private keys to use for signing. If provided, only these keys are used (wallet keys are ignored). |
| `sighashtype` | string | No | Signature hash type. Default: `"ALL"`. Options: `"ALL"`, `"NONE"`, `"SINGLE"`, `"ALL\|ANYONECANPAY"`, `"NONE\|ANYONECANPAY"`, `"SINGLE\|ANYONECANPAY"`. |

**Annotations:**
```json
{
  "readOnlyHint": false,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false,
  "confirmationHint": true
}
```

**Output:**

| Field | Type | Description |
|---|---|---|
| `hex` | string | The signed transaction hex. Pass to `sendrawtransaction` when `complete` is `true`. |
| `complete` | boolean | `true` if all inputs are signed. `false` if more signatures are needed (e.g., multisig). |
| `errors` | array | (optional) Array of signing errors, one per failed input |

**Each `errors` entry:**

| Field | Type | Description |
|---|---|---|
| `txid` | string | Hash of the referenced previous transaction |
| `vout` | number | Output index that was being signed |
| `scriptSig` | string | Hex-encoded signature script |
| `sequence` | number | Script sequence number |
| `error` | string | Description of the signing error |

**Key fields for agents:**
- `complete: true` — transaction is fully signed and ready for `sendrawtransaction`.
- `complete: false` — more signatures needed. Pass the `hex` to the next signer's `signrawtransaction`.
- `errors` — present when signing failed for one or more inputs. Check `error` text for details (e.g., missing key, invalid script).
- When using `privatekeys`, the wallet's own keys are NOT used — only the provided keys. Omit `privatekeys` to sign with all available wallet keys.

**Example — sign a transaction with wallet keys:**
```
signrawtransaction "0400008085202f89..."
```
```json
{
  "hex": "0400008085202f89...",
  "complete": true
}
```

**Audit logging:** Yes.

---

## Environment Variables

| Variable | Description |
|---|---|
| `VERUSIDX_DATA_DIR` | Non-standard data directory path for chain discovery |
| `VERUSIDX_EXTRA_CHAINS` | Remote daemons (format: `name:host:port:user:pass`, comma-separated) |
| `VERUSIDX_BIN_PATH` | Directory containing `verusd` binary |
| `VERUSIDX_READ_ONLY` | `true` to disable `verusd`, `stop`, `sendrawtransaction`, and `signrawtransaction`. All read tools and `refresh_chains` remain available. |
| `VERUSIDX_AUDIT_LOG` | `false` to disable audit logging (default: enabled) |
| `VERUSIDX_AUDIT_DIR` | Custom audit log directory |
