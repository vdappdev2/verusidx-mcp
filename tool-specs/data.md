# verusidx-data-mcp — Tool Specs

On-chain data retrieval, decryption, signing, and verification. Completes the store→retrieve→decrypt pipeline that starts with `sendcurrency:data` (send-mcp), and provides signing/verification tools for off-chain data workflows.

Every RPC tool requires a `chain` parameter — no default, no auto-selection. The shared library routes the RPC call to the correct daemon by looking up host:port in the chain registry.

**Read-only mode (`VERUSIDX_READ_ONLY=true`):** `z_importviewingkey` is not registered. All other tools (including `signdata` and `verifysignature`) remain available — signing does not modify chain or wallet state.

---

## Data workflow coverage

```
Store:     sendcurrency:data  (send-mcp)
              ↓
List:      z_listreceivedbyaddress  (data-mcp)
              ↓
Decrypt:   decryptdata + z_exportviewingkey  (data-mcp)

Sign:      signdata  (data-mcp)
Verify:    verifysignature  (data-mcp)

Share access: z_exportviewingkey → z_importviewingkey  (data-mcp)
```

---

## 1. `z_listreceivedbyaddress`

**Description:**
List transactions and data received at a shielded (z) address. Data transactions appear with `amount: 0` and a `memo` containing the data descriptor — a JSON object keyed by the VDXF datadescriptor address (`i4GC1YGEVD21afWudGoFJVdnfjJ5XWnCQv`). Value transactions appear with their amount and standard hex memo.

Use this as **step 1** of the data retrieval pipeline: list received data, then pass the descriptor to `decryptdata`.

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to query (e.g., `"VRSC"`, `"vrsctest"`) |
| `address` | string | Yes | The shielded (zs-) address to list received transactions for. |
| `minconf` | number | No | Only include transactions confirmed at least this many times. Default: `1`. |

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

Returns an array of received transactions. Key fields per entry:

| Field | Type | Description |
|---|---|---|
| `txid` | string | Transaction ID |
| `amount` | number | Amount received. `0` for data-only transactions. |
| `memo` | string or array | Hex memo string for value txs. For data txs: array containing a JSON data descriptor object and padding. |
| `outindex` | number | The output index within the transaction |
| `confirmations` | number | Number of block confirmations |
| `change` | boolean | Whether this output is change back to the sender |

**Key fields for agents:**
- `amount: 0` with a structured `memo` array → this is a **data transaction**.
- `amount > 0` with a hex `memo` string → this is a **value transaction**.
- The data descriptor is keyed by `i4GC1YGEVD21afWudGoFJVdnfjJ5XWnCQv` (VDXF datadescriptor type). Inside it, `objectdata` contains a `crosschaindataref` (`iP3euVSzNcXUrLNHnQnR9G6q8jeYuGSxgw`) pointing to the data location.

**Extracting the descriptor for `decryptdata`:**
```
descriptor = memo[0]["i4GC1YGEVD21afWudGoFJVdnfjJ5XWnCQv"]
```
Pass this object as the `datadescriptor` parameter to `decryptdata`, along with the `txid` from the same entry.

---

## 2. `decryptdata`

**Description:**
Decrypt data stored on-chain. Accepts a data descriptor (from `z_listreceivedbyaddress` memo), viewing key (EVK or IVK), and optional txid. With `retrieve: true`, the daemon fetches and decrypts the referenced data.

**Always pass the EVK** (from `z_exportviewingkey`) when decrypting. Without it, the daemon returns the still-encrypted data (`flags: 5`) even if the wallet holds the spending key for the z-address.

For encrypted identity content stored via `updateidentity`, pass the **original** encrypted DataDescriptor from `signdata` (not the on-chain version, which may have modified flags). Alternatively, use `iddata` to query and decrypt identity content in one step (note: may fail for encrypted content due to flags modification by `updateidentity`).

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to query (e.g., `"VRSC"`, `"vrsctest"`) |
| `datadescriptor` | object | No | Data descriptor object to decrypt. Typically the value under the `i4GC1YGEVD21...` key from `z_listreceivedbyaddress` memo. Either `datadescriptor` or `iddata` is required. |
| `iddata` | object | No | Query identity content and decrypt in one step. See iddata fields below. |
| `evk` | string | Recommended | Sapling extended full viewing key for decryption. Always pass this — export via `z_exportviewingkey`. Without it, data is returned still encrypted. |
| `ivk` | string | No | Hex incoming viewing key for decryption. |
| `txid` | string | No | Transaction ID containing the data. Required when `retrieve` is true and the data references the same transaction. |
| `retrieve` | boolean | No | If true, fetch the data from its on-chain reference and decrypt. Default: `false`. |

**`iddata` fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `identityid` | string | Yes | Identity name or i-address to query content from. |
| `vdxfkey` | string | No | VDXF key (i-address) to filter content by. |
| `startheight` | number | No | Start block height for content query range. |
| `endheight` | number | No | End block height for content query range. |
| `getlast` | boolean | No | If true, return only the most recent content entry. |

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

Returns an array of decrypted data objects:

| Field | Type | Description |
|---|---|---|
| `version` | number | Data format version |
| `flags` | number | Status flags. `2` = contains decrypted data. |
| `objectdata` | string | Hex-encoded decrypted content. Decode with hex→UTF-8 for text messages. |
| `salt` | string | Auto-generated encryption salt (hex) |

**Flags reference:**

| `flags` | Meaning | `objectdata` contains |
|---|---|---|
| `0` | Original descriptor (pre-retrieval) | Nested `crosschaindataref` pointing to data location |
| `2` | Successfully decrypted data | Hex-encoded plaintext — decode hex→UTF-8 for text |
| `5` | Still encrypted (EVK was not provided) | Ciphertext hex + `epk` field present |
| `64` | Has mimetype | Same as `0` but with a `mimetype` field (e.g., `"image/jpeg"`) |

**Key fields for agents:**
- `objectdata` is hex-encoded. For text messages, decode hex to UTF-8 to get the original message.
- `flags: 2` indicates successfully decrypted data. If you get `flags: 5`, the data is still encrypted — pass the EVK and retry.
- If decryption fails, the daemon returns an error — not partially decrypted data.

**Example workflow:**
```
1. z_listreceivedbyaddress → find data tx (amount: 0) → extract descriptor from memo
2. z_exportviewingkey → get EVK for the z-address
3. decryptdata with descriptor + txid + retrieve:true + evk → decrypted hex content
4. Hex-decode objectdata → original message/data
```

---

## 3. `z_exportviewingkey`

**Description:**
Export the extended viewing key (EVK) for a shielded address. The viewing key allows decryption of all data encrypted to this z-address without granting spending authority. Share it to grant read-only access to encrypted data. Pass the returned key as the `evk` parameter to `decryptdata`.

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to query (e.g., `"VRSC"`, `"vrsctest"`) |
| `address` | string | Yes | The shielded (zs-) address to export the viewing key for. |

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

Returns a single string — the extended viewing key (e.g., `"zxviews1q..."`).

**Key fields for agents:**
- The EVK decrypts **all** data encrypted to this z-address. For selective disclosure, use SSKs from `signdata` instead.
- This is read-only — it reveals a key, does not modify the wallet.

**Sharing a viewing key on-chain:**

To grant another user read access to your encrypted data, send them the viewing key via one of these methods:

1. **`sendcurrency:data`** (send-mcp) — send a data transaction to the recipient's z-address with the viewing key as the message. The key is encrypted to their address — only they can read it. The recipient retrieves it via `z_listreceivedbyaddress` → `decryptdata` → `z_importviewingkey`.

2. **Z-transaction memo** — send a standard shielded transaction to the recipient's z-address. The 512-byte memo field fits a viewing key (~300 chars). The recipient sees the key in the memo when listing received transactions.

```
Alice: z_exportviewingkey → sendcurrency:data (to Bob's z-address)  [send-mcp]
Bob:   z_listreceivedbyaddress → decryptdata → z_importviewingkey   [data-mcp]
```

---

## 4. `z_viewtransaction`

**Description:**
View detailed shielded transaction information including spends and outputs. Shows addresses, amounts, memos, and output indices. Useful for inspecting data-carrying transactions to understand their structure before decryption.

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to query (e.g., `"VRSC"`, `"vrsctest"`) |
| `txid` | string | Yes | Transaction ID to inspect. |

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

Returns detailed transaction information:

| Field | Type | Description |
|---|---|---|
| `txid` | string | The transaction ID |
| `spends` | array | Shielded inputs (spending notes) |
| `outputs` | array | Shielded outputs (created notes) |

**Per-output fields:**

| Field | Type | Description |
|---|---|---|
| `type` | string | `"sapling"` or `"sprout"` |
| `output` | number | Output index |
| `address` | string | The z-address involved |
| `recovered` | boolean | True if the output is not for a wallet address |
| `value` | number | Amount in VRSC |
| `valueZat` | number | Amount in zatoshis |
| `memo` | string or array | Memo field — for data txs, contains the structured data descriptor |
| `memoStr` | string | (optional) UTF-8 interpretation of memo if valid text |

---

## 5. `signdata`

**Description:**
Sign data with a VerusID or transparent address. Generates a hash of the provided data and signs it. Supports multiple input modes and hash algorithms. Can sign a single piece of data or build a Merkle Mountain Range (MMR) over multiple items.

For multi-sig identities, pass an existing partial `signature` to accumulate signatures.

Can also **encrypt** data to a z-address via `encrypttoaddress` — returns both encrypted and plaintext versions with an SSK (specific symmetric key) for selective disclosure.

**Available in read-only mode** — signing does not spend funds or change blockchain/wallet state.

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to sign on (e.g., `"VRSC"`, `"vrsctest"`) |
| `address` | string | Yes | VerusID name or R-address to sign with. A R-address produces a simple signature. |
| `message` | string | No | Text message to sign. |
| `filename` | string | No | File path to sign. Requires `-enablefileencryption` daemon flag. |
| `messagehex` | string | No | Hex-encoded data to sign. |
| `messagebase64` | string | No | Base64-encoded data to sign. May not work in all daemon versions — prefer `messagehex` if base64 fails. |
| `datahash` | string | No | Pre-computed 256-bit hex hash to sign directly. |
| `vdxfdata` | string or object | No | VDXF-encoded structured data. **String form** hashes the raw string (equivalent to `message`). **Object form** performs VDXF binary serialization before hashing — use for canonical signing of VDXF-structured content such as contentmultimap entries. |
| `mmrdata` | array | No | Array of data objects for MMR signing. Each element: `{"filename" or "message" or "serializedhex" or "serializedbase64" or "vdxfdata" or "datahash": "value"}`. |
| `mmrsalt` | array | No | Array of salt strings to protect privacy of MMR leaf nodes. |
| `mmrhashtype` | string | No | Hash type for MMR: `"sha256"`, `"sha256D"`, `"blake2b"`, `"keccak256"`. Default: `"blake2b"`. |
| `prefixstring` | string | No | Extra string hashed during signing — must be supplied for verification. |
| `vdxfkeys` | string[] | No | Array of VDXF keys or i-addresses to bind to the signature. |
| `vdxfkeynames` | string[] | No | Array of VDXF key names or friendly name IDs (no i-addresses). |
| `boundhashes` | string[] | No | Array of hex hashes to bind to the signature. |
| `hashtype` | string | No | Hash algorithm: `"sha256"` (default), `"sha256D"`, `"blake2b"`, `"keccak256"`. |
| `signature` | string | No | Existing base64 signature for multi-sig accumulation. |
| `encrypttoaddress` | string | No | Sapling z-address to encrypt data to. Returns both encrypted and plaintext versions. The encrypted DataDescriptor can be stored on an identity via `updateidentity` or sent via `sendcurrency`. |
| `createmmr` | boolean | No | If true (or if multiple items are provided), returns MMR data and root signature. |

Exactly one data input mode must be provided: `message`, `filename`, `messagehex`, `messagebase64`, `datahash`, `vdxfdata`, or `mmrdata`.

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
| `signaturedata` | object | Structured signature data for passing to `verifysignature` |
| `identity` | string | Signing identity name |
| `canonicalname` | string | Canonical identity name |
| `address` | string | Identity i-address |
| `signatureheight` | number | Block height at time of signing |
| `hashtype` | string | Hash algorithm used |
| `vdxfkeys` | string[] | Bound VDXF keys (echoed back) |
| `vdxfkeynames` | string[] | Bound VDXF key names (echoed back) |
| `boundhashes` | string[] | Bound hashes (echoed back) |

**Note on `boundhashes`:** The `signaturedata.boundhashes` field contains byte-reversed hashes (internal daemon format). For `verifysignature`, always use the original boundhashes you passed to `signdata`, not the reversed values from `signaturedata`.

**`vdxfdata` string vs object form:** String form produces the same hash as `message` with identical content. Object form (e.g., `{"iK7a5JNJnbeuYWVHCDRpJosj3irGJ5Qa8c": "hello"}`) performs VDXF binary serialization first, producing a different hash — use this when signing data in the same canonical format as on-chain identity contentmultimap entries.

**When `encrypttoaddress` is used, additional fields:**

| Field | Type | Description |
|---|---|---|
| `mmrdescriptor_encrypted` | object | Contains `datadescriptors` array with encrypted DataDescriptors (`flags: 5`, ciphertext `objectdata`, `epk`) |
| `signaturedata_encrypted` | object | Encrypted version of `signaturedata` (`flags: 5`, ciphertext, `epk`). Can be shared while keeping the plaintext signature private. |
| `signaturedata_ssk` | string | Specific symmetric key for this object — enables selective decryption of just this item |
| `mmrdescriptor` | object | Contains `datadescriptors` array with plaintext versions (`flags: 2`, original data, `salt`) |

---

## 6. `verifysignature`

**Description:**
Verify a signature produced by `signdata`. Checks that the signature is valid for the given data and identity/address. Returns `signaturestatus: "verified"` or `"invalid"` — always check this field. By default, validates against the identity's keys at the block height stored in the signature — use `checklatest` to verify against the identity's current keys instead.

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to verify on (e.g., `"VRSC"`, `"vrsctest"`) |
| `address` | string | Yes | VerusID name or R-address to verify against. |
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
| `signaturestatus` | string | `"verified"` if the signature is valid, `"invalid"` if it does not match |
| `hash` | string | Hex hash of the verified data |
| `signature` | string | The verified signature (echoed back) |
| `identity` | string | Identity name verified against |
| `canonicalname` | string | Canonical identity name |
| `address` | string | Identity i-address |
| `hashtype` | string | Hash algorithm used |
| `height` | number | Current block height |
| `signatureheight` | number | Block height stored in the signature |

**Key fields for agents:**
- `signaturestatus: "verified"` — the signature is valid.
- `signaturestatus: "invalid"` — the signature does NOT match the provided data, identity, or bound parameters. This is a normal response, not an error — always check this field.
- Errors (thrown as exceptions) indicate structural problems only: invalid identity, missing required params, etc.

**Verifying MMR signatures:** The daemon's `verifysignature` does not accept MMR-specific params (`mmrdata`, `mmrsalt`). To verify an MMR signature, pass the `hash` field from `signdata`'s response (the MMR root) as the `datahash` parameter to `verifysignature`. Important: also pass `hashtype: "blake2b"` (or whatever `mmrhashtype` was used during signing) — the MMR signature's internal hashtype may differ from the top-level `hashtype` in the response.

**Known issue:** The daemon hashes `message` differently in `verifysignature` vs `signdata`. This MCP tool automatically converts `message` to `messagehex` before calling the daemon, so the workaround is transparent — agents can use `message` for both signing and verification.

---

## 7. `z_importviewingkey`

**Description:**
Import a viewing key to enable decryption of data encrypted to another z-address. Grants read-only access without spending authority. The key can be obtained from `z_exportviewingkey`. After import, `decryptdata` can decrypt data encrypted to that address without passing the key explicitly.

**Disabled in read-only mode.**

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to import on (e.g., `"VRSC"`, `"vrsctest"`) |
| `vkey` | string | Yes | The viewing key to import (from `z_exportviewingkey`). |
| `rescan` | string | No | Whether to rescan the wallet for transactions: `"yes"`, `"no"`, or `"whenkeyisnew"` (default). |
| `startHeight` | number | No | Block height to start rescan from. Default: `0`. |

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

Returns information about the imported key:

| Field | Type | Description |
|---|---|---|
| `type` | string | `"sprout"` or `"sapling"` |
| `address` | string | The address corresponding to the viewing key |

**Key fields for agents:**
- Rescan with `"yes"` or `"whenkeyisnew"` can take **minutes** for large block ranges. Consider using `rescan: "no"` if immediate use isn't needed, or set a high `startHeight` to limit the scan range.
- After import, `decryptdata` will auto-decrypt data for this address using wallet keys — no need to pass the EVK explicitly.

**Receiving a shared viewing key:**

When another user shares their viewing key (e.g., via `sendcurrency:data` to your z-address):

1. Retrieve the key: `z_listreceivedbyaddress` → `decryptdata` → extract the viewing key string from the decrypted `objectdata` (hex-decode it)
2. Import it: `z_importviewingkey` with the key string
3. Now `decryptdata` can decrypt any data encrypted to that z-address without passing the EVK each time

**Audit logging:** Yes.

---

## Environment Variables

| Variable | Description |
|---|---|
| `VERUSIDX_READ_ONLY` | `true` to disable `z_importviewingkey`. All read tools (including `signdata` and `verifysignature`) remain available. |
| `VERUSIDX_AUDIT_LOG` | `false` to disable audit logging (default: enabled) |
| `VERUSIDX_AUDIT_DIR` | Custom audit log directory |
