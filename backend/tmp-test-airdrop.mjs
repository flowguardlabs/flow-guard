import { AirdropClaimService } from './dist/services/AirdropClaimService.js';
import { binToHex, hexToBin } from '@bitauth/libauth';

const svc = new AirdropClaimService('chipnet');
const fakeCategoryHex = '11'.repeat(32);
const fakeCommitment = new Uint8Array(40);
fakeCommitment[0] = 0;
fakeCommitment[1] = 1;

const contractUtxo = {
  txid: '22'.repeat(32),
  vout: 0,
  satoshis: 200000n,
  token: {
    category: fakeCategoryHex,
    amount: 0n,
    nft: { capability: 'mutable', commitment: binToHex(fakeCommitment) },
  },
};

const feeUtxo = {
  txid: '33'.repeat(32),
  vout: 1,
  satoshis: 5000n,
};

svc.provider.getUtxos = async (addr) => {
  if (addr === 'bchtest:qpdah7k0pxmqu4sj8t0r4mjvxxwv4f0t7v0k0wwy6c') return [feeUtxo];
  return [contractUtxo];
};

const constructorParams = [
  hexToBin('00'.repeat(32)),
  hexToBin('aa'.repeat(20)),
  1000n,
  100000n,
  0n,
  0n,
];

const result = await svc.buildClaimTransaction({
  airdropId: 'x',
  contractAddress: 'bchtest:pzry9x8gf2tvdw0s3jn54khce6mwt95r9u6y7v4f5k',
  claimer: 'bchtest:qpdah7k0pxmqu4sj8t0r4mjvxxwv4f0t7v0k0wwy6c',
  claimAmount: 1000,
  totalClaimed: 0,
  tokenType: 'BCH',
  tokenCategory: undefined,
  constructorParams,
  currentCommitment: binToHex(fakeCommitment),
  currentTime: Math.floor(Date.now() / 1000),
});

const wc = result.wcTransaction;
console.log(JSON.stringify({
  txInputs: wc.transaction.inputs.length,
  txOutputs: wc.transaction.outputs.length,
  srcOutputs: wc.sourceOutputs.length,
  in0UnlockLen: wc.transaction.inputs[0].unlockingBytecode.length,
  in0SrcUnlockLen: wc.sourceOutputs[0].unlockingBytecode.length,
  in0UnlockHex: binToHex(wc.sourceOutputs[0].unlockingBytecode),
  in1UnlockHex: binToHex(wc.sourceOutputs[1].unlockingBytecode),
  hasContractInfo: !!wc.sourceOutputs[0].contract,
  abiName: wc.sourceOutputs[0].contract?.abiFunction?.name,
  contractName: wc.sourceOutputs[0].contract?.artifact?.contractName,
  seqs: wc.transaction.inputs.map((i) => i.sequenceNumber),
  locktime: wc.transaction.locktime,
}, null, 2));
