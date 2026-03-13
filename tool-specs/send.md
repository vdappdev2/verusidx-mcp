# verusidx-send-mcp — Tool Specs

Send, convert, and transfer currency. Check balances and conversion paths.

Every RPC tool requires a `chain` parameter — no default, no auto-selection. The shared library routes the RPC call to the correct daemon by looking up host:port in the chain registry.

**Read-only mode (`VERUSIDX_READ_ONLY=true`):** `sendcurrency` is not registered. All other tools remain available. Read-only mode is per-MCP: send-mcp can be read-only while identity-mcp is read-write, or vice versa.

---

## 1. `getcurrency`

**Description:**
Get the full definition and current state of a currency. Returns the currency's configuration (reserves, weights, fees, preallocations, eras) and its latest on-chain state (supply, reserve balances, conversion prices). Use this to inspect any currency — tokens, fractional basket currencies, or PBaaS chain currencies.

Use this to check if a currency exists, understand its structure (simple token vs. fractional basket), or read current reserve ratios and conversion prices before performing conversions.

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to query (e.g., `"VRSC"`, `"vrsctest"`) |
| `currencyname` | string | Yes | Currency name (e.g., `"bitcoins"`, `"NATI🦉"`) or i-address. Also accepts `"hex:<currencyidhex>"` format. |

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

Returns the daemon's `getcurrency` response directly. The structure varies by currency type.

**Common fields (all currency types):**

| Field | Type | Description |
|---|---|---|
| `version` | number | Version of the currency definition |
| `options` | number | Bitfield of currency options |
| `name` | string | Currency name |
| `fullyqualifiedname` | string | Fully qualified name with parent namespaces (e.g., `"bitcoins"`, `"PUMP.vDEX"`) |
| `currencyid` | string | i-address of the currency |
| `currencyidhex` | string | Hex representation of currency ID |
| `parent` | string | i-address of the parent blockchain |
| `systemid` | string | i-address of the system this currency runs on |
| `launchsystemid` | string | i-address of the system this currency was launched from |
| `startblock` | number | Block height at which this currency was launched |
| `endblock` | number | Block height after which this currency is considered ended (0 = no end) |
| `idregistrationfees` | number | Base cost of IDs in this currency's namespace |
| `idreferrallevels` | number | Levels of ID referrals |
| `idimportfees` | number | For basket currencies: encodes which reserve currency `idregistrationfees` is denominated in. `0.00000000` = first reserve (index 0), `0.00000001` = second reserve (index 1), etc. Default `0.02` means the fee is denominated in the basket currency itself. For non-basket currencies, this is the flat import fee amount. |
| `definitiontxid` | string | Transaction ID where this currency was defined |
| `bestheight` | number | Height of the best known currency state |
| `lastconfirmedheight` | number | Height of the last confirmed currency state |

**Fractional basket currency additional fields:**

| Field | Type | Description |
|---|---|---|
| `currencies` | string[] | i-addresses of reserve currencies in the basket |
| `currencynames` | object | Map of i-addresses to fully qualified names for reserve currencies |
| `weights` | number[] | Relative weight of each reserve currency (must sum to 1.0) |
| `conversions` | number[] | Pre-launch conversion rates |
| `minpreconversion` | number[] | Minimum pre-conversion amounts required for launch |
| `maxpreconversion` | number[] | Maximum pre-conversion amounts allowed |
| `initialsupply` | number | Initial currency supply before preallocation |
| `prelaunchcarveout` | number | Percentage of pre-launch proceeds sent to launching ID |
| `preallocations` | object[] | Array of `{"i-address": amount}` for pre-allocation at launch |
| `initialcontributions` | number[] | Amounts of pre-conversions reserved for the launching ID |

**Currency state (`bestcurrencystate` / `lastconfirmedcurrencystate`):**

| Field | Type | Description |
|---|---|---|
| `flags` | number | State flags |
| `currencyid` | string | i-address of the currency |
| `supply` | number | Current total supply |
| `initialsupply` | number | Initial supply at launch |
| `emitted` | number | Amount emitted (mined/staked rewards) |
| `reservecurrencies` | array | (fractional only) Current reserve state per currency |
| `currencies` | object | Per-reserve-currency conversion data (fees, prices, volumes) |

**Each `reservecurrencies` entry:**

| Field | Type | Description |
|---|---|---|
| `currencyid` | string | i-address of the reserve currency |
| `weight` | number | Current weight in the basket |
| `reserves` | number | Amount of this currency held in reserves |
| `priceinreserve` | number | Price of 1 unit of the basket currency denominated in this reserve |

**Key fields for agents:**
- `options` — determines currency type. Presence of `currencies`/`weights` indicates a fractional basket.
- `reservecurrencies` — only present on fractional baskets. Shows current reserves, weights, and prices.
- `priceinreserve` — the current conversion price. To convert X of reserve currency to basket currency, the estimated output is roughly `X / priceinreserve` (before fees and slippage). Use `estimateconversion` for precise estimates.
- `bestheight` vs `lastconfirmedheight` — if these differ significantly, the best state may not yet be fully confirmed.
- `fullyqualifiedname` — currencies on other systems include the parent (e.g., `"PUMP.vDEX"`).

**Example — simple token:**
```
getcurrency "bitcoins"
```
```json
{
  "version": 1,
  "options": 40,
  "name": "bitcoins",
  "currencyid": "i7ekXxHYzXW7uAfu5BtWZhd1MjXcWU5Rn3",
  "parent": "i5w5MuNik5NtLcYmNzcvaoixooEebB6MGV",
  "systemid": "i5w5MuNik5NtLcYmNzcvaoixooEebB6MGV",
  "fullyqualifiedname": "bitcoins",
  "startblock": 2626434,
  "endblock": 0,
  "preallocations": [
    { "i9bBvuJijJeHcqFsDzAwW7f5wTBThULuhX": 6666667.00000000 },
    { "iGwDA89H2BDCEStTPqhFyLzYteVHVs7tcJ": 6666667.00000000 },
    { "i7H32twVkvDQBJd3UVUL18rGFGNKdUqfy2": 6666666.00000000 },
    { "i5v3h9FWVdRFbNHU7DfcpGykQjRaHtMqu7": 1000000.00000000 }
  ],
  "idregistrationfees": 1.00000000,
  "idreferrallevels": 3,
  "bestcurrencystate": {
    "flags": 48,
    "currencyid": "i7ekXxHYzXW7uAfu5BtWZhd1MjXcWU5Rn3",
    "supply": 20999971.78303426,
    "initialsupply": 0.00000000,
    "emitted": 0.00000000
  }
}
```

Note: Simple tokens have no `currencies`, `weights`, or `reservecurrencies` — they are non-convertible. They can only be sent, not converted through a basket.

**Example — fractional basket currency:**
```
getcurrency "NATI🦉"
```
```json
{
  "version": 1,
  "options": 41,
  "name": "NATI🦉",
  "currencyid": "iH37kRsdfoHtHK5TottP1Yfq8hBSHz9btw",
  "fullyqualifiedname": "NATI🦉",
  "currencies": [
    "i5w5MuNik5NtLcYmNzcvaoixooEebB6MGV",
    "iS8TfRPfVpKo5FVfSUzfHBQxo9KuzpnqLU",
    "i9nwxtKuVYX4MSbeULLiK2ttVi6rUEhh4X",
    "iL62spNN42Vqdxh8H5nrfNe8d6Amsnfkdx"
  ],
  "currencynames": {
    "i5w5MuNik5NtLcYmNzcvaoixooEebB6MGV": "VRSC",
    "iS8TfRPfVpKo5FVfSUzfHBQxo9KuzpnqLU": "tBTC.vETH",
    "i9nwxtKuVYX4MSbeULLiK2ttVi6rUEhh4X": "vETH",
    "iL62spNN42Vqdxh8H5nrfNe8d6Amsnfkdx": "NATI.vETH"
  },
  "weights": [ 0.25000000, 0.25000000, 0.25000000, 0.25000000 ],
  "initialsupply": 88888.00000000,
  "bestcurrencystate": {
    "flags": 49,
    "currencyid": "iH37kRsdfoHtHK5TottP1Yfq8hBSHz9btw",
    "supply": 70394.84420579,
    "reservecurrencies": [
      { "currencyid": "i5w5MuNik5NtLcYmNzcvaoixooEebB6MGV", "weight": 0.25, "reserves": 3578509.88665516, "priceinreserve": 203.33931707 },
      { "currencyid": "iS8TfRPfVpKo5FVfSUzfHBQxo9KuzpnqLU", "weight": 0.25, "reserves": 40.52998806, "priceinreserve": 0.00230300 },
      { "currencyid": "i9nwxtKuVYX4MSbeULLiK2ttVi6rUEhh4X", "weight": 0.25, "reserves": 1374.91391828, "priceinreserve": 0.07812583 },
      { "currencyid": "iL62spNN42Vqdxh8H5nrfNe8d6Amsnfkdx", "weight": 0.25, "reserves": 1303421227.83812054, "priceinreserve": 74063.44839845 }
    ]
  }
}
```

Note: Fractional baskets have `reservecurrencies` showing current reserve balances and prices. Currency names may include emojis, dots, and mixed case.

---

## 2. `getcurrencybalance`

**Description:**
Get multi-currency balances for a specific address. Returns all currency balances held at the address, including the native chain currency and any reserve/token currencies. Supports transparent addresses, private (z) addresses, VerusIDs, and wildcard patterns.

Use this for detailed per-address multi-currency holdings. For a quick overview of the wallet's total native balance, use `getwalletinfo` in chain-mcp instead.

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to query (e.g., `"VRSC"`, `"vrsctest"`) |
| `address` | string or object | Yes | Address to check. Can be a string (`"alice@"`, `"R..."`, `"i*"`, `"R*"`, `"*"`) or an object `{"address": "...", "currency": "currencyname"}` to filter to a specific currency. Wildcards: `"*"` = all addresses, `"R*"` = all transparent, `"i*"` = all identity addresses. |
| `minconf` | number | No | Only include transactions confirmed at least this many times. Default: `1`. |
| `friendlynames` | boolean | No | Use friendly names instead of i-addresses for currency keys. Default: `true`. |
| `includeshared` | boolean | No | Include outputs that can also be spent by others. Default: `false`. |

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

Returns an object mapping currency names (or i-addresses if `friendlynames` is false) to balances:

```json
{
  "VRSCTEST": 19.99860000,
  "testidx": 4.11094148
}
```

Only currencies with non-zero balances appear. If the address holds no currencies, an empty object is returned.

**Key fields for agents:**
- Currency names may contain spaces, dots, emojis, and mixed case (e.g., `"Number Go Up.bitcoins"`, `"vUSDC.vETH"`, `"NATI🦉"`).
- Use the object form `{"address": "alice@", "currency": "VRSC"}` to check a specific currency balance without fetching all holdings.
- `minconf: 0` includes unconfirmed balances — useful for checking if a recent send has been broadcast.
- If the wallet only has a viewing key for the address, spends cannot be detected and the balance may be overstated.

**Example:**
```
getcurrencybalance "third.testidx@"
```
```json
{
  "VRSCTEST": 19.99860000,
  "testidx": 4.11094148
}
```

---

## 3. `getcurrencyconverters`

**Description:**
Find fractional basket currencies that can convert between specified currencies. Returns all baskets that hold the listed currencies as reserves, along with their current state (reserves, prices, conversion volumes). Use this to discover conversion paths before calling `estimateconversion` or `sendcurrency` with `convertto`.

Two input modes:
- **Simple:** pass one or more currency names — returns all baskets that have all of them as reserves.
- **Advanced:** pass an object with target conversion details including slippage tolerance — returns baskets that can satisfy the conversion at or better than the target price.

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to query (e.g., `"VRSC"`, `"vrsctest"`) |
| `currencies` | string[] | No | Simple mode: array of currency names. Returns all baskets containing all listed currencies as reserves. |
| `params` | object | No | Advanced mode: query object (see below). |

**Advanced query object:**

| Field | Type | Description |
|---|---|---|
| `convertto` | string | Target currency name or i-address |
| `fromcurrency` | string or object[] | Source currency name(s), or array of `{"currency": "name", "targetprice": n}` |
| `targetprice` | number or number[] | Target price(s) within slippage |
| `amount` | number | Amount of target currency needed |
| `slippage` | number | Max slippage as a fraction (e.g., `0.01` = 1%). Max: `0.50` (50%). |

Exactly one of `currencies` or `params` should be provided.

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

Returns an array of objects, one per matching basket currency. Each entry contains:

| Field | Type | Description |
|---|---|---|
| `<currencyid>` | object | Full currency definition (same structure as `getcurrency` output) |
| `fullyqualifiedname` | string | Basket currency name |
| `height` | number | Block height of the state |
| `output` | object | `{"txid": "...", "voutnum": n}` — reference to the notarization |
| `lastnotarization` | object | Full notarization data including `currencystate` with current reserves, prices, and conversion volumes |

**Key fields for agents:**
- Each result is a basket that can convert between the requested currencies. Use the basket's `fullyqualifiedname` as the `via` parameter in `sendcurrency` or `estimateconversion`.
- `currencystate.reservecurrencies` shows current reserves and prices for each reserve in the basket.
- Multiple baskets may be returned — compare prices across them to find the best conversion path.

**Example:**
```
getcurrencyconverters "vusdt.veth"
```
Returns all fractional baskets that hold vUSDT.vETH as a reserve (e.g., Floralis, Kaiju), with their current state and conversion prices. (Response truncated — each entry contains the full currency definition and last notarization state.)

---

## 4. `estimateconversion`

**Description:**
Estimate the output of converting one currency to another, accounting for pending conversions, fees, and slippage. Does not broadcast a transaction — this is a read-only estimate. Use this before `sendcurrency` with `convertto` to preview the expected output.

Can estimate a single conversion or an array of conversions using the same basket.

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to query (e.g., `"VRSC"`, `"vrsctest"`) |
| `conversion` | object or object[] | Yes | Single conversion object or array of conversion objects (see below) |

**Conversion object:**

| Field | Type | Required | Description |
|---|---|---|---|
| `currency` | string | Yes | Source currency name (e.g., `"VRSC"`, `"vusdt.veth"`) |
| `amount` | number | Yes | Amount of source currency to convert |
| `convertto` | string | Yes | Destination currency name |
| `via` | string | No | Intermediate fractional basket to convert through. Required when both source and destination are reserves of the same basket. |
| `preconvert` | boolean | No | Convert at market price before currency launch. Default: `false`. |

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
| `inputcurrencyid` | string | i-address of the source currency |
| `netinputamount` | number | Net amount in after conversion fees (in source currency) |
| `outputcurrencyid` | string | i-address of the destination currency |
| `estimatedcurrencyout` | number | Estimated output amount in destination currency |
| `estimatedcurrencystate` | object | Full estimated currency state after the conversion (reserves, prices, volumes) |

When an array of conversions is passed, the first four fields are returned 1:1 in a `conversions` array.

**Key fields for agents:**
- `estimatedcurrencyout` — the main value agents care about. This is the estimated output after fees and slippage.
- `netinputamount` — shows how much of the input is actually used after the 0.05% conversion fee is deducted.
- The estimate accounts for pending conversions in the current block, so the actual result may differ slightly if additional conversions are submitted before the block is mined.
- Use `via` when converting between two reserve currencies of the same basket (e.g., converting vUSDT.vETH to vUSDC.vETH via a common basket).

**Example — conversion via intermediate basket:**
```
estimateconversion '{"currency":"vusdt.veth", "convertto":"vusdc.veth", "via":"agents", "amount":10}'
```
```json
{
  "inputcurrencyid": "i9oCSqKALwJtcv49xUKS2U2i79h1kX6NEY",
  "netinputamount": 9.99500000,
  "outputcurrencyid": "i61cV2uicKSi1rSMQCBNQeSYC3UAi9GVzd",
  "estimatedcurrencyout": 8.91868193,
  "estimatedcurrencystate": { ... }
}
```

In this example, 10 vUSDT.vETH is converted to ~8.92 vUSDC.vETH through the "agents" basket. The `netinputamount` of 9.995 shows the 0.05% conversion fee was deducted from the input.

---

## 5. `listcurrencies`

**Description:**
List and search currencies registered on the blockchain. Returns an array of currency definitions with their current state. Supports filtering by launch state, system type, source system, and converter reserves.

Without a query object, returns all currencies on the local chain. Use filters to narrow results — unfiltered queries on mainnet can return very large result sets.

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to query (e.g., `"VRSC"`, `"vrsctest"`) |
| `query` | object | No | Filter object (see below). Omit to list all currencies. |
| `startblock` | number | No | Only return currencies defined at or after this block height. |
| `endblock` | number | No | Only return currencies defined at or before this block height. |

**Query object:**

| Field | Type | Description |
|---|---|---|
| `launchstate` | string | Filter by state: `"prelaunch"`, `"launched"`, `"refund"`, `"complete"` |
| `systemtype` | string | Filter by type: `"local"`, `"imported"`, `"gateway"`, `"pbaas"` |
| `fromsystem` | string | System name or i-address to filter by source system. Default: local chain. |
| `converter` | string[] | Only return fractional baskets that have all listed currencies as reserves. |

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

Returns an array of currency objects. Each entry contains:

| Field | Type | Description |
|---|---|---|
| `currencydefinition` | object | Full currency definition (same fields as `getcurrency` output) |
| `bestheight` | number | Height of the best known state |
| `besttxid` | string | Transaction ID of the best state |
| `bestcurrencystate` | object | Current currency state (supply, reserves, prices) |
| `lastconfirmedheight` | number | Height of the last confirmed state |
| `lastconfirmedtxid` | string | Transaction ID of the last confirmed state |
| `lastconfirmednotarization` | object | Full notarization data (for cross-chain currencies) |

**Key fields for agents:**
- Use `query.converter` to find baskets that can convert specific currencies — similar to `getcurrencyconverters` but with additional filter options.
- `bestheight: 0` — the currency exists but has never launched (pre-launch or failed launch).
- `query.fromsystem` — use this to find currencies imported from another chain (e.g., `"vDEX"`, `"vETH"`).
- Results can be large on mainnet. Always use filters when possible.

**Example — currencies from a specific system:**
```
listcurrencies '{"fromsystem":"vdex"}'
```
```json
[
  {
    "currencydefinition": {
      "name": "vDEX",
      "currencyid": "iHog9UCTrn95qpUBFCZ7kKz7qWdMA8MQ6N",
      "fullyqualifiedname": "vDEX",
      "systemid": "iHog9UCTrn95qpUBFCZ7kKz7qWdMA8MQ6N",
      ...
    },
    "bestheight": 819880,
    "bestcurrencystate": { "supply": 862300.00000000, ... }
  },
  {
    "currencydefinition": {
      "name": "Bridge",
      "fullyqualifiedname": "Bridge.vDEX",
      "systemid": "iHog9UCTrn95qpUBFCZ7kKz7qWdMA8MQ6N",
      ...
    },
    "bestcurrencystate": { "supply": 100000.00000000, "reservecurrencies": [...], ... }
  },
  {
    "currencydefinition": {
      "name": "PUMP",
      "fullyqualifiedname": "PUMP.vDEX",
      ...
    },
    "bestheight": 0
  },
  ...
]
```

Note: `PUMP.vDEX` has `bestheight: 0` — it was defined but never launched. `Bridge.vDEX` is a fractional basket (has `reservecurrencies`). Full responses are large and truncated here.

---

## 6. `sendcurrency`

**Description:**
Send, convert, or cross-chain transfer currency. This is the primary tool for moving value on Verus. Supports simple sends, currency conversions through fractional baskets, cross-chain transfers, currency/ID exports, minting, burning, and data storage.

This is an **async operation**. It returns an operation ID (`opid`) — poll `z_getoperationstatus` with the opid to check for completion and get the resulting transaction ID.

**Disabled in read-only mode.**

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to send on (e.g., `"VRSC"`, `"vrsctest"`) |
| `fromaddress` | string | Yes | Source address for funds. Can be a VerusID (`"alice@"`), transparent address (`"R..."`), Sapling address (`"zs..."`), or wildcard (`"*"`, `"R*"`, `"i*"`). |
| `outputs` | object[] | Yes | Array of output objects (see below) |
| `minconf` | number | No | Only use funds confirmed at least this many times. Default: `1`. |
| `feeamount` | number | No | Specific fee amount instead of default miner's fee. |
| `returntxtemplate` | boolean | No | If true, returns the raw transaction template (hex + output totals) instead of broadcasting. Default: `false`. |

**Output object fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `address` | string | Yes | Destination address — VerusID, R-address, z-address. For cross-chain: append `"@chainname"`. |
| `amount` | number | Yes | Amount to send in the source currency. Can be `0` for export-only operations. |
| `currency` | string | Yes | Source currency name (e.g., `"VRSC"`, `"vrsctest"`) |
| `convertto` | string | No | Currency to convert to. Must be a reserve of a fractional basket, or the fractional basket itself. |
| `via` | string | No | Intermediate fractional basket to convert through. Required when both source and destination are reserves of the same basket. |
| `exportto` | string | No | Chain or system name to export/send to (e.g., `"vDEX"`, `"vETH"`). |
| `exportid` | boolean | No | If true, export the full identity to the destination chain. Default: `false`. |
| `exportcurrency` | boolean | No | If true, export the currency definition to the destination chain. Default: `false`. |
| `feecurrency` | string | No | Currency to use for paying the fee (pulled from wallet). |
| `addconversionfees` | boolean | No | If true, calculate additional fees so the full `amount` is converted after fees. Default: `false`. |
| `refundto` | string | No | Address for refunds on pre-conversions. Defaults to `fromaddress`. |
| `memo` | string | No | String message for z-address destinations. |
| `data` | object | No | Data-only output with no other function. Stores large, optionally signed data. See `signdata` in identity-mcp for the data object format. |
| `preconvert` | boolean | No | Convert at market price before currency launch. Default: `false`. |
| `burn` | boolean | No | Destroy the currency and subtract from supply. Currency must be a token. Default: `false`. |
| `mintnew` | boolean | No | Create new currency. Must send from the currency's ID and the currency must be centralized. Default: `false`. |

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

Returns an operation ID string (e.g., `"opid-f4422247-f37a-4e74-85ad-158202a45e49"`).

If `returntxtemplate` is true, returns:
```json
{
  "outputtotals": { "currencyname": amount, ... },
  "hextx": "hexstring"
}
```

**Async workflow:**

`sendcurrency` does not return a transaction ID directly. The workflow is:

1. Call `sendcurrency` — returns an `opid`
2. Poll `z_getoperationstatus` with the opid
3. When `status` is `"success"`, the `result.txid` contains the transaction ID
4. Optionally call `gettransaction` with the txid for full transaction details

**Workflows:**

**Simple send (no conversion):**
```
sendcurrency "testidx@" '[{"currency":"vrsctest", "amount":10, "address":"third.testidx@"}]'
```
Returns: `opid-f9791771-88fa-431f-8068-cbb305565675`

Send 10 VRSCTEST from testidx@ to third.testidx@. No conversion, no cross-chain — just a direct transfer.

**Conversion through a fractional basket:**
```
sendcurrency "third.testidx@" '[{"currency":"vrsctest", "amount":0.1, "convertto":"testidx", "address":"third.testidx@"}]'
```
Returns: `opid-f4422247-f37a-4e74-85ad-158202a45e49`

Convert 0.1 VRSCTEST to testidx currency through a basket that has both as reserves. The conversion happens on-chain in the next block.

**Via conversion (reserve-to-reserve through a basket):**
```
sendcurrency "third.testidx@" '[{"currency":"vrsctest", "amount":2, "convertto":"usd", "via":"kaiju", "address":"third.testidx@"}]'
```
Returns: `opid-61fc14d7-7088-4650-9ef4-a25b2d5d9e5c`

Convert 2 VRSCTEST to USD through the Kaiju basket. Use `via` when both source and destination are reserves of the same basket — the conversion goes source → basket → destination in one transaction.

**Cross-chain currency export (prerequisite for cross-chain sends):**

Before sending a currency cross-chain, its definition must be exported to the destination chain:
```
sendcurrency "myid@" '[{"currency":"mycurrency", "amount":0, "exportto":"vDEX", "exportcurrency":true, "address":"myid@"}]'
```
- `amount: 0` — no value transferred, just the definition
- `exportcurrency: true` — exports the currency definition
- This is a one-time operation per currency per destination chain

**Cross-chain send:**

After the currency has been exported to the destination chain:
```
sendcurrency "myid@" '[{"currency":"mycurrency", "amount":100, "exportto":"vDEX", "address":"recipient@"}]'
```

**Cross-chain ID export:**

Export a VerusID to another chain. The currency must already have been exported to the destination:
```
sendcurrency "myid@" '[{"currency":"vrsc", "amount":0, "exportto":"vDEX", "exportid":true, "address":"myid@"}]'
```
- `fromaddress` is the ID to export
- `address` in the output is also the ID being exported
- `amount: 0` — no value transferred
- The identity definition is serialized and sent cross-chain

**Data storage:**

Store data on-chain using the `data` parameter. The format follows the same structure as `signdata` in identity-mcp:
```
sendcurrency "myid@" '[{"address":"myid@", "currency":"vrsc", "amount":0, "data":{...}}]'
```
See the `signdata` tool in identity-mcp for the full `data` object specification.

**ID Control Tokens:**

Some identities have an associated control token — a currency with the same name as the identity, with a total supply of exactly 0.00000001 (1 satoshi). Whoever holds the control token has revoke/recover authority over the identity. Sending a control token via `sendcurrency` effectively transfers revoke/recover authority over that identity. Agents should understand this implication before sending control tokens. To check if an identity has a control token, inspect `identity.flags` in `getidentity` (identity-mcp) — `flags: 5` indicates a control token exists. Verify with `getcurrency` using the identity name.

**Audit logging:** Yes.

---

## 7. `z_getoperationstatus`

**Description:**
Check the status of async operations. Returns status, result, and timing for one or more operations. Operations remain in memory after completion — call this to retrieve results. This is the companion tool to `sendcurrency`, which returns an operation ID that must be polled here to get the transaction ID.

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to query (e.g., `"VRSC"`, `"vrsctest"`) |
| `operationids` | string[] | No | Array of operation IDs to check (e.g., `["opid-f4422247-..."]`). Omit to return all operations known to the node. |

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

Returns an array of operation status objects:

| Field | Type | Description |
|---|---|---|
| `id` | string | The operation ID |
| `status` | string | `"queued"`, `"executing"`, `"success"`, or `"failed"` |
| `creation_time` | number | Unix timestamp when the operation was created |
| `result` | object | (on success) `{"txid": "hexstring"}` — the resulting transaction ID |
| `error` | object | (on failure) Error details |
| `execution_secs` | number | Time taken to execute |
| `method` | string | The RPC method that created this operation (e.g., `"sendcurrency"`) |
| `params` | array | The parameters passed to the original call |

**Key fields for agents:**
- `status: "success"` + `result.txid` — the operation completed and the transaction was broadcast. Use `gettransaction` with the txid for full details.
- `status: "failed"` + `error` — the operation failed. Check error details for the reason (insufficient funds, invalid address, etc.).
- `status: "executing"` or `"queued"` — still in progress. Poll again after a short delay.
- `params` — echoes back the original call parameters, useful for correlating results.
- When called without `operationids`, returns all operations — useful for a quick overview but may include old operations from previous sessions.

**Example — successful send:**
```
z_getoperationstatus '["opid-f4422247-f37a-4e74-85ad-158202a45e49"]'
```
```json
[
  {
    "id": "opid-f4422247-f37a-4e74-85ad-158202a45e49",
    "status": "success",
    "creation_time": 1773355972,
    "result": {
      "txid": "54fe6081008cc9553c30e3a34b4303bb79256804f6a0575735007085e1064de1"
    },
    "execution_secs": 0.315431548,
    "method": "sendcurrency",
    "params": [
      {
        "currency": "vrsctest",
        "amount": 0.1,
        "convertto": "testidx",
        "address": "third.testidx@"
      }
    ]
  }
]
```

---

## 8. `gettransaction`

**Description:**
Get detailed information about a wallet transaction by transaction ID. Returns amounts, confirmations, block info, and detailed input/output breakdowns including reserve transfers and multi-currency details. The transaction must be in the node's wallet.

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to query (e.g., `"VRSC"`, `"vrsctest"`) |
| `txid` | string | Yes | The transaction ID |
| `includewatchonly` | boolean | No | Include watchonly addresses in balance calculation and details. Default: `false`. |

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

Returns the daemon's `gettransaction` response directly:

| Field | Type | Description |
|---|---|---|
| `amount` | number | Net transaction amount in native currency (negative for sends) |
| `fee` | number | Transaction fee (negative, only for sends) |
| `confirmations` | number | Number of confirmations |
| `blockhash` | string | Block hash containing the transaction |
| `blockindex` | number | Index within the block |
| `blocktime` | number | Block time (unix timestamp) |
| `txid` | string | The transaction ID |
| `time` | number | Transaction time (unix timestamp) |
| `timereceived` | number | Time the transaction was received (unix timestamp) |
| `expiryheight` | number | Block height at which this transaction expires |
| `details` | array | Array of input/output detail objects |
| `vjoinsplit` | array | Joinsplit (shielded) details |
| `hex` | string | Raw transaction hex |

**Each `details` entry:**

| Field | Type | Description |
|---|---|---|
| `address` | string | Address involved |
| `category` | string | `"send"` or `"receive"` |
| `amount` | number | Amount (negative for sends) |
| `vout` | number | Output index |
| `fee` | number | Fee (only for sends) |
| `size` | number | Transaction size in bytes |
| `reservetransfer` | object | (optional) Reserve transfer details for conversions — includes `currencyvalues`, `flags`, `convert`, `feecurrencyid`, `fees`, `destinationcurrencyid`, and `destination` |

**Key fields for agents:**
- `confirmations` — 0 means unconfirmed (in mempool). Positive means mined.
- `reservetransfer` — present on conversion transactions. Shows the source currency values, destination currency, and conversion fees.
- `details` often contains both a `"send"` and `"receive"` entry for the same transaction when the wallet is both sender and recipient.

**Example:**
```
gettransaction "54fe6081008cc9553c30e3a34b4303bb79256804f6a0575735007085e1064de1"
```
```json
{
  "amount": -0.10020010,
  "fee": -0.00010000,
  "confirmations": 4,
  "blockhash": "6ae405c28b5c5a6fc0fed638107e43f979997aad6f0c3d9f08470f216aabff17",
  "blocktime": 1773355969,
  "txid": "54fe6081008cc9553c30e3a34b4303bb79256804f6a0575735007085e1064de1",
  "time": 1773355972,
  "timereceived": 1773355972,
  "details": [
    {
      "address": "RTqQe58LSj2yr5CrwYFwcsAQ1edQwmrkUU",
      "category": "send",
      "amount": -0.10020010,
      "reservetransfer": {
        "version": 1,
        "currencyvalues": { "iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq": 0.10000000 },
        "flags": 3,
        "convert": true,
        "feecurrencyid": "iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq",
        "fees": 0.00020010,
        "destinationcurrencyid": "i6V4or9qptD5JzxkqgUKz45tvtBNMb72N3",
        "destination": {
          "address": "iQ18U7oU9c9NU2Weh87ER3a4D7ZRQq1PwE",
          "type": 68
        }
      },
      "vout": 0,
      "fee": -0.00010000,
      "size": 403
    }
  ]
}
```

---

## 9. `listtransactions`

**Description:**
List recent wallet transactions with pagination. Returns an array of transactions including sends, receives, and multi-currency operations. Each entry includes amounts, confirmations, block info, and — for multi-currency transactions — token amounts and reserve output details.

**Input Schema:**

| Param | Type | Required | Description |
|---|---|---|---|
| `chain` | string | Yes | Chain to query (e.g., `"VRSC"`, `"vrsctest"`) |
| `count` | number | No | Number of transactions to return. Default: `10`. |
| `from` | number | No | Number of transactions to skip (for pagination). Default: `0`. |
| `includewatchonly` | boolean | No | Include watchonly addresses. Default: `false`. |

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

Returns an array of transaction objects:

| Field | Type | Description |
|---|---|---|
| `address` | string | Address involved in the transaction |
| `category` | string | `"send"`, `"receive"`, or `"move"` |
| `amount` | number | Amount in native currency (negative for sends) |
| `tokenamounts` | object | (optional) Non-native currency amounts: `{"currencyid": amount, ...}` |
| `fee` | number | (sends only) Transaction fee (negative) |
| `confirmations` | number | Number of confirmations |
| `blockhash` | string | Block hash |
| `blocktime` | number | Block time (unix timestamp) |
| `txid` | string | Transaction ID |
| `time` | number | Transaction time (unix timestamp) |
| `timereceived` | number | Time received (unix timestamp) |
| `size` | number | Transaction size in bytes |
| `walletconflicts` | string[] | Array of conflicting transaction IDs |
| `smartoutput` | object | (optional, receives only) Detailed output info for multi-currency receives |
| `earnedfees` | boolean | (optional) Whether this output represents earned conversion fees |
| `fromimport` | object | (optional) If the output came from a cross-chain import |

**`smartoutput` fields (multi-currency receives):**

| Field | Type | Description |
|---|---|---|
| `type` | string | Output type (e.g., `"cryptocondition"`) |
| `reserveoutput` | object | `{"version": 1, "currencyvalues": {"currencyid": amount, ...}}` |
| `spendableoutput` | boolean | Whether this output is spendable by the wallet |
| `reserve_balance` | object | Friendly-name-keyed balances: `{"testidx": 29.97, "YEN": 43.0}` |

**Key fields for agents:**
- `tokenamounts` (on sends) and `smartoutput.reserve_balance` (on receives) — show multi-currency values. Native `amount` may be small or zero when the primary value is in reserve currencies.
- `category: "send"` entries have negative `amount` and `fee`. The same transaction often appears twice — once as `"send"` and once as `"receive"` — when the wallet sends to itself (change outputs, conversions).
- `earnedfees: true` — this output is earned conversion/import fees, not a user-initiated receive.
- `fromimport` — indicates this output came from a cross-chain import.
- `walletconflicts` — non-empty means this transaction conflicts with another. Usually indicates a double-spend attempt or replaced transaction.
- Use `count` and `from` for pagination: `listtransactions` with `count=20, from=100` returns transactions 100-119.

**Example:**
```
listtransactions
```
```json
[
  {
    "address": "RGGfvnyjF1is1jGwPKVSNSDNov6V4aBDMF",
    "category": "send",
    "amount": -0.61140103,
    "tokenamounts": {
      "i6V4or9qptD5JzxkqgUKz45tvtBNMb72N3": 29.97670595,
      "iAH9uQ4GnREmbpVKd1fU9zrePte3odZGFd": 43.00000000
    },
    "fee": -0.00010000,
    "confirmations": 169133,
    "txid": "3a2a6ce746a69ee973c494eae17c2a8fcef19b9469481405d8f9c06f3b8a7107",
    "time": 1762888256,
    "size": 771
  },
  {
    "address": "RGGfvnyjF1is1jGwPKVSNSDNov6V4aBDMF",
    "category": "receive",
    "smartoutput": {
      "type": "cryptocondition",
      "reserveoutput": {
        "version": 1,
        "currencyvalues": {
          "i6V4or9qptD5JzxkqgUKz45tvtBNMb72N3": 29.97670595,
          "iAH9uQ4GnREmbpVKd1fU9zrePte3odZGFd": 43.00000000
        }
      },
      "spendableoutput": true,
      "reserve_balance": {
        "testidx": 29.97670595,
        "YEN": 43.00000000
      }
    },
    "amount": 0.61130103,
    "confirmations": 75647,
    "txid": "d20ad589afee53ca197c88cc4ae1a3900f730f2ff3670d100c8d1e1cb927fcc6",
    "time": 1768673536,
    "size": 749
  }
]
```

Note: The first transaction shows a multi-currency send with `tokenamounts`. The second shows a multi-currency receive with `smartoutput.reserve_balance` using friendly names. Results are returned most-recent-last.
