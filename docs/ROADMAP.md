# FlowGuard Roadmap

Features and improvements not yet in production. Every item here is feasible on BCH/CashTokens as of today or pending a specific, named CHIP. Nothing speculative.

-

## Phase 1 — Production Hardening

_These fill gaps in what is already built. No new contract primitives required._

### Executor Incentive Layer

Currently the `pay()` function on RecurringPaymentCovenant is permissionless but offers no on-chain reward to the executor. This means execution depends on FlowGuard running its own off-chain scheduler.

What to build: executor fee carved from each payment interval. The covenant enforces `outputs[1].value == amountPerInterval - executorFee` to the executor's address. Executor registers a fee address on deployment. Any node that submits a valid `pay()` transaction earns the fee.

Affects: `RecurringPaymentCovenant`, `PaymentDeploymentService`, executor scheduler, `CreatePaymentPage`.

### Deployment Registry On-Chain Anchor

Currently `DeploymentRegistryService` tracks all deployed covenants in SQLite. If the indexer database is lost, all active contracts must be rediscovered by scanning the blockchain from scratch.

What to build: a Merkle-anchored on-chain registry UTXO that stores a hash of the canonical deployment list. The indexer can validate its local state against this anchor on startup.

Affects: `DeploymentRegistryService`, indexer schema, blockchain monitor.

### MerkleTreeService for Airdrop Eligibility

Currently `AirdropCovenant` uses a fixed `amountPerClaim` with claimer signature only. There is no Merkle proof for eligibility lists.

What to build: allowlist-based airdrops where only whitelisted addresses can claim. Authority publishes a Merkle root at contract deployment. Claimer submits a proof path. The covenant verifies the path against the root.

Requires: CashScript `checkDataSig` for Merkle path verification, or off-chain proof validation co-signed by authority. The `MerkleTreeService` already exists in backend.

Affects: `AirdropCovenant`, `AirdropDeploymentService`, `AirdropClaimService`, `CreateAirdropPage`.

### Batch Operations

`BatchCreateStreamsPage` exists in the frontend but the backend batch transaction builder is not complete. A single transaction should be able to deploy multiple covenant UTXOs at once.

What to build: `BatchManager` contract that accepts multiple covenant deployments in one transaction. Backend service that aggregates deployment parameters and builds a single transaction. Frontend batch UI connected end-to-end.

Affects: `BatchCreateStreamsPage`, `StreamDeploymentService`, `TransactionBuilder`.

-

## Phase 2 — New Product Surfaces

_Covenants that are fully buildable now on CashTokens._

### Scheduled Payments (One-Time Future-Date)

A covenant that holds funds and releases them to a recipient on a specific future timestamp. No interval, no recurring logic. Cancellable by sender before execution.

Use cases: deferred salary bonus, grant disbursement on a specific date, escrow for a delivery.

New contract: `ScheduledPaymentCovenant`. Parameters: `senderHash`, `recipientHash`, `amount`, `releaseTimestamp`, `cancelable`. Functions: `release()` (permissionless after `releaseTimestamp`), `cancel()` (sender-only before release).

Affects: new page `CreateScheduledPaymentPage`, backend service, API route, indexer.

### USD-Denominated Streams

Recurring payment amount denominated in USD, paid in BCH or a stablecoin CashToken. The per-interval payout is recalculated based on the BCH/USD exchange rate at execution time.

Currently feasible via: off-chain oracle co-signing each `pay()` call. The covenant checks that the oracle pubkey co-signed the transaction, and that the declared rate is within a tolerance band.

New contract: `OraclePricedPaymentCovenant`. Parameters include `oracleHash`, `usdAmountPerInterval`, `rateTolerance`. Functions: `pay(sig oracleSig, pubkey oraclePubkey, int declaredRate)`.

Affects: new deployment and claim services, rate oracle integration, `CreatePaymentPage` USD mode toggle.

### Multi-Recipient Vesting (Batch Vault Streaming)

A single vault action that creates multiple vesting covenants in one transaction, replacing the current manual batch flow. One proposal, one execution, N streams created atomically.

Feasibility: pre-Loops CHIP limits this to a fixed N (currently up to ~4 outputs before script size limits). Post-Loops CHIP removes this restriction.

What to build now: a `BatchVestingDeployer` helper contract that creates a fixed number of streams from one vault spend. Frontend updated to allow defining N recipients and their individual parameters before submitting.

### Governance Tally Contract

VoteLockCovenant tracks individual vote locks but does not aggregate them on-chain. The tally exists only in the backend (`TallyState` in shared types).

What to build: `TallyCommitment_FixedMax` already exists as a draft in `contracts/core/governance/`. Complete the implementation: a tally UTXO that accumulates `votesFor`, `votesAgainst`, `votesAbstain` as individual vote UTXOs are consumed. The authority submits a tally proof to finalize.

Affects: `TallyCommitment_FixedMax.cash`, `TallyCommitment_Attested.cash`, governance API, `GovernancePage`.

-

## Phase 3 — Protocol Upgrades (Pending CHIPs)

_Dependent on specific BCH CHIPs. Clearly labelled. Not speculative work — just blocked on activation._

### Arbitrary M-of-N Signers (Loops CHIP / Post-Layla)

`VaultCovenant` currently hardcodes a maximum of 3 registered signers due to CashScript's lack of loops pre-Layla. The comment in `VaultCovenant.cash` explicitly notes: _"PRE-LAYLA: Hardcoded max 3-of-3. POST-LAYLA: Loops CHIP enables arbitrary M-of-N."_

After Loops CHIP activates: refactor `VaultCovenant` to use a `signerHashes` array with dynamic length. M-of-N becomes configurable up to any N during deployment. `CreateVaultPage` updated to allow adding N signers.

### Large Allowlists (Loops CHIP)

`VaultCovenant.allowlist` currently capped at 3 addresses. Loops CHIP enables iterating over a stored list of arbitrary length, removing this constraint.

### Native Streaming Without Executor (Introspection CHIP)

Recurring payments currently require an off-chain executor. A future introspection CHIP that allows reading the current block timestamp inside a loop would allow the covenant itself to enforce continuous balance draining without any executor, similar to Superfluid's model.

This is a research track, not a committed roadmap item.

-

## Infrastructure

### Railway Multi-Service Deployment

Currently the backend runs as a single process. The Railway config (`railway.toml`) already splits API, indexer, and executor into separate service definitions. Complete the split so each scales independently.

### GraphQL API Layer

Current API is REST-only. Adding a GraphQL layer (using an existing indexer like The Graph or a self-hosted HyperIndex/Envio setup adapted for BCH) would allow frontend queries to be co-located with data requirements and eliminate over-fetching.

### SDK Package

Export the contract factory, service layer, and shared types as an installable npm package (`@flowguard/sdk`). This allows third-party developers to integrate FlowGuard covenants into their own products without running the full backend.

Minimum scope: `VestingCovenant` deploy and claim. `RecurringPaymentCovenant` deploy and pay. Type definitions from `shared/types`.

### Verifiable Deployment Addresses

Currently deployment addresses are tracked in the database. Publish a canonical, signed `deployments.json` file for each release (mainnet and chipnet) with the contract bytecode hash so integrators can verify the address matches the published source.
