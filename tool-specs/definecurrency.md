# verusidx-definecurrency-mcp — Tool Specs

Define and launch currencies on the Verus blockchain — simple tokens, fractional basket currencies, centralized currencies, ID control tokens, and Ethereum ERC-20 mapped tokens.

This MCP has one tool. `definecurrency` is the most complex RPC in Verus, supporting many currency types and configuration options.

Every RPC tool requires a `chain` parameter — no default, no auto-selection. The shared library routes the RPC call to the correct daemon by looking up host:port in the chain registry.

**Write-only MCP:** `definecurrency` is only registered when `VERUSIDX_READ_ONLY=false`. When read-only mode is active, this MCP exposes no tools.

**Scope:** This MCP covers currency definitions only. PBaaS blockchain launches (chains with `options: 0x100`) are out of scope and will be handled by a separate MCP.

---

## 1. `definecurrency`

**Description:**
Define a new currency on the blockchain. Creates a signed transaction that defines the currency — the transaction is **not broadcast automatically**. The returned hex must be sent via `sendrawtransaction` (in chain-mcp) to actually launch the currency on the network.

To create a currency, a VerusID with the same name must exist and be controlled by the wallet. The controlling ID pays the currency definition fees and any initial contributions. A currency name can only be used once — even if the identity is transferred, revoked, or recovered, the same name cannot be reused for another currency (unless `endblock` was specified and the currency has deactivated).

Only root IDs on a chain can define currencies (simple tokens, baskets, centralized, ERC-20 mapped). SubIDs can only be defined into ID control tokens (`options: 2080`) — they cannot define any other currency type. PBaaS chain definitions (currently restricted to root `.vrsc@` IDs) are out of scope for this MCP.

**Launch workflow:**

1. Ensure the rootID (namespace VerusID) exists, is controlled by the wallet, and has sufficient funds for the currency definition fee plus any `initialcontributions`
2. Call `definecurrency` — returns `{txid, tx, hex}` (signed but not broadcast)
3. Call `sendrawtransaction` (chain-mcp) with the `hex` value to broadcast the definition to the network
4. Wait for the preconversion timeframe (minimum 20 blocks, or until `startblock` if set)
5. If `minpreconversion` thresholds are met, the currency launches automatically. If not met, preconversions are refunded.
6. Verify with `getcurrency` (chain-mcp) to confirm the currency is active

**Currency definition fee:** Varies per chain. Check `getcurrency` for the chain's native currency — the `currencyregistrationfee` field shows the cost. On Verus mainnet this is 200 VRSC. ID control tokens cost less — typically the chain's `idimportfees` value (e.g., 0.02 VRSC on mainnet, 0.002 on vDEX).

**Preconversion fee:** There is a 0.025% fee on preconversions. Take this into account when calculating `minpreconversion` and `initialcontributions` thresholds.

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to define the currency on (e.g., `"VRSC"`, `"vrsctest"`) |
| `definition` | object | Yes | Currency definition object (see below) |

**Currency Definition Object:**

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Name of the currency. Must match an existing VerusID controlled by the wallet. |
| `options` | number | Yes | Bitfield of currency options (see Options table below) |
| `proofprotocol` | number | No | `1` = decentralized (default), `2` = centralized (rootID can mint/burn), `3` = Ethereum ERC-20 mapped |
| `currencies` | string[] | No | Reserve currency names for basket currencies (`options: 33`). For simple tokens (`options: 32`), currencies that people can preconvert with — proceeds go to rootID. Up to 10 currencies. Must include the chain's native currency when launched on that chain. |
| `weights` | number[] | No | Weight of each reserve currency in a basket. Must sum to 1.0. Minimum 0.1 per weight (since max 10 reserves). Only for basket currencies (`options: 33`). |
| `conversions` | number[] | No | Preconversion price for simple token currencies. Same size as `currencies`. E.g., `[0.1]` means 1 reserve currency = 10 tokens. |
| `initialsupply` | number | Required for baskets | Supply distributed to preconverters during the preconversion timeframe. **Required for basket currencies.** Does not work with simple tokens. Must have `initialcontributions` and/or preconverters — otherwise supply has nowhere to go and the currency is bricked. |
| `preallocations` | object[] | No | Mint tokens to specific addresses at launch. Array of `{"identity_or_address": amount}`. Works with both simple tokens and baskets. For baskets, this lowers the reserve ratio (new supply minted without adding reserves). |
| `initialcontributions` | number[] | No | Initial contribution from the rootID to reserves (baskets) or to rootID (simple tokens). Same size as `currencies`. Funds must be in the rootID when defining. |
| `minpreconversion` | number[] | No | Minimum preconversion amount per reserve currency. If not met, currency doesn't launch and preconversions are refunded (minus tx/conversion fees). Same size as `currencies`. |
| `maxpreconversion` | number[] | No | Maximum preconversion amount per reserve currency. Excess is refunded after launch. Same size as `currencies`. |
| `prelaunchcarveout` | number | No | Fraction of preconverted reserves redirected to rootID at launch (e.g., `0.1` = 10%). Basket currencies only. Lowers reserve ratio. |
| `prelaunchdiscount` | number | No | Discount fraction during preconversion (e.g., `0.5` = 50% discount). After launch, conversion price is higher by this percentage. Basket currencies only. Lowers reserve ratio. |
| `idregistrationfees` | number | No | Base cost to register a subID in this currency's namespace. Default: `100`. For decentralized currencies, fees are burned. For centralized, fees go to rootID. |
| `idreferrallevels` | number | No | Levels of ID referral rewards (0–5). Default: `3`. Requires `options` to include `8` (IDREFERRALS). |
| `idimportfees` | number | No | Encodes which reserve currency the `idregistrationfees` is denominated in. For basket currencies: `0.00000000` = first reserve (index 0), `0.00000001` = second reserve (index 1), and so on. Default: `0.02`, which means the fee is denominated in the basket currency itself (not a reserve). |
| `startblock` | number | No | Block height when the currency launches. The preconversion timeframe runs from definition to `startblock`. Default: current height + 20 (minimum 20-block preconversion window). **Use absolute block height, not relative.** |
| `endblock` | number | No | Block height after which the currency deactivates. `0` = no end (default). For centralized simple token currencies (`proofprotocol: 2`), reaching `endblock` converts the currency to decentralized (no more minting/burning). Has no functional effect on basket currencies but can be set as a signal. |
| `expiryheight` | number | No | Block height at which the definition transaction expires. Default: current height + 20. Set higher if the hex needs to remain valid longer before broadcasting via `sendrawtransaction`. |
| `nativecurrencyid` | object | No | For Ethereum ERC-20 mapped tokens (`proofprotocol: 3`). Contains `{"type": 9, "address": "0x..."}` where `address` is the Ethereum contract address. |
| `systemid` | string | No | System the currency runs on. Auto-derived for local currencies. Required for cross-system currencies (e.g., `"veth"` for Ethereum-mapped tokens). |
| `parent` | string | No | Parent blockchain. Auto-derived for local currencies. Required for cross-system currencies. |
| `launchsystemid` | string | No | System the currency is launched from. Auto-derived for local currencies. Required for cross-system currencies (e.g., `"vrsctest"` when launching an Ethereum-mapped token from testnet). |

**Options Table:**

| Value | Name | Description |
|---|---|---|
| 1 | FRACTIONAL | Currency has reserves and supports conversions. Combine with 32 (`options: 33`) for a basket currency. |
| 2 | IDRESTRICTED | Only the rootID (currency controller) can create subIDs in this namespace. |
| 8 | IDREFERRALS | Enable referral discounts for subID registration. |
| 16 | IDREFERRALSREQUIRED | Referrals are mandatory for subID registration. Implies referrals are enabled. |
| 32 | TOKEN | Simple token currency. Required for all currency types defined through this MCP. |
| 2048 | NFT_TOKEN | Creates a single-satoshi (0.00000001) control token for the rootID. Whoever holds the token has revoke/recover authority over the identity. |

Combine options by adding values:
- `32` — simple token
- `33` — basket currency (FRACTIONAL + TOKEN)
- `34` — simple token, only rootID can create subIDs
- `35` — basket currency, only rootID can create subIDs
- `40` — simple token with referrals enabled
- `41` — basket currency with referrals enabled
- `2080` — ID control token (TOKEN + NFT_TOKEN)

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

Returns the signed definition transaction (not broadcast):

| Field | Type | Description |
|---|---|---|
| `txid` | string | Precomputed transaction ID of the signed definition. This will be the actual txid once broadcast via `sendrawtransaction`. |
| `tx` | object | The transaction decoded as JSON |
| `hex` | string | Raw signed transaction hex. Pass this to `sendrawtransaction` (chain-mcp) to broadcast. |

The `hex` is already signed by the wallet. In the normal single-signer case, no additional signing is needed — go directly to `sendrawtransaction`.

---

## Currency Types & Examples

### Simple Token (Centralized)

A basic token where the rootID controller can mint and burn supply.

```
definecurrency '{
  "name": "MyBrand",
  "options": 32,
  "proofprotocol": 2,
  "preallocations": [{"Klaus@": 100}]
}'
```

- `options: 32` — simple token
- `proofprotocol: 2` — centralized (rootID can mint/burn)
- 100 MyBrand preallocated to Klaus@ at launch

### Simple Token (Decentralized, with Preconversion Funding)

A token with a preconversion period that funds the rootID.

```
definecurrency '{
  "name": "CoolBrand",
  "options": 32,
  "currencies": ["vrsctest"],
  "conversions": [0.1],
  "minpreconversion": [1000]
}'
```

- `conversions: [0.1]` — 1 VRSCTEST = 10 CoolBrand during preconversion
- Preconverters must provide at least 1000 VRSCTEST total or the currency doesn't launch
- Converted VRSCTEST goes to the rootID (not reserves — this is a simple token)

### Basket Currency (Fractional)

A currency backed by reserves, supporting on-chain conversions.

```
definecurrency '{
  "name": "CommunityX",
  "options": 33,
  "currencies": ["vrsctest", "MyBrand", "InfluencerCoin"],
  "minpreconversion": [10, 50, 10],
  "initialsupply": 100
}'
```

- `options: 33` — basket currency (1 + 32)
- Three reserve currencies with minimum preconversion thresholds
- 100 CommunityX initial supply distributed to preconverters

### Basket Currency (with Initial Contributions and Preallocations)

```
definecurrency '{
  "name": "CommunityBasket",
  "options": 33,
  "currencies": ["vrsctest", "CoinCommunity"],
  "initialcontributions": [10, 200],
  "initialsupply": 100,
  "preallocations": [{"Jane@": 100}, {"John@": 50}]
}'
```

- rootID contributes 10 VRSCTEST + 200 CoinCommunity to reserves at definition time
- 100 CommunityBasket initial supply goes to rootID (if no other preconverters)
- 100 minted to Jane@ and 50 to John@ at launch — this lowers the reserve ratio

### Basket Currency (with Weights)

```
definecurrency '{
  "name": "MyBusiness",
  "options": 33,
  "currencies": ["vrsctest", "BusinessBrand", "DiscountBrand"],
  "initialsupply": 100,
  "weights": [0.5, 0.25, 0.25]
}'
```

- Custom reserve weights: 50% VRSCTEST, 25% each for BusinessBrand and DiscountBrand
- Default weights are equal (each = 1/N)

### Basket Currency (with idimportfees — ID Fees in Reserve Currency)

From the Pure currency on mainnet:

```
definecurrency '{
  "name": "Pure",
  "options": 41,
  "currencies": ["VRSC", "tBTC.vETH"],
  "weights": [0.5, 0.5],
  "initialsupply": 20000,
  "idregistrationfees": 0.00021000,
  "idreferrallevels": 1,
  "idimportfees": 0.00000001
}'
```

- `options: 41` — basket currency with referrals (1 + 8 + 32)
- `idimportfees: 0.00000001` — second reserve (index 1 = tBTC.vETH)
- `idregistrationfees: 0.00021000` — denominated in tBTC.vETH (the reserve selected by `idimportfees`)
- SubID registration costs 0.00021 tBTC.vETH

### ID Control Token

A single-satoshi token that grants revoke/recover authority over the identity.

```
definecurrency '{
  "name": "MyToken",
  "options": 2080,
  "maxpreconversion": [0],
  "preallocations": [{"MyToken@": 0.00000001}]
}'
```

- `options: 2080` — TOKEN + NFT_TOKEN (32 + 2048)
- `maxpreconversion: [0]` — required, no preconversions allowed
- `preallocations` — the single satoshi (0.00000001) must be preallocated to an ID. Can be the same ID as the token name or a different ID.
- Costs significantly less than a regular currency definition (the chain's `idimportfees` value, e.g., 0.02 VRSC on mainnet)
- SubIDs can also be defined into ID control tokens (unlike other currency types which require root IDs)
- Whoever holds the 0.00000001 token has revoke/recover authority over the identity
- To check if an identity has a control token: inspect `identity.flags` in `getidentity` — `flags: 5` indicates a control token exists
- To trade the control token, use `sendcurrency` (send-mcp) or marketplace offers with the currency amount `0.00000001`

### Ethereum ERC-20 Mapped Token

A currency mapped 1:1 to an Ethereum ERC-20 token, interchangeable via the Verus-Ethereum Bridge.

```
definecurrency '{
  "name": "MyUSDC",
  "options": 32,
  "systemid": "veth",
  "parent": "vrsctest",
  "launchsystemid": "vrsctest",
  "nativecurrencyid": {
    "type": 9,
    "address": "0x98339D8C260052B7ad81c28c16C0b98420f2B46a"
  },
  "initialsupply": 0,
  "proofprotocol": 3
}'
```

- `proofprotocol: 3` — Ethereum notarization & Patricia trie proof
- `nativecurrencyid.type: 9` — ERC-20 mapping (always `9` for ERC-20)
- `nativecurrencyid.address` — the Ethereum contract address of the ERC-20
- `systemid: "veth"` — runs on the Ethereum system
- `parent` and `launchsystemid` — required for cross-system currencies (not auto-derived)
- After defining and broadcasting, the currency must also be exported to Ethereum via `sendcurrency` with `exportcurrency: true` and `exportto: "veth"`

**Note:** ERC-721 and ERC-1155 mappings may also be possible but are not fully documented at this time.

### Centralized Token with Endblock

A centralized token that becomes decentralized at a specific block height.

```
definecurrency '{
  "name": "PremiumAccess",
  "options": 40,
  "proofprotocol": 2,
  "preallocations": [{"Klaus@": 2000}],
  "idregistrationfees": 300,
  "idreferrallevels": 1,
  "endblock": 5000000
}'
```

- `proofprotocol: 2` — centralized (rootID can mint/burn)
- `endblock: 5000000` — at this block, minting/burning capability is removed and the currency becomes decentralized
- `options: 40` — TOKEN + IDREFERRALS (32 + 8)

---

## Workflows

### 1. Launch a Simple Token

1. Ensure rootID exists and has funds for the currency definition fee
2. `definecurrency` with `options: 32` → get `hex`
3. `sendrawtransaction` (chain-mcp) with the `hex` → currency definition broadcast
4. Wait minimum 20 blocks (or until `startblock`)
5. `getcurrency` (chain-mcp) to verify currency is active

### 2. Launch a Basket Currency with Preconversions

1. Ensure rootID exists and has funds for definition fee + any `initialcontributions`
2. `definecurrency` with `options: 33`, `currencies`, `initialsupply`, and optional `minpreconversion` → get `hex`
3. `sendrawtransaction` (chain-mcp) → definition broadcast
4. During preconversion window: users convert reserve currencies into the basket
5. After `startblock` (or 20 blocks): if `minpreconversion` met, currency launches. If not, preconversions refunded.
6. `getcurrency` (chain-mcp) to verify launch and check reserve state

### 3. Create an ID Control Token

1. Ensure the ID exists (can be a root ID or subID) and wallet controls it
2. `definecurrency` with `options: 2080`, `maxpreconversion: [0]`, `preallocations: [{"name@": 0.00000001}]` → get `hex`
3. `sendrawtransaction` (chain-mcp) → token created
4. The identity now has `flags: 5` in `getidentity`
5. The 0.00000001 token can be sent via `sendcurrency` to transfer revoke/recover authority

### 4. Launch an Ethereum-Mapped Token

1. Ensure rootID exists and has funds for definition fee
2. `definecurrency` with `options: 32`, `proofprotocol: 3`, `nativecurrencyid`, `systemid`, `parent`, `launchsystemid` → get `hex`
3. `sendrawtransaction` (chain-mcp) → definition broadcast
4. Wait for currency to become active
5. Export to Ethereum: `sendcurrency` (send-mcp) with `exportcurrency: true`, `exportto: "veth"`, `amount: 0`
6. Wait for bridge notarization — the currency is then available on both Verus and Ethereum

### 5. Mint/Burn Centralized Token Supply

After a centralized token (`proofprotocol: 2`) is launched:

- **Mint:** `sendcurrency` (send-mcp) from the rootID with `mintnew: true`
- **Burn:** `sendcurrency` (send-mcp) with `burn: true`
- Only the rootID controller can mint. Anyone can burn their own holdings.

**Audit logging:** Yes.
