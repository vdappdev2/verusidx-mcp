# verusidx-address-mcp — Tool Specs

Address management — generate, validate, and list transparent and shielded addresses.

Every RPC tool requires a `chain` parameter — no default, no auto-selection. The shared library routes the RPC call to the correct daemon by looking up host:port in the chain registry.

**Read-only mode (`VERUSIDX_READ_ONLY=true`):** `getnewaddress` and `z_getnewaddress` are not registered. All other tools remain available.

---

## 1. `validateaddress`

**Description:**
Validate an address and return detailed information about it. Returns whether the address is valid, whether it belongs to this wallet (ismine), the address type, and associated metadata. Use this to verify addresses before sending funds, or to check if a given address is controlled by the local wallet.

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to query (e.g., `"VRSC"`, `"vrsctest"`) |
| `address` | string | Yes | The transparent address to validate (R-address or i-address) |

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

Returns the daemon's `validateaddress` response. Key fields:

| Field | Type | Description |
|---|---|---|
| `isvalid` | boolean | Whether the address is valid |
| `address` | string | The address validated |
| `scriptPubKey` | string | Hex-encoded script |
| `ismine` | boolean | Whether this address belongs to the wallet |
| `iswatchonly` | boolean | Whether this address is watch-only |
| `isscript` | boolean | Whether this is a script address |
| `pubkey` | string | (optional) The hex-encoded public key |
| `iscompressed` | boolean | (optional) Whether the pubkey is compressed |
| `account` | string | (optional) The account associated with this address |

**Key fields for agents:**
- `isvalid: false` — the address is malformed. Do not send funds to it.
- `ismine: true` — the wallet controls this address and can sign transactions spending from it.

---

## 2. `getaddressesbyaccount`

**Description:**
List all transparent addresses for an account. In Verus, the default account is `""` (empty string). Returns an array of R-addresses associated with the account. Use this to see all transparent addresses the wallet has generated.

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to query (e.g., `"VRSC"`, `"vrsctest"`) |
| `account` | string | No (default: `""`) | Account name. Use `""` (empty string) for the default account. In Verus, all addresses typically belong to the default account. |

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

Returns a JSON array of transparent addresses (strings). Example:

```json
[
  "RGGfvnyjF1is1jGwPKVSNSDNov6V4aBDMF",
  "RK5eFawNQ8hwz5PyPPdgCMakgUBvXfpT3R"
]
```

---

## 3. `z_listaddresses`

**Description:**
List all shielded (Sapling) addresses in the wallet. Returns an array of zs-addresses. Use this to see all shielded addresses available for private transactions, or to find an existing shielded address for use as an identity privateaddress.

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to query (e.g., `"VRSC"`, `"vrsctest"`) |
| `includeWatchonly` | boolean | No | Also include watchonly addresses. Default: `false`. |

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

Returns a JSON array of shielded addresses (strings). Example:

```json
[
  "zs1z7rejlpsa98s2rrrfkwmaxu53e4ue0ulcrw0h4x5g8jl04tak0d3mm47vdtahatqrlkngh9sly"
]
```

---

## 4. `getnewaddress`

**Description:**
Generate a new transparent (R-address) for receiving payments. Use this to create fresh addresses for identity primaryaddresses, change addresses, or destination addresses. Each call generates a unique address from the wallet's keypool.

**Disabled in read-only mode.**

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to generate address on (e.g., `"VRSC"`, `"vrsctest"`) |

**Annotations:**
```json
{
  "readOnlyHint": false,
  "destructiveHint": false,
  "idempotentHint": false,
  "openWorldHint": false
}
```

**Output:**

Returns a single string — the new transparent address (e.g., `"RGGfvnyjF1is1jGwPKVSNSDNov6V4aBDMF"`).

**Audit logging:** Yes.

---

## 5. `z_getnewaddress`

**Description:**
Generate a new shielded Sapling address (zs-address) for private transactions. Use this to create addresses for identity privateaddress fields or private sends. Each call generates a unique shielded address.

**Disabled in read-only mode.**

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to generate address on (e.g., `"VRSC"`, `"vrsctest"`) |

**Annotations:**
```json
{
  "readOnlyHint": false,
  "destructiveHint": false,
  "idempotentHint": false,
  "openWorldHint": false
}
```

**Output:**

Returns a single string — the new shielded Sapling address (e.g., `"zs1..."`).

**Audit logging:** Yes.

---

## 6. `z_validateaddress`

**Description:**
Validate a shielded (Sapling) z-address and return detailed information about it. Returns whether the address is valid, whether it belongs to this wallet (ismine), the address type, and key components. Complements `validateaddress`, which only works for transparent (R/i) addresses.

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to query (e.g., `"VRSC"`, `"vrsctest"`) |
| `address` | string | Yes | The shielded z-address (zs1...) to validate |

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

Returns the daemon's `z_validateaddress` response. Key fields:

| Field | Type | Description |
|---|---|---|
| `isvalid` | boolean | Whether the address is a valid Sapling z-address |
| `address` | string | The address validated |
| `type` | string | Address type (e.g., `"sapling"`) |
| `ismine` | boolean | Whether this z-address belongs to the wallet (spending key is present) |
| `payingkey` | string | Hex-encoded paying key |
| `transmissionkey` | string | Hex-encoded transmission key |
| `diversifier` | string | Hex-encoded diversifier |
| `diversifiedtransmissionkey` | string | Hex-encoded diversified transmission key |

**Key fields for agents:**
- `isvalid: false` — the address is malformed or not a valid Sapling address. Do not send funds or data to it.
- `ismine: true` — the wallet holds the spending key for this z-address.

---

## Environment Variables

| Variable | Description |
|---|---|
| `VERUSIDX_READ_ONLY` | `true` to disable `getnewaddress` and `z_getnewaddress`. All read tools remain available. |
| `VERUSIDX_AUDIT_LOG` | `false` to disable audit logging (default: enabled) |
| `VERUSIDX_AUDIT_DIR` | Custom audit log directory |
