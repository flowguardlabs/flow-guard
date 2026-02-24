# FlowGuard Contract Benchmarking Suite

**Purpose**: Empirically determine engineering limits for pre-Layla contracts

Per workflow3 requirements, the following constants require benchmarking:
- `MAX_SIGNERS_PRE_LAYLA` - Maximum M-of-N signers supportable
- `MAX_VOTES_PRE_LAYLA` - Maximum votes aggregatable trustlessly on-chain
- `MAX_RECIPIENTS_PRE_LAYLA` - Maximum payout recipients per transaction

## Benchmarking Factors

### Script Size Limits
- **P2SH32**: Max script size constraints
- **Transaction standardness**: BCH node relay rules
- **Bytecode bloat**: Hardcoded branches increase linearly with N

### Performance Limits
- **Opcode count**: Script evaluation limits
- **Stack size**: Max elements on stack during validation
- **Validation time**: Must complete within reasonable time (< 1 second)

### Transaction Size Limits
- **Max tx size**: 100KB standard limit (can be larger but may not relay)
- **Input count**: More inputs = larger tx
- **Output count**: More payouts = larger tx

## Benchmarking Tests

### Test 1: M-of-N Signer Limits

**Goal**: Determine MAX_SIGNERS_PRE_LAYLA

**Method**:
1. Compile VaultCovenant with increasing M values (2-of-3, 3-of-5, 5-of-7, 7-of-10, 10-of-15)
2. Measure compiled contract bytecode size
3. Test transaction construction and validation on chipnet
4. Identify largest M where:
   - Bytecode < P2SH32 limit
   - Transaction relays successfully
   - Validation completes < 1 second

**Expected Result**: MAX_SIGNERS_PRE_LAYLA = 5 to 10 (conservative estimate)

**Run**:
```bash
npm run benchmark:signers
```

### Test 2: Vote Tally Input Limits

**Goal**: Determine MAX_VOTES_PRE_LAYLA

**Method**:
1. Create test VoteUTXOs on chipnet
2. Construct CreateTally transactions with increasing input counts (5, 10, 20, 30, 50)
3. Measure transaction size and validation time
4. Test relay and confirmation
5. Identify largest input count where:
   - Transaction size < 100KB
   - Relays successfully
   - Validates < 1 second
   - Covenant logic completes without hitting limits

**Expected Result**: MAX_VOTES_PRE_LAYLA = 10 to 30 (conservative estimate)

**Run**:
```bash
npm run benchmark:votes
```

### Test 3: Payout Recipient Limits

**Goal**: Determine MAX_RECIPIENTS_PRE_LAYLA

**Method**:
1. Construct ExecuteProposal transactions with increasing output counts (5, 10, 20, 50, 100)
2. Measure transaction size
3. Test relay on chipnet
4. Identify largest output count where:
   - Transaction size < 100KB
   - Relays successfully

**Expected Result**: MAX_RECIPIENTS_PRE_LAYLA = 50 to 200 (likely larger than signers/votes)

**Run**:
```bash
npm run benchmark:recipients
```

## Results Documentation

After running benchmarks, document results in:
- `contracts/tests/benchmarks/RESULTS.md`
- Update contract constants in `shared/constants/covenantParams.ts`

**Format**:
```typescript
// contracts/tests/benchmarks/RESULTS.md
export const BENCHMARK_RESULTS = {
  MAX_SIGNERS_PRE_LAYLA: 7,           // Tested: 7-of-10 works, 10-of-15 exceeds limits
  MAX_VOTES_PRE_LAYLA: 20,            // Tested: 20 votes OK, 30 hits tx size limit
  MAX_RECIPIENTS_PRE_LAYLA: 100,      // Tested: 100 recipients OK, 200 hits tx size limit

  // Measured values
  scriptSize_7of10: 12500,            // bytes
  txSize_20votes: 85000,              // bytes
  validationTime_20votes: 450,        // milliseconds
};
```

## Post-Layla Comparison

After May 15, 2026 upgrade, re-run benchmarks for v2 contracts using:
- Loops CHIP (arbitrary iteration)
- Functions CHIP (modular bytecode)
- Bitwise CHIP (efficient state encoding)

Expected improvements:
- Arbitrary M-of-N (no hardcoded limit)
- Arbitrary vote count (trustless tally for 100+)
- Smaller bytecode (Functions reduce duplication)

## CI Integration

Add benchmarking to CI pipeline:
```yaml
# .github/workflows/benchmark.yml
name: Contract Benchmarks
on:
  push:
    branches: [main]
    paths: ['contracts/**']
  schedule:
    - cron: '0 0 * * 0'  # Weekly on Sunday

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - name: Run benchmarks on chipnet
        run: npm run benchmark:all
      - name: Upload results
        uses: actions/upload-artifact@v2
        with:
          name: benchmark-results
          path: contracts/tests/benchmarks/RESULTS.md
```

## Notes

- Benchmarks must run on **chipnet** (testnet) to avoid mainnet tx costs
- Results may vary by BCH node implementation (BCHN vs BU)
- Conservative limits recommended (leave headroom for safety)
- Document any non-standard relay assumptions
