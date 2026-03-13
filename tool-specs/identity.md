# verusidx-identity-mcp — Tool Specs

Create, manage, query, and sign with VerusIDs.

Every RPC tool requires a `chain` parameter — no default, no auto-selection. The shared library routes the RPC call to the correct daemon by looking up host:port in the chain registry.

**Read-only mode (`VERUSIDX_READ_ONLY=true`):** All write tools are disabled **except** `signdata` and `verifysignature`. Signing does not spend funds or change blockchain state — it reads the private key but does not modify wallet state. Read-only mode is per-MCP: identity-mcp can be read-write while send-mcp is read-only, or vice versa.

---

## 1. `getidentity`

**Description:**
Look up a VerusID by name or i-address. Returns the identity's current state including primary addresses, signing authorities, content data, revocation/recovery authorities, and wallet relationship (whether this wallet can spend or sign for it). Optionally retrieve the identity as it existed at a specific block height.

Use this to check if an identity exists, inspect its configuration, or verify wallet authority before performing write operations.

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to query (e.g., `"VRSC"`, `"vrsctest"`) |
| `identity` | string | Yes | VerusID name (e.g., `"alice@"`) or i-address |
| `height` | number | No | Return identity as of this block height. Default: current height. Pass `-1` to include mempool. |
| `txproof` | boolean | No | If true, returns a proof of the identity. Default: `false`. |
| `txproofheight` | number | No | Height from which to generate the proof. Default: same as `height`. |

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

Returns the daemon's `getidentity` response directly. Key fields:

| Field | Type | Description |
|---|---|---|
| `friendlyname` | string | Display name (e.g., `"alice.VRSCTEST@"`) |
| `fullyqualifiedname` | string | Fully qualified name including chain (e.g., `"alice.VRSCTEST@"`) |
| `identity` | object | The identity definition (see below) |
| `status` | string | `"active"` or `"revoked"` |
| `canspendfor` | boolean | Whether this wallet can spend funds for this identity |
| `cansignfor` | boolean | Whether this wallet can sign for this identity |
| `blockheight` | number | Block height of the most recent identity transaction |
| `txid` | string | Transaction ID of the most recent identity update |
| `vout` | number | Output index in the transaction |

**Identity object fields:**

| Field | Type | Description |
|---|---|---|
| `version` | number | Identity version |
| `flags` | number | Identity flags |
| `primaryaddresses` | string[] | Addresses that control spending for this identity |
| `minimumsignatures` | number | Number of signatures required (multi-sig) |
| `name` | string | The identity's name (without parent or `@`) |
| `identityaddress` | string | The i-address of this identity |
| `parent` | string | i-address of the parent identity/namespace |
| `systemid` | string | i-address of the chain this identity lives on |
| `contentmap` | object | Key-value content (legacy) |
| `contentmultimap` | object | VDXF-structured content data (see Content Data below) |
| `revocationauthority` | string | i-address of the identity that can revoke this one |
| `recoveryauthority` | string | i-address of the identity that can recover this one |
| `privateaddress` | string | (optional) Sapling z-address for private transactions |
| `timelock` | number | Timelock setting (0 = no lock) |

The daemon may omit fields that have null or zero values (e.g., `privateaddress` is omitted when not set).

**Content Data (`contentmultimap`):**

Content is stored as VDXF-keyed data. The outer keys are VDXF key i-addresses, and each maps to an array of typed data objects. Each object has:
- `version`, `flags`, `mimetype` — metadata about the content
- `objectdata` — either a `{"message": "..."}` object (for `text/plain`) or a hex-encoded string (for `application/json` and other types)
- `label` — a VDXF key or friendly name identifying the field

**Key fields for agents:**
- `canspendfor` / `cansignfor` — check these before attempting write operations on the identity.
- `status: "revoked"` — identity is revoked. Only recovery authority can restore it.
- `parent` vs `systemid` — when these differ, the identity is a sub-identity under a namespace identity.

---

## 2. `getidentitycontent`

**Description:**
Get identity content/data with optional VDXF key filter and height range. Returns the cumulative content state — all content across all updates within the specified range. Unlike `getidentityhistory`, this does not return per-revision snapshots.

Use this to read structured data stored on an identity (profiles, timestamps, application data) without needing to process the full revision history.

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to query (e.g., `"VRSC"`, `"vrsctest"`) |
| `identity` | string | Yes | VerusID name (e.g., `"alice@"`) or i-address |
| `heightstart` | number | No | Only return content from this height forward (inclusive). Default: `0`. |
| `heightend` | number | No | Only return content up to this height (inclusive). Default: `0` (max height). Pass `-1` to include mempool. |
| `txproofs` | boolean | No | If true, returns proofs. Default: `false`. |
| `txproofheight` | number | No | Height from which to generate proofs. Default: same as query height. |
| `vdxfkey` | string | No | Filter to a specific VDXF key. The key is automatically bound to the identity and multimap key. |
| `keepdeleted` | boolean | No | If true, include deleted items. Default: `false`. |

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

Returns the daemon's response directly. Same structure as `getidentity` but with additional height range fields:

| Field | Type | Description |
|---|---|---|
| `fullyqualifiedname` | string | Fully qualified identity name |
| `status` | string | `"active"` or `"revoked"` |
| `canspendfor` | boolean | Whether this wallet can spend for this identity |
| `cansignfor` | boolean | Whether this wallet can sign for this identity |
| `blockheight` | number | Block height of the most recent identity transaction |
| `fromheight` | number | Start of the queried height range |
| `toheight` | number | End of the queried height range |
| `txid` | string | Transaction ID of the most recent identity update |
| `vout` | number | Output index in the transaction |
| `identity` | object | The identity definition with cumulative content |

The `identity` object has the same structure as in `getidentity`, including `contentmultimap` which contains the accumulated content across all updates in the range.

**Key fields for agents:**
- `vdxfkey` filter — use this when you only need content under a specific key, to avoid fetching everything.
- `fromheight` / `toheight` — confirms the range that was actually queried.
- Content in `contentmultimap` is cumulative across all updates in the range.

---

## 3. `getidentityhistory`

**Description:**
Get the full revision history of a VerusID. Returns an array of identity snapshots, one per update transaction. Each entry shows the identity state as it was set in that specific transaction, along with the block hash, height, and transaction details.

Use this to audit changes to an identity over time — primary address changes (transfers), content updates, authority changes, etc.

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to query (e.g., `"VRSC"`, `"vrsctest"`) |
| `identity` | string | Yes | VerusID name (e.g., `"alice@"`) or i-address |
| `heightstart` | number | No | Only return history from this height forward (inclusive). Default: `0`. |
| `heightend` | number | No | Only return history up to this height (inclusive). Default: `0` (max height). Pass `-1` to include mempool. |
| `txproofs` | boolean | No | If true, returns proofs. Default: `false`. |
| `txproofheight` | number | No | Height from which to generate proofs. Default: same as query height. |

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

Returns the daemon's response directly. Top-level fields reflect the current identity state, with a `history` array containing all revisions:

| Field | Type | Description |
|---|---|---|
| `fullyqualifiedname` | string | Fully qualified identity name |
| `status` | string | `"active"` or `"revoked"` |
| `canspendfor` | boolean | Whether this wallet can spend for this identity |
| `cansignfor` | boolean | Whether this wallet can sign for this identity |
| `blockheight` | number | Block height of the most recent identity transaction |
| `txid` | string | Transaction ID of the most recent identity update |
| `vout` | number | Output index in the transaction |
| `history` | array | Array of identity revision objects |

**Each history entry:**

| Field | Type | Description |
|---|---|---|
| `identity` | object | Full identity definition at this revision |
| `blockhash` | string | Block hash where this revision was mined |
| `height` | number | Block height of this revision |
| `output` | object | `{"txid": "...", "voutnum": 0}` — transaction reference |

**Key fields for agents:**
- Each history entry's `contentmultimap` shows only the content set in **that specific update transaction**, not the cumulative state. Use `getidentitycontent` for the cumulative view.
- `primaryaddresses` changes between entries indicate identity transfers.
- Multiple entries can appear at the same `height` if multiple updates were mined in the same block.

---

## 4. `getvdxfid`

**Description:**
Get the VDXF key ID from a URI string. Converts a human-readable VDXF URI (e.g., `"vrsc::system.currency.export"`) into its on-chain i-address representation. Optionally combine with additional data (another VDXF key, a 256-bit hash, or an index number) to derive bound keys.

Use this to resolve VDXF key names to i-addresses before querying `getidentitycontent` with a `vdxfkey` filter, or to understand what a VDXF key i-address represents.

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to query (e.g., `"VRSC"`, `"vrsctest"`) |
| `vdxfuri` | string | Yes | VDXF URI string (e.g., `"vrsc::system.currency.export"`, `"idname::userdefinedgroup.subgroup.name"`) |
| `vdxfkey` | string | No | VDXF key or i-address to combine via hash |
| `uint256` | string | No | 256-bit hex hash to combine with the key |
| `indexnum` | number | No | Integer to combine with the key |

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

Returns the daemon's response directly:

| Field | Type | Description |
|---|---|---|
| `vdxfid` | string | Base58check i-address of the resolved VDXF key |
| `hash160result` | string | 20-byte hex hash of the processed URI |
| `qualifiedname` | object | `{"name": "...", "parentid" or "namespace": "..."}` — parsed name components |
| `bounddata` | object | (present only when binding params used) Shows the combined key, hash, and/or index |

---

## 5. `registernamecommitment`

**Description:**
Step 1 of identity registration. Creates a name commitment transaction that reserves a name without revealing it. The commitment hides the name itself while ensuring miners cannot front-run the registration.

After this tool succeeds, **wait 1 block** before calling `registeridentity` (step 2). The tool saves the commitment data to `~/.verusidx/commitments/<chain>/<name>.json` so it persists across conversations — if a session ends before registration, the next session can pick up the commitment.

Names must not have leading, trailing, or multiple consecutive spaces and must not include: `\ / : * ? " < > | @`

**Disabled in read-only mode.**

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to register on (e.g., `"VRSC"`, `"vrsctest"`) |
| `name` | string | Yes | The unique name to commit to. Creating a commitment is not a registration — if the name already exists, the daemon will reject the transaction. |
| `controladdress` | string | Yes | Address that will control this commitment. Must be present in the current wallet. This is not necessarily the address that will control the actual identity. |
| `referralidentity` | string | No | Friendly name or i-address of a referral identity, used to lower network cost of the ID. |
| `parentnameorid` | string | No | Parent name or currency i-address. Dictates issuance rules and pricing. Only for PBaaS sub-identities. |
| `sourceoffunds` | string | No | Address to use as source of funds. Default: transparent wildcard `"*"`. |

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

Returns the daemon's response directly:

| Field | Type | Description |
|---|---|---|
| `txid` | string | Transaction ID of the commitment |
| `namereservation` | object | Commitment details (see below) |

**`namereservation` fields:**

| Field | Type | Description |
|---|---|---|
| `name` | string | The unique name in this commitment |
| `salt` | string | Hex salt used to hide the commitment |
| `referral` | string | i-address of the referring identity (if provided) |
| `parent` | string | Name of the parent (if not VRSC/vrsctest) |
| `nameid` | string | i-address this identity will have if created |

**Side effect:** On success, writes the commitment data to `~/.verusidx/commitments/<chain>/<name>.json`. The file contains the full response (txid + namereservation) plus a timestamp for tracking. The directory is created on demand.

**Audit logging:** Yes.

---

## 6. `registeridentity`

**Description:**
Step 2 of identity registration. Uses a confirmed name commitment to register the identity on-chain. The commitment must have been mined (wait 1 block after `registernamecommitment`).

The tool reads the commitment data from `~/.verusidx/commitments/<chain>/<name>.json` if available, so the agent does not need to pass the commitment details manually. On successful registration, the commitment file is deleted and the chain directory is cleaned up if empty.

**Disabled in read-only mode.**

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to register on (e.g., `"VRSC"`, `"vrsctest"`) |
| `jsonidregistration` | object | Yes | Registration object containing the commitment and identity definition (see below) |
| `returntx` | boolean | No | If true, return the signed transaction hex instead of broadcasting. Default: `false`. |
| `feeoffer` | number | No | Amount to offer miner/staker for the registration fee. Default: standard price. |
| `sourceoffunds` | string | No | Address to use as source of funds. Default: transparent wildcard `"*"`. |

**`jsonidregistration` structure:**
```
{
  "txid": "hexid",           // from registernamecommitment output
  "namereservation": {
    "name": "namestr",       // from registernamecommitment output
    "salt": "hexstr",        // from registernamecommitment output
    "referral": "identityID" // must match commitment if one was used
  },
  "identity": {
    "name": "namestr",       // must match commitment name
    "parent": "parentnameorid", // always include — see note below
    "primaryaddresses": ["Raddr", ...],
    "minimumsignatures": 1,
    "revocationauthority": "nameorID",
    "recoveryauthority": "nameorID",
    "privateaddress": "zaddr",  // optional
    "contentmultimap": {}       // optional initial content
  }
}
```

Always include `parent` in the identity definition to ensure correct namespace resolution, especially for sub-identities. Omitting `parent` for a sub-identity causes errors; including it for a root identity is harmless.

**`timelock` must only be set to `0`** in this tool. Setting `timelock` to any other value can lock the identity — potentially making it unspendable for an extremely long time or permanently. To configure timelocks, use `setidentitytimelock` which provides safe `unlockatblock` and `setunlockdelay` controls.

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

Returns the transaction ID (hex string) if `returntx` is false, or the signed transaction hex if `returntx` is true.

**Side effect:** On successful registration, deletes `~/.verusidx/commitments/<chain>/<name>.json` and removes the chain directory if empty. If the `commitments/` directory is also empty, it is removed.

**Audit logging:** Yes.

---

## 7. `updateidentity`

**Description:**
Update an identity's fields — primary addresses, content, authorities, or any other mutable property. The wallet must hold authority to update (either primary authority, or token authority if `tokenupdate` is true).

Pass the full identity definition with the desired changes. Fields not included revert to defaults — to preserve existing values, first read them with `getidentity` and include them in the update.

**Disabled in read-only mode.**

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to update on (e.g., `"VRSC"`, `"vrsctest"`) |
| `jsonidentity` | object | Yes | New identity definition. Must include `"name"` at minimum. Always include `"parent"` to ensure correct namespace resolution, especially for sub-identities. |
| `returntx` | boolean | No | If true, return signed transaction hex instead of broadcasting. Default: `false`. |
| `tokenupdate` | boolean | No | If true, use the tokenized ID control token for authority. Provides revoke and recovery authority for the update but does not give primary authority. Default: `false`. |
| `feeoffer` | number | No | Non-standard fee amount. |
| `sourceoffunds` | string | No | Address to source funds from, to preserve privacy. |

Always include `parent` in the identity definition to ensure correct namespace resolution, especially for sub-identities. Omitting `parent` for a sub-identity causes errors; including it for a root identity is harmless.

**`timelock` must only be set to `0`** in this tool. Setting `timelock` to any other value can lock the identity — potentially making it unspendable for an extremely long time or permanently. To configure timelocks, use `setidentitytimelock` which provides safe `unlockatblock` and `setunlockdelay` controls.

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

Returns the transaction ID (hex string) if `returntx` is false, or the signed transaction hex if `returntx` is true.

**Audit logging:** Yes.

---

## 8. `revokeidentity`

**Description:**
Revoke an identity, making it unable to spend funds or sign transactions. Only the revocation authority (or token revocation authority) can perform this action. A revoked identity can only be restored by the recovery authority using `recoveridentity`.

This is a safety mechanism — use it if the identity's private keys are compromised.

**Disabled in read-only mode.**

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to revoke on (e.g., `"VRSC"`, `"vrsctest"`) |
| `identity` | string | Yes | VerusID name (e.g., `"alice@"`) or i-address to revoke |
| `returntx` | boolean | No | If true, return signed transaction hex instead of broadcasting. Default: `false`. |
| `tokenrevoke` | boolean | No | If true, use the tokenized ID control token to revoke. Default: `false`. |
| `feeoffer` | number | No | Non-standard fee amount. |
| `sourceoffunds` | string | No | Address to source funds from, to preserve privacy. |

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

Returns the transaction ID (hex string) if `returntx` is false, or the signed transaction hex if `returntx` is true.

**Audit logging:** Yes.

---

## 9. `recoveridentity`

**Description:**
Recover a revoked or compromised identity. Only the recovery authority (or token recovery authority) can perform this. Typically used to set new primary addresses after a key compromise, effectively transferring control to new keys.

Pass the full identity definition with the desired recovery state (new primary addresses, etc.).

**Disabled in read-only mode.**

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to recover on (e.g., `"VRSC"`, `"vrsctest"`) |
| `jsonidentity` | object | Yes | New identity definition for the recovered state. Always include `"parent"` — see note below. |
| `returntx` | boolean | No | If true, return signed transaction hex instead of broadcasting. Default: `false`. |
| `tokenrecover` | boolean | No | If true, use the tokenized ID control token to recover. Default: `false`. |
| `feeoffer` | number | No | Non-standard fee amount. |
| `sourceoffunds` | string | No | Address to source funds from, to preserve privacy. |

Always include `parent` in the identity definition to ensure correct namespace resolution, especially for sub-identities. Omitting `parent` for a sub-identity causes errors; including it for a root identity is harmless.

**`timelock` must only be set to `0`** in this tool. Setting `timelock` to any other value can lock the identity — potentially making it unspendable for an extremely long time or permanently. To configure timelocks, use `setidentitytimelock` which provides safe `unlockatblock` and `setunlockdelay` controls.

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

Returns the transaction ID (hex string) if `returntx` is false, or the signed transaction hex if `returntx` is true.

**Audit logging:** Yes.

---

## 10. `setidentitytimelock`

**Description:**
Set or modify a timelock on a VerusID. Timelocking restricts when an identity can spend funds on this chain. Two modes:

- **`unlockatblock`** — set an absolute block height at which the identity unlocks. The countdown starts immediately when mined. Passing the current block height starts an unlock (but still requires waiting for any unlock delay).
- **`setunlockdelay`** — set a delay (in blocks) that must pass after an unlock request before funds become spendable. Can only be circumvented by revoke/recover.

Exactly one of `unlockatblock` or `setunlockdelay` must be specified.

This only affects the identity on the current chain — not on other chains where the identity may have been exported.

**Disabled in read-only mode.**

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to set timelock on (e.g., `"VRSC"`, `"vrsctest"`) |
| `identity` | string | Yes | VerusID name (e.g., `"alice@"`) or i-address |
| `unlockatblock` | number | No | Absolute block height to unlock at. Mutually exclusive with `setunlockdelay`. |
| `setunlockdelay` | number | No | Number of blocks to delay after unlock request. Mutually exclusive with `unlockatblock`. |
| `returntx` | boolean | No | If true, return signed transaction hex instead of broadcasting. Default: `false`. |
| `feeoffer` | number | No | Non-standard fee amount. |
| `sourceoffunds` | string | No | Address to source funds from, to preserve privacy. |

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

Returns the transaction ID (hex string) if `returntx` is false, or the signed transaction hex if `returntx` is true.

**Audit logging:** Yes.

---

## 11. `signdata`

**Description:**
Sign data with a VerusID or transparent address. Generates a hash of the provided data and signs it. Supports multiple input modes and hash algorithms. Can sign a single piece of data or build a Merkle Mountain Range (MMR) over multiple items.

For multi-sig identities, pass an existing partial `signature` to accumulate signatures.

**Available in read-only mode** — signing does not spend funds or change blockchain/wallet state.

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to sign on (e.g., `"VRSC"`, `"vrsctest"`) |
| `address` | string | Yes | VerusID name or t-address to sign with. A t-address produces a simple signature. |
| `message` | string | No | Text message to sign. |
| `filename` | string | No | File path to sign. |
| `messagehex` | string | No | Hex-encoded data to sign. |
| `messagebase64` | string | No | Base64-encoded data to sign. |
| `datahash` | string | No | Pre-computed 256-bit hex hash to sign directly. |
| `mmrdata` | array | No | Array of data objects for MMR signing. Each element: `{"filename" or "message" or "serializedhex" or "serializedbase64" or "vdxfdata" or "datahash": "value"}`. |
| `mmrsalt` | array | No | Array of salt strings to protect privacy of MMR leaf nodes. |
| `mmrhashtype` | string | No | Hash type for MMR: `"sha256"`, `"sha256D"`, `"blake2b"`, `"keccak256"`. Default: `"blake2b"`. |
| `prefixstring` | string | No | Extra string hashed during signing — must be supplied for verification. |
| `vdxfkeys` | string[] | No | Array of VDXF keys or i-addresses to bind to the signature. |
| `vdxfkeynames` | string[] | No | Array of VDXF key names or friendly name IDs (no i-addresses). |
| `boundhashes` | string[] | No | Array of hex hashes to bind to the signature. |
| `hashtype` | string | No | Hash algorithm: `"sha256"` (default), `"sha256D"`, `"blake2b"`, `"keccak256"`. |
| `signature` | string | No | Existing base64 signature for multi-sig accumulation. |
| `encrypttoaddress` | string | No | Sapling address to encrypt data to. All data decryptable with the incoming viewing key. |
| `createmmr` | boolean | No | If true (or if multiple items are provided), returns MMR data and root signature. |

Exactly one data input mode must be provided: `message`, `filename`, `messagehex`, `messagebase64`, `datahash`, or `mmrdata`.

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

Returns the daemon's response directly:

| Field | Type | Description |
|---|---|---|
| `hash` | string | Hex hash of the signed data (single item) |
| `hashes` | string[] | Array of hex hashes (MMR mode, alternate to `hash`) |
| `mmrroot` | string | (MMR only) Root hash of the Merkle Mountain Range |
| `signature` | string | Base64-encoded signature (of the data hash or MMR root) |
| `vdxfkeys` | string[] | Bound VDXF keys (echoed back) |
| `vdxfkeynames` | string[] | Bound VDXF key names (echoed back) |
| `boundhashes` | string[] | Bound hashes (echoed back) |
| `hashtype` | string | Hash algorithm used |

---

## 12. `verifysignature`

**Description:**
Verify a signature produced by `signdata`. Checks that the signature is valid for the given data and identity/address. By default, validates against the identity's keys at the block height stored in the signature — use `checklatest` to verify against the identity's current keys instead.

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to verify on (e.g., `"VRSC"`, `"vrsctest"`) |
| `address` | string | Yes | VerusID name or t-address to verify against. |
| `message` | string | No | Text message that was signed. |
| `filename` | string | No | File path that was signed. |
| `messagehex` | string | No | Hex-encoded data that was signed. |
| `messagebase64` | string | No | Base64-encoded data that was signed. |
| `datahash` | string | No | Pre-computed 256-bit hex hash that was signed. |
| `prefixstring` | string | No | Prefix string used during signing (must match). |
| `vdxfkeys` | string[] | No | VDXF keys bound during signing (must match). |
| `vdxfkeynames` | string[] | No | VDXF key names bound during signing (must match). |
| `boundhashes` | string[] | No | Hashes bound during signing (must match). |
| `hashtype` | string | No | Hash algorithm used during signing. Default: `"sha256"`. |
| `signature` | string | Yes | Base64-encoded signature to verify. |
| `checklatest` | boolean | No | If true, verify against the identity's current keys. Default: `false` (verify against keys at the signing height stored in the signature). |

Exactly one data input mode must be provided: `message`, `filename`, `messagehex`, `messagebase64`, or `datahash`.

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

Returns the daemon's response directly:

| Field | Type | Description |
|---|---|---|
| `hash` | string | Hex hash of the verified data |
| `signature` | string | The verified signature (echoed back) |
