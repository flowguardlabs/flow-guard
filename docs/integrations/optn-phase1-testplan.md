# OPTN Wallet — Phase 1 compatibility test plan

Scope: prove FlowGuard ↔ OPTN Wallet works over WalletConnect v2 with **no OPTN code
changes**. Restricted to **BCH recurring payments**. Do not test airdrops, CashTokens,
vaults, grants, bounties, streams, or governance in this phase.

Record results in [optn-phase1-evidence.md](./optn-phase1-evidence.md).

The full multi-phase integration strategy lives in `docs/internal/OPTN_INTEGRATION_PLAN.md`,
which is intentionally untracked (`docs/internal/` is gitignored) — this test plan and the
evidence file are the tracked, externally-shareable half.

The output of this run is the artifact that opens the conversation with the OPTN
team — a compatibility report with real transaction IDs, not a proposal.

---

## 0. Setup

### Environment

`frontend/.env.local`:

```
VITE_ENABLE_OPTN=true
VITE_WALLETCONNECT_PROJECT_ID=<your project id>   # required — no fallback exists
VITE_BCH_NETWORK=chipnet                          # mainnet for the final run
```

Get a project ID free at <https://cloud.walletconnect.com>. It belongs only in
`frontend/.env.local`, which is gitignored — never in a tracked file, and never in this
document. No API base URL is needed: the frontend calls `/api` relative, which Vite
proxies to `localhost:3001` in dev (`frontend/vite.config.ts`) and the Worker proxies in
production.

`backend/.env`:

```
BCH_NETWORK=chipnet          # must match VITE_BCH_NETWORK — there is no runtime switch
DATABASE_URL=<postgres>
CORS_ALLOWED_ORIGINS=http://localhost:5173
# CORS_ALLOW_NATIVE_APP_ORIGINS is NOT needed for Phase 1 (browser origin, not WebView)
```

OPTN Wallet is disabled by default (`isOptnEnabled()` in
[frontend/src/connectors/index.ts](../../frontend/src/connectors/index.ts)); without
`VITE_ENABLE_OPTN=true` it does not appear in the wallet modal and
`createWalletConnector('optn')` throws. This mirrors the existing WizardConnect
precedent and keeps production untouched until this plan produces evidence.

### Run

```bash
cd backend  && pnpm dev     # :3001
cd frontend && pnpm dev     # :5173
```

### Pre-flight (run every session, and again before the mainnet run)

```bash
node scripts/check-network-agreement.mjs     # frontend vs backend network — exit 0 required
node scripts/check-artifact-drift.mjs        # committed artifacts == fresh cashc build
node scripts/scan-tx-placeholders.mjs --self-test
```

### Evidence capture harness

Before connecting OPTN, paste [scripts/optn-capture.js](../../scripts/optn-capture.js)
into the browser devtools console on the FlowGuard tab. It wraps `fetch` (observe-only)
and records every auth and broadcast call, so no transaction hex has to be hand-copied
out of the Network panel — transcription is where this kind of evidence usually breaks.

```
__optn.report()   PASS/FAIL for every assertion checkable in-browser
__optn.hex()      captured tx hexes + ready-to-paste scanner commands
__optn.save()     downloads optn-phase1-capture.json
```

It cannot check the things that actually decide this test — covenant placeholder
removal, refund amount, `payment_count`, whether the proof tx stayed unbroadcast, or
what the sign modal displayed. Those stay manual.

A network mismatch is the most expensive failure available here: the frontend derives
covenant addresses and explorer links for one network while the backend broadcasts on
the other, so funds land at an address the app will never show you. Neither side can
switch at runtime — fix the env and restart **both**.

Belt and braces: `connect()` also calls `assertBackendNetworkMatches()`
([frontend/src/utils/networkGuard.ts](../../frontend/src/utils/networkGuard.ts)) and
refuses to pair on a definite mismatch. That guard fails *open* when `/api/status` is
unreachable, so it does not replace the pre-flight script — run both.

### Wallet

Install OPTN Wallet (Android/iOS build, or `pnpm dev --host` from
[BitcoinBay/OPTNWallet](https://github.com/BitcoinBay/OPTNWallet)). Create a wallet and
fund its **first** address.

> **The first-address constraint is not optional.** OPTN signs every request with
> `KeyService.retrieveKeys(walletId)[0]`. Payment `cancel` requires
> `hash160(senderPubkey) == senderHash`, so the payment must be created and funded from
> the address OPTN will sign with. Using any other address fails at the network with an
> opaque error, not in the wallet.

For chipnet, fund from a chipnet faucet. Budget ≥0.01 BCH for the fee reserve on top of
the payment pool.

---

## Test 1 — Connect

1. Open `http://localhost:5173`, click **Connect Wallet**.
2. Confirm **OPTN Wallet** is listed with a *Beta* badge.
3. Select it. FlowGuard's modal hides and the WalletConnect QR appears.
4. In OPTN: WalletConnect panel → scan/paste the URI → approve the session proposal.

**Pass criteria**

- Session approves with namespace `bch`, chain `bch:bchtest` (chipnet) or
  `bch:bitcoincash` (mainnet), methods `bch_getAddresses`, `bch_signMessage`,
  `bch_signTransaction`.
- FlowGuard shows the connected address; the wallet dropdown reads **OPTN Wallet**.
- The address shown equals OPTN's **first** address.

**Record:** approved namespace JSON, connected address, OPTN version/commit.

---

## Test 2 — Login (proof-transaction path)

Triggered automatically by the first authenticated call (Test 3). Watch for it.

**Pass criteria**

- `POST /api/auth/nonce` request body contains `txProof: true`, and the response
  contains an `authProof` object.
- OPTN prompts to sign, with the prompt text *"Prove wallet ownership to FlowGuard
  (this transaction cannot be broadcast and moves no funds)"*.
- `POST /api/auth/verify-tx` returns 200 with a bearer.
- **No** `POST /api/auth/verify` call is made.
- The proof transaction is **never broadcast** — confirm nothing new appears for the
  address on the explorer.

**Also record the negative result (this is the evidence for the upstream PR):**
temporarily set `supportsMessageSigning = true` in
[OptnConnector.ts](../../frontend/src/connectors/OptnConnector.ts), retry login, and
capture the exact failure from `POST /api/auth/verify` plus the backend's
`[auth] verify_failed` log line (it prints `signatureShape`, `messageBytes`, and a
`recoveryProbe` across five digest schemes). Revert afterwards.

Expected cause: OPTN's `message_magic` writes the message length as raw hex instead of a
CompactSize varint, so FlowGuard's ~380-byte CAIP-122 message cannot be reproduced
server-side.

---

## Test 3 — Create a BCH recurring payment

1. Go to **Payments → Create**.
2. Recipient: a P2PKH address you control (not the sender). Amount: `0.001` BCH.
   Interval: shortest available. Cancelable: **on**. Token: **BCH**.
3. Submit.

**Pass criteria**

- Login (Test 2) fires here on the first authenticated call.
- `POST /api/payments/create` returns `deployment.contractAddress` and status `PENDING`.
- No wallet signature is requested — creation is off-chain.

**Record:** payment UUID, `#FG-PAY-NNN`, contract address, constructor params.

---

## Test 4 — Fund (the one mandatory signature)

1. On the payment detail page, click **Fund**.
2. Approve in OPTN.

**Pass criteria**

- `GET /api/payments/:id/funding-info` returns a `wcTransaction`.
- OPTN's sign modal shows: FlowGuard as the dApp, the `userPrompt`, inputs, and a
  covenant output carrying a token with an NFT commitment. *(A BCH-mode payment still
  carries a zero-amount CashToken NFT — that is the state commitment, not a token
  payment.)*
- Signing succeeds; FlowGuard broadcasts (`broadcast: false` is sent to the wallet —
  FlowGuard broadcasts server-side).
- `POST /api/payments/:id/confirm-funding` eventually returns 200 and status becomes
  **ACTIVE**.

**Record:** funding txid, contract address, amount, confirm-retry count.

### 4b — Genesis-anchor branch (run once, deliberately)

From a wallet with **no** UTXO at output index 0, funding-info returns
`{ requiresPreparation: true, preparationTransaction }`. Sign the prep transaction, then
fund. **Record both txids.** This is a second signature prompt and the most likely source
of user confusion in the add-on.

---

## Test 5 — Confirm active state and an executed payment

1. Refresh the detail page; confirm **ACTIVE**, next-payment timestamp, total paid `0`.
2. Wait one interval, then trigger the payment (`pay()` is permissionless — no
   signature).

**Pass criteria**

- Recipient receives exactly `amountPerInterval`.
- The contract UTXO is recreated with `payment_count` incremented and
  `next_payment_timestamp` advanced by one interval.
- FlowGuard's UI reflects both.

**Record:** payment txid, recipient address, before/after NFT commitment hex.

---

## Test 6 — Cancel (the covenant placeholder path)

This is the test that actually matters. It is the only Phase 1 step where OPTN must
sign a **covenant** input.

1. Click **Cancel** on the payment. Approve in OPTN.

**Pass criteria**

- `POST /api/payments/:id/cancel` returns a `wcTransaction` whose contract input's
  unlocking bytecode contains the placeholders.
- OPTN splices in a Schnorr signature + compressed pubkey and returns signed hex.
- The transaction broadcasts and confirms; the refund equals `totalAmount - totalPaid`
  and lands at the sender address.
- Status becomes **CANCELLED**.

**Record:** cancel txid, refund amount, sender address.

### Wrong-address guard (negative test)

Repeat with an OPTN wallet whose first address is *not* the payment sender. Expected:
`hash160(senderPubkey) == senderHash` fails and the network rejects the transaction.
**Record the exact error text** — it justifies the pre-flight address check the add-on
must add in Phase 2.

---

## Test 7 — Verify no placeholder survived signing

FlowGuard already refuses to broadcast a transaction containing placeholders —
`inspectUnsignedPlaceholderInputs` in
[frontend/src/utils/blockchain.ts:282](../../frontend/src/utils/blockchain.ts#L282)
throws before broadcast. Test 7 is the **independent** confirmation for the report.

Copy the broadcast hex (browser devtools → the `POST /api/transactions/broadcast`
request body → `txHex`) and run:

```bash
node scripts/scan-tx-placeholders.mjs <TX_HEX>
# equivalently, from the backend workspace:
pnpm --filter @flowguard/backend run scan:placeholders <TX_HEX>
```

Exit 0 = clean, 1 = placeholder found, 2 = bad input. The scanner does a raw-hex scan
for the verdict and adds per-input attribution when libauth decodes the transaction; a
decode failure downgrades the detail but never the verdict.

Run it for **both**:

| Transaction | Inputs | What a PASS proves |
|---|---|---|
| Funding (Test 4) | P2PKH only | Little on its own — there is no covenant input to splice. Run it as the control. |
| **Cancel (Test 6)** | **covenant + P2PKH** | **OPTN resolved the covenant unlocker.** This is the meaningful run. |

Two independent cross-checks back this up:

1. The transaction confirmed on chain — the network accepted the signature, so it cannot
   have been a placeholder or an invalid splice.
2. FlowGuard's own guard (`inspectUnsignedPlaceholderInputs`) let it through. That guard
   shares no code with this scanner, and it returns "clean" when a transaction fails to
   decode — the scanner does not, so it is the stricter of the two.

Paste the full output into [optn-phase1-evidence.md](./optn-phase1-evidence.md) §6.

---

## Test 8 — Mainnet smoke

Repeat tests 1, 3, 4, 5, 6 on mainnet with ≤0.01 BCH total
(`VITE_BCH_NETWORK=mainnet`, `BCH_NETWORK=mainnet`, restart both services). Use a
throwaway recipient you control.

Do not skip this. Chipnet and mainnet differ in fee relay policy and UTXO shape, and the
mainnet txids are what make the report credible.

---

## Evidence to collect before approaching OPTN

| # | Evidence | From |
|---|---|---|
| 1 | Approved WalletConnect namespace JSON + OPTN build commit | Test 1 |
| 2 | `verify-tx` login success, and the `verify` (message) failure with the backend's `recoveryProbe` log | Test 2 |
| 3 | **Chipnet** funding txid | Test 4 |
| 4 | Genesis-anchor prep txid + funding txid | Test 4b |
| 5 | Chipnet `pay()` txid with before/after commitment hex | Test 5 |
| 6 | **Chipnet cancel txid** — proof OPTN's covenant placeholder splice works | Test 6 |
| 7 | Wrong-address failure text | Test 6 |
| 8 | Placeholder-scan PASS output for funding and cancel | Test 7 |
| 9 | **Mainnet** funding + `pay()` + cancel txids | Test 8 |
| 10 | Screenshot of OPTN's sign modal for funding and for cancel | Tests 4, 6 |

Item 6 is the single most important artifact: it is the empirical proof that
`respondWithTxSignature` handles FlowGuard's covenant transactions, which is the
premise the entire add-on plan rests on.

Item 10 is the input to the sign-modal improvement PR — the screenshots show what a user
actually sees (raw satoshis, raw 40-byte commitment hex, no covenant function name, a
`bitcoincash:` prefix even on chipnet).

---

## Known Phase 1 limitations (do not file as bugs)

- **First address only.** OPTN signs with `allKeys[0]`. FlowGuard does not yet pre-flight
  this; a mismatch fails at the network. Pre-flight check is Phase 2.
- **No runtime network switch.** Both frontend and backend read the network from env at
  boot. Switching networks means restarting both. A mismatch is now *detected* — by
  `scripts/check-network-agreement.mjs` ahead of time and by `assertBackendNetworkMatches()`
  at connect time — but still cannot be *fixed* without a restart.
- **No public chipnet backend.** Chipnet testing needs a local backend, or the
  `api-chipnet.flowguard.cash` deployment proposed in the plan (§F.6).
- **`VITE_ENABLE_OPTN` is off by default.** Intentional until this plan passes.
- **BCH only.** CashTokens/FT mode is explicitly out of Phase 1 scope.
