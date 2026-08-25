# FlowGuard Contracts

CashScript covenants for FlowGuard treasuries, streaming, distributions, and governance.

Each covenant is self-enforcing: once funded, the rules live on chain and neither
FlowGuard nor the creator can move funds outside what the contract permits.

## Layout

Sources are grouped by product area under `core/`, and each compiles to a JSON artifact
under `artifacts/` that the backend imports at runtime.

```
core/
  treasury/     VaultCovenant, ProposalCovenant
  streaming/    VestingCovenant, FtVestingCovenant, HybridVestingCovenant,
                RecurringPaymentCovenant, TrancheVestingCovenant
  distribution/ AirdropCovenant, RewardCovenant, BountyCovenant, GrantCovenant
  governance/   VoteLockCovenant, TallyCommitment_FixedMax, TallyCommitment_Attested
artifacts/      compiled output, committed and consumed by the backend
tests/          unit, streaming, integration, chipnet, and benchmarks
```

`VestingCovenant` is the BCH single-UTXO form; `FtVestingCovenant` is the two-UTXO form
for CashToken fungible tokens. They are separate contracts, not a mode switch.

## Build

```bash
pnpm build              # every covenant -> artifacts/
pnpm build:streaming    # one group
```

Artifacts are committed, because the backend imports them directly rather than compiling
at runtime. A source edit that is not rebuilt and committed ships a backend bound to
stale bytecode.

```bash
pnpm check              # cashc syntax check, no output written
pnpm check:drift        # rebuild and diff against what is committed
```

`check:drift` is what CI gates on. It ignores the `updatedAt` field, which `cashc`
stamps on every build.

## Test

```bash
pnpm test               # unit
pnpm test:streaming
pnpm test:integration
pnpm test:chipnet       # requires a funded chipnet wallet
pnpm test:all
```

Benchmarks measure how covenant size and cost scale with signer, vote, and recipient
counts — see [tests/benchmarks](./tests/benchmarks).

```bash
pnpm benchmark:all
```

## Working on a covenant

1. Edit the `.cash` source under `core/`.
2. `pnpm check` for syntax.
3. `pnpm build` to regenerate the artifact.
4. `pnpm test` — and add a case, since a covenant bug is unrecoverable once funded.
5. Commit source and artifact together.

The 40-byte NFT commitment is the binding constraint on covenant state. Every field a
contract needs across a spend has to fit there, which is why several covenants pack
counters into 5-byte timestamps and bitfield flags rather than using whole words. See
the commitment layout comment at the top of each source.

## Docs

Concepts and per-product guides: [docs.flowguard.cash](https://docs.flowguard.cash).
