# OPTN Wallet — Phase 1 compatibility evidence

Fill this in as [optn-phase1-testplan.md](./optn-phase1-testplan.md) is executed. It is
the artifact that opens the conversation with the OPTN team: a compatibility report
with real transaction IDs, not a proposal.

**Status: NOT STARTED — no test has been run. Every row below is a placeholder.**

Do not approach OPTN, Jerry, or the BCH builder channels until at least rows E1–E9 are
filled and row E9 (chipnet cancel) passed.

---

## 0. Build identity

Both commits must be pinned before the first transaction, or the evidence cannot be
reproduced later.

| Field | Value |
|---|---|
| FlowGuard commit (`git rev-parse HEAD`) | `<TODO>` |
| FlowGuard branch | `<TODO>` |
| OPTN Wallet commit / release tag | `<TODO>` |
| OPTN install source (store build / local `pnpm dev` / APK) | `<TODO>` |
| OPTN platform + OS version | `<TODO>` |
| `cashc` version (from `contracts/package.json`) | `0.13.0` |
| Test operator | `<TODO>` |
| Date range of the run | `<TODO>` |

Pre-flight, both networks:

| Check | Command | Result |
|---|---|---|
| Network agreement | `node scripts/check-network-agreement.mjs` | `<TODO: AGREE/MISMATCH>` |
| Artifact drift | `node scripts/check-artifact-drift.mjs` | `<TODO: PASS/FAIL>` |
| Placeholder scanner sane | `node scripts/scan-tx-placeholders.mjs --self-test` | `<TODO: PASS/FAIL>` |

---

## 1. Evidence rows

Ordered by how much each one moves the conversation with OPTN. **E9 is the one that
matters** — everything else is supporting material.

| # | Evidence | Source | Status | Value |
|---|---|---|---|---|
| E1 | Approved WalletConnect namespace JSON | Test 1 | ☐ | see §2 |
| E2 | Connected address == OPTN first derived address | Test 1 | ☐ | `<TODO>` |
| E3 | `verify-tx` login success (request/response pair) | Test 2 | ☐ | see §3 |
| E4 | Message-signing failure + `recoveryProbe` log | Test 2 negative | ☐ | see §4 |
| E5 | Chipnet payment created (`#FG-PAY-NNN` + contract address) | Test 3 | ☐ | `<TODO>` |
| E6 | Chipnet funding txid | Test 4 | ☐ | `<TODO>` |
| E7 | Genesis-anchor prep txid + funding txid pair | Test 4b | ☐ | `<TODO>` |
| E8 | Chipnet `pay()` txid + before/after commitment hex | Test 5 | ☐ | `<TODO>` |
| **E9** | **Chipnet cancel txid** — covenant placeholder splice proof | Test 6 | ☐ | `<TODO>` |
| E10 | Wrong-address cancel failure text | Test 6 negative | ☐ | see §5 |
| E11 | Placeholder scan output — funding | Test 7 | ☐ | see §6 |
| E12 | Placeholder scan output — cancel | Test 7 | ☐ | see §6 |
| E13 | Mainnet funding txid | Test 8 | ☐ | `<TODO>` |
| E14 | Mainnet `pay()` txid | Test 8 | ☐ | `<TODO>` |
| E15 | Mainnet cancel txid | Test 8 | ☐ | `<TODO>` |
| E16 | Sign-modal screenshot — funding | Test 4 | ☐ | see §7 |
| E17 | Sign-modal screenshot — cancel | Test 6 | ☐ | see §7 |

---

## 2. E1 — Approved WalletConnect namespace

Capture from the browser console (`[Web3ModalWC]` session log) or OPTN's session detail.

```json
<TODO: paste the approved session.namespaces object>
```

| Field | Expected | Observed |
|---|---|---|
| namespace key | `bch` | `<TODO>` |
| chain (chipnet) | `bch:bchtest` | `<TODO>` |
| chain (mainnet) | `bch:bitcoincash` | `<TODO>` |
| methods | `bch_getAddresses`, `bch_signMessage`, `bch_signTransaction` | `<TODO>` |
| events | `<TODO>` | `<TODO>` |

---

## 3. E3 — Proof-transaction login success

The path FlowGuard now routes OPTN through (`supportsMessageSigning = false`).

| Field | Expected | Observed |
|---|---|---|
| `POST /api/auth/nonce` body contains `txProof: true` | yes | `<TODO>` |
| nonce response contains `authProof` | yes | `<TODO>` |
| OPTN prompt text | "Prove wallet ownership to FlowGuard…" | `<TODO>` |
| `POST /api/auth/verify-tx` status | 200 | `<TODO>` |
| `POST /api/auth/verify` called? | **no** | `<TODO>` |
| Proof tx appeared on chain? | **no** | `<TODO>` |

Signed proof transaction hex (must never be broadcast):

```
<TODO>
```

---

## 4. E4 — Message-signing failure (the upstream PR evidence)

Reproduced by temporarily setting `supportsMessageSigning = true` in
[OptnConnector.ts](../../frontend/src/connectors/OptnConnector.ts). **Revert after.**

> This row tests a defect inferred from reading OPTN's source, not one yet observed.
> If message signing actually succeeds, say so here — the tx-proof routing stays
> correct and harmless, but the upstream `message_magic` PR is not warranted.

| Field | Value |
|---|---|
| Reproduced? | `<TODO: yes / no — signing succeeded>` |
| `POST /api/auth/verify` status | `<TODO>` |
| Client-visible error | `<TODO>` |
| Message byte length | `<TODO — expect ~380>` |
| Backend `signatureShape` | `<TODO>` |
| Backend `messageBytes` | `<TODO>` |
| Backend `recoveryProbe` (all five digest schemes) | `<TODO>` |

Full backend `[auth] verify_failed` log line:

```
<TODO>
```

Suspected cause: OPTN's Bitcoin-signed-message magic writes the message length as raw
hex rather than a CompactSize varint, so any message ≥253 bytes produces a digest the
server cannot reproduce. Confirm against OPTN source before asserting this to them.

---

## 5. E10 — Wrong-address cancel failure

OPTN signs with its first derived address only. `cancel()` requires
`hash160(senderPubkey) == senderHash`, so a payment created from any other address
cannot be cancelled — and the failure surfaces at the network, not in the wallet.

| Field | Value |
|---|---|
| Payment sender address | `<TODO>` |
| OPTN signing address used | `<TODO>` |
| Failure surfaced at | `<TODO: wallet / broadcast / network>` |
| Verbatim error text | `<TODO>` |

This justifies the pre-flight address check planned for Phase 2.

---

## 6. E11 / E12 — Placeholder scan

```bash
node scripts/scan-tx-placeholders.mjs <TX_HEX>
# or: pnpm --filter @flowguard/backend run scan:placeholders <TX_HEX>
```

Funding transaction (P2PKH inputs — no covenant input, so a pass here is expected and
proves little on its own):

```
<TODO: paste full output>
```

Cancel transaction (**covenant input — this is the meaningful run**):

```
<TODO: paste full output>
```

| Check | Funding | Cancel |
|---|---|---|
| Exit code (0 = clean) | `<TODO>` | `<TODO>` |
| Signature placeholder (`0x41` + 65 zero bytes) absent | `<TODO>` | `<TODO>` |
| Public-key placeholder (`0x21` + 33 zero bytes) absent | `<TODO>` | `<TODO>` |
| Per-input detail available (libauth decoded) | `<TODO>` | `<TODO>` |
| Confirmed on chain | `<TODO>` | `<TODO>` |

On-chain confirmation is the independent cross-check: the network accepted the
signature, so it cannot have been a placeholder or an invalid splice.

---

## 7. E16 / E17 — Sign-modal screenshots

Input to the sign-modal improvement PR — these show what an OPTN user actually sees
when approving a FlowGuard covenant transaction.

| Screenshot | Status | Notes |
|---|---|---|
| Funding — full modal | ☐ | `<TODO>` |
| Funding — output/token detail | ☐ | `<TODO>` |
| Cancel — full modal | ☐ | `<TODO>` |
| Cancel — covenant input detail | ☐ | `<TODO>` |

Record specifically whether the modal shows:

| Question | Observed |
|---|---|
| Amounts in BCH, or raw satoshis? | `<TODO>` |
| NFT commitment decoded, or raw 40-byte hex? | `<TODO>` |
| Covenant function name (`cancel`, `pay`) shown at all? | `<TODO>` |
| Address prefix correct for chipnet (`bchtest:`)? | `<TODO>` |
| dApp identified as FlowGuard with the correct origin? | `<TODO>` |

---

## 8. Outcome

Fill in only once rows E1–E12 are complete.

| Question | Answer |
|---|---|
| Does OPTN pair with FlowGuard unmodified? | `<TODO>` |
| Does proof-transaction login work? | `<TODO>` |
| **Does OPTN correctly sign covenant inputs?** | `<TODO>` |
| Does the full BCH recurring-payment lifecycle complete? | `<TODO>` |
| Any FlowGuard-side change required? | `<TODO>` |
| Any OPTN-side change required? | `<TODO>` |
| Ready to approach OPTN? | `<TODO>` |

### Proposed upstream PRs to OPTN

Only file these with the evidence rows attached. Both are FlowGuard-independent and
benefit every covenant dApp on OPTN, which is why they should land before the add-on ask.

| PR | Depends on | Status |
|---|---|---|
| `message_magic` CompactSize varint length prefix | E4 | `<TODO>` |
| Sign-modal covenant rendering (decoded amounts, commitment, function name, network-correct prefix) | E16, E17 | `<TODO>` |
