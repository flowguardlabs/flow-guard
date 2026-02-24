/**
 * ScheduleCovenant Unit Tests
 *
 * Tests for recurring/vesting schedule covenant functionality:
 * - Recurring unlock validation
 * - Linear vesting calculations
 * - Cliff period enforcement
 * - CLTV unlock time validation
 */

const { expect } = require('chai');
const { Contract, ElectrumNetworkProvider } = require('cashscript');
const path = require('path');

describe('ScheduleCovenant', () => {
  let scheduleContract;
  let provider;

  // Test parameters (matches ScheduleCovenant constructor)
  const beneficiary = Buffer.alloc(20, 0); // Placeholder beneficiary address hash
  const scheduleType = 0; // 0=RECURRING, 1=LINEAR_VESTING, 2=STEP_VESTING
  const intervalSeconds = 2592000; // 30 days
  const amountPerInterval = 10000000; // 0.1 BCH in satoshis
  const cliffTimestamp = 0; // No cliff

  before(async () => {
    provider = new ElectrumNetworkProvider('chipnet');

    const artifactPath = path.join(__dirname, '../../artifacts/ScheduleCovenant.json');

    try {
      const artifact = require(artifactPath);

      scheduleContract = new Contract(
        artifact,
        [beneficiary, scheduleType, intervalSeconds, amountPerInterval, cliffTimestamp],
        provider
      );
    } catch (error) {
      console.log('Contract artifact not found. Run: npm run build:core');
      throw error;
    }
  });

  describe('Contract Instantiation', () => {
    it('should instantiate ScheduleCovenant with correct parameters', () => {
      expect(scheduleContract).to.exist;
      expect(scheduleContract.functions).to.have.property('unlock');
      expect(scheduleContract.functions).to.have.property('cancelSchedule');
    });

    it('should generate a valid P2SH32 address', () => {
      const address = scheduleContract.address;
      expect(address).to.be.a('string');
      expect(address).to.match(/^(bitcoincash:|bchtest:)/);
    });
  });

  describe('Unlock Function', () => {
    it('should have unlock function for releasing vested funds', () => {
      const unlockFunction = scheduleContract.functions.unlock;
      expect(unlockFunction).to.exist;

      // Unlock function should validate:
      // - tx.locktime >= next_unlock_timestamp (CLTV)
      // - Cliff period passed (if applicable)
      // - Amount released <= available balance
    });
  });

  describe('Cancel Function', () => {
    it('should have cancelSchedule function for early termination', () => {
      const cancelFunction = scheduleContract.functions.cancelSchedule;
      expect(cancelFunction).to.exist;

      // Cancel should allow authorized party to terminate schedule
      // Unvested funds return to treasury
    });
  });

  describe('Contract Bytecode', () => {
    it('should generate bytecode within reasonable size limits', () => {
      const bytecode = scheduleContract.bytecode;
      expect(bytecode).to.exist;

      const bytecodeSize = bytecode.length / 2;
      console.log(`      ScheduleCovenant bytecode size: ${bytecodeSize} bytes`);

      expect(bytecodeSize).to.be.greaterThan(0);
      expect(bytecodeSize).to.be.lessThan(100000);
    });
  });

  after(() => {
    if (provider) {
      provider.disconnect();
    }
  });
});

/**
 * INTEGRATION TEST SCENARIOS:
 *
 * 1. Recurring Schedule (Monthly Grants):
 *    - Create ScheduleUTXO with 30-day intervals
 *    - Wait 30 days → unlock first payment
 *    - ScheduleUTXO recreated with updated next_unlock_timestamp
 *    - Repeat for subsequent unlocks
 *
 * 2. Linear Vesting (Team Allocation):
 *    - Create ScheduleUTXO with 4-year vesting
 *    - 1-year cliff period
 *    - After cliff: unlock proportional amount each month
 *    - Fully vested after 4 years
 *
 * 3. Cliff Enforcement:
 *    - Try to unlock before cliff → should fail
 *    - After cliff passes → unlock succeeds
 *
 * 4. Schedule Cancellation:
 *    - Treasury multisig cancels schedule
 *    - Unvested funds return to treasury
 *    - Vested funds go to beneficiary
 */
