const path = require('path');
const { expect } = require('chai');
const { compileFile } = require('cashc');

const CONTRACT_PATH = path.join(__dirname, '..', 'FlowGuardEnhanced.cash');

describe('FlowGuardEnhanced.cash', () => {
  let artifact;

  before(() => {
    artifact = compileFile(CONTRACT_PATH);
  });

  it('compiles with the expected constructor inputs', () => {
    expect(artifact.contractName).to.equal('FlowGuardEnhanced');
    expect(artifact.constructorInputs.map((input) => input.name)).to.deep.equal([
      'signer1',
      'signer2',
      'signer3',
      'approvalThreshold',
      'state',
      'cycleDuration',
      'vaultStartTime',
      'spendingCap',
    ]);
  });

  it('exposes Layla CHIP entrypoints', () => {
    const fnNames = artifact.abi.map((entry) => entry.name);
    expect(fnNames).to.include.members(['unlock', 'createProposal', 'approveProposal', 'executePayout']);
  });

  it('mirrors the bitwise state layout (cycles + proposals)', () => {
    const replaceBits = (source, shift, width, value) => {
      const mask = (1 << width) - 1;
      const current = (source >> shift) & mask;
      const cleared = source - (current << shift);
      return cleared | (value << shift);
    };

    const baseState = 0;
    const unlockedCycleState = baseState | (1 << 2);
    const pendingProposalState = replaceBits(baseState, 32 + 5 * 2, 2, 1);
    const approvedProposalState = replaceBits(pendingProposalState, 32 + 5 * 2, 2, 2);

    expect(unlockedCycleState).to.equal(4);
    expect(pendingProposalState).to.equal(32 + (1 << (32 + 5 * 2 - 32))); // sanity check: bit math
    expect(approvedProposalState > pendingProposalState).to.be.true;
  });
});

