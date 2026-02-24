# FlowGuard Documentation Structure

Based on a full audit of all contracts, backend services, and frontend product surfaces, cross-referenced with how Sablier, Superfluid, Streamflow, and LlamaPay structure their documentation.

FlowGuard docs are product-split throughout:
**Vesting | Recurring Payments | Airdrops | Grants | Bounties | Rewards | Vaults | Governance**

---

## Top-Level Navigation

| Tab | Audience | Purpose |
|-|-|-|
| **Concepts** | Everyone | What FlowGuard is; protocol definitions |
| **Guides** | Developers & DAOs | Step-by-step integration and usage |
| **Reference** | Smart contract engineers | Contract specs, state layouts, errors |
| **API** | Backend/frontend developers | REST + indexer query reference |
| **App** | End users | UI walkthroughs for all products |
| **Security** | Auditors & teams | Trust model, covenant mechanics |

---

## CONCEPTS

_What FlowGuard is and why it works the way it does._

- **Overview**
  What is FlowGuard. BCH CashTokens-native programmable finance protocol. Covenant-enforced, non-custodial, permissionless execution.

- **CashTokens and Covenants**
  How CashScript covenants work. NFT commitment as on-chain state. UTXO model vs account model. Why state lives in the NFT, not in a contract storage slot.

- **Vaults**
  Primary treasury primitive. M-of-N multisig approval. Period-based spending caps. Allowlists. Emergency lock. Signer roles.

- **Streaming**
  - Vesting — Linear and step vesting with cliff. Pause/resume shifts effective start. Cancel splits vested vs unvested. Transfer to new recipient.
  - Recurring Payments — Fixed-interval payroll and subscriptions. Permissionless `pay()` trigger. Unlimited or capped total pool.

- **Distribution**
  - Airdrops — Fixed per-claim amount. Time-gated. Authority-controlled pause/cancel. Permissionless self-claim.
  - Grants — Multi-milestone disbursement. Authority releases one tranche per milestone. Transferable grant recipient.
  - Bounties — Competition with proof-based claims. Authority co-signs valid submissions. Fixed prize per winner up to `maxWinners`.
  - Rewards — Variable achievement-based payouts. Authority decides amount per event, bounded by `maxRewardAmount`. Four categories: Achievement, Referral, Loyalty, Custom.

- **Governance**
  - Proposals — PENDING → APPROVED → EXECUTED lifecycle. M-of-N approval counting. Execution timelock (CLTV). Permissionless `expire()` after voting deadline.
  - Vote Locking — GovernanceFT locked with immutable FOR/AGAINST/ABSTAIN choice. UTXO model eliminates double-voting. Early reclaim after proposal completes.

- **Stream Lifecycle**
  State machine shared across all covenants: `ACTIVE → PAUSED → CANCELLED | COMPLETED`. Flags bitmap: cancelable, transferable, usesTokens (BCH vs CashToken).

- **Executor Network**
  Permissionless executor service that triggers `pay()` on recurring payment covenants when interval elapses. How incentives work, who can run a node.

- **Supported Assets**
  BCH (satoshis) and any CashToken fungible token. `usesTokens` flag in NFT commitment selects which path a covenant enforces.

---

## GUIDES

_Step-by-step integration and usage for developers and DAOs._

### Vaults

- Local Environment Setup — chipnet setup, wallet setup (Paytaca, WalletConnect), funding with chipnet BCH
- Create a Vault — parameters: `requiredApprovals`, signer hashes, `periodDuration`, `periodCap`, `allowlistEnabled`
- Fund a Vault — depositing BCH or CashTokens into the vault UTXO
- Create a Spending Proposal — linking proposal to vault, setting payout hash, voting deadline, execution timelock
- Approve and Execute a Proposal — signer approval flow, CLTV, burning the proposal NFT
- Emergency Lock — when and how to use 3-of-3 emergency lock
- Deployment Addresses — mainnet and chipnet addresses per contract version

### Vesting

- Create a Vesting Stream — linear vs step, cliff, total amount, start/end timestamps, cancelable/transferable flags
- Claim Vested Tokens — how `claim()` computes vested amount, elapsed time, pro-rata split
- Pause and Resume — how cursor advances by pause duration so paused time does not vest
- Cancel a Stream — vested portion to recipient, unvested returned to sender
- Transfer Stream Ownership — reassign recipient hash
- Batch Create — creating multiple vesting streams from a single vault in one transaction

### Recurring Payments

- Create a Recurring Payment — `amountPerInterval`, `intervalSeconds`, `totalAmount` (0 = unlimited), `startTimestamp`, `endTimestamp`
- Execute a Payment — who can call `pay()`, when, and how next timestamp advances
- Pause and Resume — `nextPayment` resets to `now + interval` on resume (no backdated missed intervals)
- Cancel — full remaining pool returns to sender

### Airdrops

- Create an Airdrop Campaign — `amountPerClaim`, `totalPool`, time constraints
- Claim from an Airdrop — self-service `claim()` with claimer signature
- Pause, Resume, Cancel — authority-only controls, remaining pool returned on cancel

### Grants

- Create a Grant — `milestonesTotal`, `amountPerMilestone`, `totalAmount`
- Release a Milestone — authority `releaseMilestone()` flow
- Transfer Grant Recipient — `transfer()` with `FLAG_TRANSFERABLE`

### Bounties

- Create a Bounty Campaign — `rewardPerWinner`, `maxWinners`, `startTimestamp`, `endTimestamp`
- Submit and Claim a Bounty — authority verifies off-chain, co-signs `claim()` with `proofHash`

### Rewards

- Create a Reward Program — `maxRewardAmount`, `totalPool`, reward category
- Issue a Reward — authority issues variable amount per event

### Governance

- Create a Governance Proposal — vault linking, approval count, voting deadline, execution timelock
- Lock Tokens to Vote — `voteChoice` (FOR/AGAINST/ABSTAIN), `unlockTimestamp`
- Approve, Execute, Cancel, and Expire Proposals
- Reclaim Governance Tokens — after `unlockTimestamp` or after proposal completes (`earlyReclaim()`)

---

## REFERENCE

_Full technical specifications for every contract and shared type._

### Architecture

- System Diagram — how Vault, Proposal, Covenant, and Governance contracts interconnect
- NFT Commitment Encoding — 40-byte layout per contract, field-by-field breakdown
- CashScript Version — `^0.13.0`, pre-Loops CHIP, post-Layla notes

### Contracts

#### Streaming

- **VestingCovenant**
  Parameters: `vaultId`, `senderHash`, `scheduleType`, `totalAmount`, `startTimestamp`, `endTimestamp`, `cliffTimestamp`, `stepInterval`, `stepAmount`
  Functions: `claim()`, `complete()`, `pause()`, `resume()`, `cancel()`, `transfer()`
  State: `status`, `flags`, `total_released`, `cursor`, `pause_start`, `recipient_hash`

- **RecurringPaymentCovenant**
  Parameters: `vaultId`, `senderHash`, `recipientHash`, `amountPerInterval`, `intervalSeconds`, `totalAmount`, `startTimestamp`, `endTimestamp`
  Functions: `pay()`, `pause()`, `resume()`, `cancel()`
  State: `status`, `flags`, `total_paid`, `payment_count`, `next_payment_timestamp`, `pause_start`

#### Distribution

- **AirdropCovenant**
  Parameters: `vaultId`, `authorityHash`, `amountPerClaim`, `totalPool`, `startTimestamp`, `endTimestamp`
  Functions: `claim()`, `pause()`, `resume()`, `cancel()`
  State: `status`, `flags`, `total_claimed`, `claims_count`, `last_claim_timestamp`

- **GrantCovenant**
  Parameters: `vaultId`, `authorityHash`, `milestonesTotal`, `amountPerMilestone`, `totalAmount`
  Functions: `releaseMilestone()`, `pause()`, `resume()`, `cancel()`, `transfer()`
  State: `status`, `flags`, `milestones_completed`, `total_released`, `last_release_timestamp`, `recipient_hash`

- **BountyCovenant**
  Parameters: `vaultId`, `authorityHash`, `rewardPerWinner`, `maxWinners`, `startTimestamp`, `endTimestamp`
  Functions: `claim()`, `pause()`, `resume()`, `cancel()`
  State: `status`, `flags`, `total_paid`, `winners_count`, `last_claim_timestamp`

- **RewardCovenant**
  Parameters: `vaultId`, `authorityHash`, `maxRewardAmount`, `totalPool`, `startTimestamp`, `endTimestamp`
  Functions: `reward()`, `pause()`, `resume()`, `cancel()`
  State: `status`, `flags`, `reward_category`, `total_distributed`, `rewards_count`, `last_reward_timestamp`

#### Treasury

- **VaultCovenant**
  Parameters: `vaultId`, `requiredApprovals`, `signer1Hash`, `signer2Hash`, `signer3Hash`, `periodDuration`, `periodCap`, `recipientCap`, `allowlistEnabled`, `allowedAddr1/2/3`
  Functions: `unlockPeriod()`, `spend()`, `pause()`, `resume()`, `emergencyLock()`
  State: `version`, `status`, `rolesMask`, `current_period_id`, `spent_this_period`, `last_update_timestamp`

- **ProposalCovenant**
  Parameters: `vaultId`, `signer1Hash`, `signer2Hash`, `signer3Hash`, `requiredApprovals`
  Functions: `approve()`, `execute()`, `cancel()`, `expire()`
  State: `version`, `status`, `approval_count`, `required_approvals`, `voting_end_timestamp`, `execution_timelock`, `payout_hash`

#### Governance

- **VoteLockCovenant**
  Parameters: `proposalId`, `voteChoice`, `voterHash`, `unlockTimestamp`
  Functions: `reclaim()`, `earlyReclaim()`
  State: `version`, `proposal_id_prefix`, `vote_choice`, `lock_timestamp`, `unlock_timestamp`

### Shared Types

- `VaultState`, `VaultStatus` enum
- `ProposalState`, `ProposalStatus` enum (DRAFT → SUBMITTED → VOTING → APPROVED → QUEUED → EXECUTABLE → EXECUTED → CANCELLED → EXPIRED)
- `ScheduleState`, `ScheduleType` enum (RECURRING, LINEAR_VESTING, STEP_VESTING)
- `VoteState`, `VoteChoice` enum (AGAINST, FOR, ABSTAIN)
- `TallyState`
- `CovenantUTXO<TState>`, `UTXORef`, `CashTokenData`

### Access Control Matrix

| Action | Sender / Authority | Recipient | Any Signer | All Signers | Permissionless |
|-|-|-|-|-|-|
| claim (vesting) | | yes | | | |
| claim (airdrop) | | yes (self) | | | |
| releaseMilestone (grant) | yes | | | | |
| pay (recurring) | | | | | yes |
| pause (vesting/payment) | yes | | | | |
| pause (vault) | | | yes | | |
| emergencyLock (vault) | | | | yes | |
| resume (vault) | | | M-of-N | | |
| spend (vault) | | | M-of-N | | |
| expire (proposal) | | | | | yes |

### Error Reference

Full list of CashScript constraint failures per contract and function.

---

## API

_Data access layer for indexing and querying FlowGuard state._

- **Overview** — REST API + SQLite indexer. Base URL per environment. Rate limiting.
- **Authentication** — API key header (admin routes only)

### Endpoints

#### Streams
- `GET /api/streams` — list streams (filter by sender, recipient, type, status)
- `GET /api/streams/:id` — stream detail with NFT commitment decoded
- `POST /api/streams` — deploy a new vesting or recurring payment stream

#### Vaults
- `GET /api/vaults` — list vaults
- `GET /api/vaults/:id` — vault detail, period accounting, signer roles
- `POST /api/vaults` — deploy a new vault

#### Proposals
- `GET /api/proposals` — list proposals
- `GET /api/proposals/:id` — proposal detail with approval count, timelock
- `POST /api/proposals` — create a spending proposal

#### Airdrops
- `GET /api/airdrops` — list airdrop campaigns
- `GET /api/airdrops/:id` — campaign detail, claims count, remaining pool
- `POST /api/airdrops` — deploy a new airdrop

#### Payments
- `GET /api/payments` — list recurring payments
- `GET /api/payments/:id` — payment detail, next payment timestamp
- `POST /api/payments` — deploy a recurring payment

#### Budget Plans
- `GET /api/budgets` — list budget plans
- `POST /api/budgets` — create a budget plan (grant, bounty, reward)

#### Governance
- `GET /api/governance` — governance tokens, vote locks, tallies
- `POST /api/governance/vote` — lock governance tokens for a vote

#### Explorer
- `GET /api/explorer` — cross-product transaction search
- `GET /api/explorer/advanced` — filter by type, status, asset, date range

#### Wallet
- `GET /api/wallet` — connected wallet UTXOs and token balances

#### Admin
- `GET /api/admin` — indexer health, executor status
- `POST /api/deployment` — register a new contract deployment

### Indexer
- Architecture — blockchain monitor, UTXO scanner, SQLite persistence
- Running the indexer — env vars, chipnet vs mainnet, Railway deployment
- Schema — tables: streams, vaults, proposals, airdrops, payments, budgets, governance, transactions

### Executor
- Architecture — cycle-unlock scheduler, transaction builder, TransactionMonitor
- Running the executor — executor eligibility, signing, fee handling

---

## APP

_User-facing walkthroughs for the FlowGuard web interface._

### Getting Started
- Supported Wallets — Paytaca, WalletConnect-compatible wallets
- Connecting Your Wallet — wallet modal, connect flow
- Chipnet Testing — how to get chipnet BCH, test environment

### Products

- **Vesting** — create, view, claim, pause/resume, cancel, transfer streams. Dashboard view.
- **Recurring Payments** — create payroll or subscription. View payment history. Pause/cancel.
- **Airdrops** — create a campaign, share claim link (`/claim/:token`), monitor progress.
- **Grants** — create milestone-based grant. Release milestones. Cancel and reclaim.
- **Bounties** — create bounty competition. Review and approve submissions. Track winners.
- **Rewards** — create reward program. Issue variable rewards. Monitor pool usage.
- **Vaults** — create treasury vault. Manage signers. Spending proposals and approvals.
- **Governance** — lock tokens to vote. View proposal queue. Track tally results.

### Tools
- Explorer — public explorer for all on-chain FlowGuard transactions, filterable by product and status
- Status Page — indexer health, executor heartbeat, latest indexed block

---

## SECURITY

_Trust model, covenant enforceability, and known constraints._

- **Covenant Enforceability Model** — all covenants marked `[ENFORCEABLE-NOW]`. What this means vs pending CHIPs.
- **Non-Custody** — FlowGuard never holds keys. Funds enforced by covenant bytecode, not a backend server.
- **M-of-N Vault Security** — why hardcoded 3-of-3 pre-Loops CHIP. What changes post-Layla.
- **CashTokens NFT State** — 40-byte commitment limit, commitment integrity, mutable NFT capability.
- **Known Constraints**
  - VaultCovenant: `allowlist` limited to 3 addresses pre-Loops CHIP
  - VoteLockCovenant: early reclaim requires caller to supply `proposalFinalStatus` (no cross-UTXO read on BCH)
  - RecurringPaymentCovenant: `pay()` is permissionless so executor incentive alignment is external
- **Audit Status** — current audit state, scope, findings
