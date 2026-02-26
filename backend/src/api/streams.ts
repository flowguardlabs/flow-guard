/**
 * Streams API Endpoints
 * Handles streaming payment operations
 */

import { Router, Request, Response } from 'express';
import { createHash, randomUUID } from 'crypto';
import { cashAddressToLockingBytecode, hexToBin } from '@bitauth/libauth';
import db from '../database/schema.js';
import { streamService, Stream, StreamClaim } from '../services/streamService.js';
import { StreamDeploymentService } from '../services/StreamDeploymentService.js';
import { StreamFundingService } from '../services/StreamFundingService.js';
import { StreamClaimService } from '../services/StreamClaimService.js';
import { StreamCancelService } from '../services/StreamCancelService.js';
import { PaymentClaimService } from '../services/PaymentClaimService.js';
import { ContractService } from '../services/contract-service.js';
import { serializeWcTransaction } from '../utils/wcSerializer.js';
import { transactionExists, transactionHasExpectedOutput } from '../utils/txVerification.js';
import {
  bchToSatoshis,
  displayAmountToOnChain,
  isFungibleTokenType,
  onChainAmountToDisplay,
} from '../utils/amounts.js';

const router = Router();

/**
 * GET /api/streams
 * List all streams for a recipient or sender
 * Query params: ?recipient={address} OR ?sender={address} [&status={status}]
 */
router.get('/streams', async (req: Request, res: Response) => {
  try {
    const { recipient, sender, address, status } = req.query;

    if (!recipient && !sender && !address) {
      return res.status(400).json({
        error: 'Must provide either recipient, sender, or address parameter',
      });
    }

    let rows: any[];
    if (sender && recipient) {
      rows = db!.prepare('SELECT * FROM streams WHERE sender = ? AND recipient = ? ORDER BY created_at DESC').all(sender, recipient);
    } else if (sender) {
      rows = db!.prepare('SELECT * FROM streams WHERE sender = ? ORDER BY created_at DESC').all(sender);
    } else if (recipient) {
      rows = db!.prepare('SELECT * FROM streams WHERE recipient = ? ORDER BY created_at DESC').all(recipient);
    } else {
      // address param: get all streams where user is sender OR recipient
      rows = db!.prepare('SELECT * FROM streams WHERE sender = ? OR recipient = ? ORDER BY created_at DESC').all(address, address);
    }

    let streams = rows.map(rowToStream);

    if (status) {
      streams = streams.filter(s => s.status === status);
    }

    const enrichedStreams = streamService.enrichStreams(streams);

    res.json({
      success: true,
      streams: enrichedStreams,
      total: enrichedStreams.length,
    });
  } catch (error: any) {
    console.error('GET /streams error:', error);
    res.status(500).json({ error: 'Failed to fetch streams', message: error.message });
  }
});

/**
 * GET /api/streams/:id
 * Get single stream details with claim history
 */
router.get('/streams/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const row = db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    if (!row) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    const claimRows = db!.prepare('SELECT * FROM stream_claims WHERE stream_id = ? ORDER BY claimed_at DESC').all(id) as any[];

    const stream = rowToStream(row);
    const claims: StreamClaim[] = claimRows.map(c => ({
      id: c.id,
      stream_id: c.stream_id,
      recipient: c.recipient,
      amount: c.amount,
      claimed_at: c.claimed_at,
      tx_hash: c.tx_hash || undefined,
    }));

    res.json({
      success: true,
      stream: streamService.enrichStream(stream),
      claims,
    });
  } catch (error: any) {
    console.error(`GET /streams/${req.params.id} error:`, error);
    res.status(500).json({ error: 'Failed to fetch stream', message: error.message });
  }
});

/**
 * POST /api/streams/create
 * Create a single stream
 */
router.post('/streams/create', async (req: Request, res: Response) => {
  try {
    const {
      sender,
      recipient,
      tokenType,
      tokenCategory,
      totalAmount,
      streamType,
      startTime,
      endTime,
      cliffTimestamp,
      cancelable,
      description,
      vaultId,
    } = req.body;

    if (!sender || !recipient) {
      return res.status(400).json({ error: 'Sender and recipient are required' });
    }
    if (!totalAmount || totalAmount <= 0) {
      return res.status(400).json({ error: 'Total amount must be greater than 0' });
    }
    if (!streamType || !['LINEAR', 'RECURRING', 'STEP'].includes(streamType)) {
      return res.status(400).json({ error: 'Invalid stream type' });
    }
    if (!isP2pkhAddress(sender) || !isP2pkhAddress(recipient)) {
      return res.status(400).json({
        error: 'Invalid address type',
        message: 'Stream sender and recipient must be P2PKH cash addresses.',
      });
    }
    const cancelableRequested = cancelable !== false;
    const normalizedTokenType: 'BCH' | 'FUNGIBLE_TOKEN' = tokenType === 'FUNGIBLE_TOKEN' || tokenType === 'CASHTOKENS'
      ? 'FUNGIBLE_TOKEN'
      : 'BCH';
    if (normalizedTokenType === 'FUNGIBLE_TOKEN' && !tokenCategory) {
      return res.status(400).json({ error: 'Token category required for CashTokens' });
    }

    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);

    // Deploy stream contract with proper NFT state
    const deploymentService = new StreamDeploymentService('chipnet');

    // Resolve vault linkage: support standalone streams while preserving nonzero
    // constructor vaultId expected by on-chain covenant invariants.
    let actualVaultId = deriveStandaloneVaultId(`${id}:${sender}:${recipient}:${now}`);
    if (vaultId) {
      const vaultRow = db!.prepare('SELECT * FROM vaults WHERE vault_id = ?').get(vaultId) as any;
      if (vaultRow?.constructor_params) {
        const vaultParams = JSON.parse(vaultRow.constructor_params);
        if (vaultParams[0]?.type === 'bytes') {
          actualVaultId = vaultParams[0].value;
        }
      }
    }

    const resolvedEndTime = endTime || startTime + 86400 * 365;
    const deploymentParams = {
      vaultId: actualVaultId,
      sender,
      recipient,
      totalAmount,
      startTime,
      endTime: resolvedEndTime,
      streamType: streamType as 'LINEAR' | 'STEP' | 'RECURRING',
      cliffTime: cliffTimestamp,
      cancelable: cancelableRequested,
      tokenType: normalizedTokenType,
      tokenCategory,
    };

    let intervalSecondsForRow: number | null = null;
    let deployment;
    if (streamType === 'RECURRING') {
      const baseIntervalSeconds = 30 * 24 * 60 * 60;
      const durationSeconds = Math.max(baseIntervalSeconds, resolvedEndTime - startTime);
      const maxIntervals = Math.max(1, Math.floor(durationSeconds / baseIntervalSeconds));
      const totalOnChain = displayAmountToOnChain(Number(totalAmount), normalizedTokenType);
      if (totalOnChain <= 0) {
        return res.status(400).json({ error: 'Recurring stream total amount must be greater than zero' });
      }
      let intervalCount = maxIntervals;
      while (intervalCount > 1 && totalOnChain % intervalCount !== 0) {
        intervalCount -= 1;
      }
      intervalSecondsForRow = Math.max(1, Math.floor(durationSeconds / intervalCount));
      const amountPerIntervalOnChain = Math.floor(totalOnChain / intervalCount);
      const amountPerIntervalDisplay = onChainAmountToDisplay(amountPerIntervalOnChain, normalizedTokenType);
      deployment = await deploymentService.deployRecurringStream({
        ...deploymentParams,
        intervalSeconds: intervalSecondsForRow,
        amountPerInterval: amountPerIntervalDisplay,
      });
    } else {
      deployment = await deploymentService.deployVestingStream(deploymentParams);
    }

    const countRow = db!.prepare('SELECT COUNT(*) as cnt FROM streams').get() as any;
    const streamId = streamService.generateStreamId(
      normalizedTokenType === 'BCH' ? 'BCH' : 'CASHTOKENS',
      Number(countRow?.cnt || 0) + 1,
    );

    // Store with PENDING status - becomes ACTIVE after funding tx confirmed
    db!.prepare(`
      INSERT INTO streams (id, stream_id, vault_id, sender, recipient, token_type, token_category,
        total_amount, withdrawn_amount, stream_type, start_time, end_time, interval_seconds, cliff_timestamp,
        cancelable, transferable, status, description, created_at, updated_at,
        contract_address, constructor_params, nft_commitment, nft_capability)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 0, 'PENDING', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, streamId, vaultId || null, sender, recipient,
      normalizedTokenType === 'BCH' ? 'BCH' : 'CASHTOKENS',
      tokenCategory || null,
      totalAmount, streamType, startTime, resolvedEndTime || null, intervalSecondsForRow, cliffTimestamp || null,
      cancelableRequested ? 1 : 0,
      description || null, now, now,
      deployment.contractAddress,
      JSON.stringify(deployment.constructorParams),
      deployment.initialCommitment,
      'mutable'
    );

    const row = db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    const stream = streamService.enrichStream(rowToStream(row));

    res.json({
      success: true,
      message: 'Stream contract deployed - awaiting funding transaction',
      stream,
      deployment: {
        contractAddress: deployment.contractAddress,
        streamId,
        onChainStreamId: deployment.streamId,
        fundingRequired: deployment.fundingTxRequired,
        nftCommitment: deployment.initialCommitment,
      },
    });
  } catch (error: any) {
    console.error('POST /streams/create error:', error);
    res.status(500).json({ error: 'Failed to create stream', message: error.message });
  }
});

/**
 * GET /api/streams/:id/funding-info
 * Get funding transaction parameters for a pending stream
 */
router.get('/streams/:id/funding-info', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const row = db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    if (!row) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    if (row.status !== 'PENDING') {
      return res.status(400).json({
        error: 'Stream is not pending',
        message: `Stream status is ${row.status}. Only PENDING streams can be funded.`,
      });
    }

    const contractAddress = row.contract_address;
    if (!contractAddress) {
      return res.status(500).json({ error: 'Contract address not found for stream' });
    }

    const tokenType = row.token_type === 'CASHTOKENS' ? 'FUNGIBLE_TOKEN' : 'BCH';
    const fundingAmount = row.token_type === 'CASHTOKENS'
      ? Number(row.total_amount)
      : Math.floor(Number(row.total_amount) * 100000000);
    const nftCommitment = row.nft_commitment;
    if (!nftCommitment) {
      return res.status(400).json({ error: 'Missing stream NFT commitment for funding' });
    }

    const fundingService = new StreamFundingService('chipnet');
    const fundingTx = await fundingService.buildFundingTransaction({
      contractAddress,
      senderAddress: row.sender,
      amount: fundingAmount,
      tokenType,
      tokenCategory: row.token_category || undefined,
      nftCommitment,
      nftCapability: (row.nft_capability || 'mutable') as 'none' | 'mutable' | 'minting',
    });

    res.json({
      success: true,
      fundingInfo: {
        streamId: row.stream_id,
        contractAddress,
        sender: row.sender,
        recipient: row.recipient,
        amount: fundingAmount,
        tokenType: row.token_type,
        tokenCategory: row.token_category,
        tokenAmount: row.token_type === 'CASHTOKENS' ? Number(row.total_amount) : undefined,
        nftCommitment,
        inputs: fundingTx.inputs,
        outputs: fundingTx.outputs,
        fee: fundingTx.fee,
      },
      wcTransaction: serializeWcTransaction(fundingTx.wcTransaction),
    });
  } catch (error: any) {
    console.error(`GET /streams/${req.params.id}/funding-info error:`, error);
    res.status(500).json({ error: 'Failed to get funding info', message: error.message });
  }
});

/**
 * POST /api/streams/:id/confirm-funding
 * Mark stream as funded after successful funding transaction
 */
router.post('/streams/:id/confirm-funding', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { txHash } = req.body;

    if (!txHash) {
      return res.status(400).json({ error: 'Transaction hash required' });
    }

    if (!(await transactionExists(txHash, 'chipnet'))) {
      return res.status(400).json({ error: 'Transaction hash not found on chipnet' });
    }

    const row = db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    if (!row) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    if (row.status !== 'PENDING') {
      return res.status(400).json({ error: 'Stream is not pending' });
    }

    const expectedContractOutput = await transactionHasExpectedOutput(
      txHash,
      {
        address: row.contract_address,
        minimumSatoshis: BigInt(
          row.token_type === 'CASHTOKENS'
            ? 546
            : Math.max(546, displayAmountToOnChain(Number(row.total_amount), row.token_type)),
        ),
        ...(row.token_type === 'CASHTOKENS' && row.token_category
          ? {
              tokenCategory: row.token_category,
              minimumTokenAmount: BigInt(Math.max(0, Math.trunc(Number(row.total_amount)))),
            }
          : {}),
        requireNft: true,
        requiredNftCapability: 'mutable',
        minimumNftCommitmentBytes: 32,
      },
      'chipnet',
    );

    if (!expectedContractOutput) {
      return res.status(400).json({
        error: 'Funding transaction does not include the expected contract output',
      });
    }

    // Update stream status to ACTIVE and store funding tx_hash
    // In production, indexer should watch blockchain and update automatically
    // This is a manual confirmation for now
    db!.prepare(`
      UPDATE streams
      SET status = 'ACTIVE', tx_hash = ?, updated_at = ?
      WHERE id = ?
    `).run(txHash, Math.floor(Date.now() / 1000), id);

    const updatedRow = db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    const stream = streamService.enrichStream(rowToStream(updatedRow));

    res.json({
      success: true,
      message: 'Stream funded successfully',
      stream,
      txHash,
    });
  } catch (error: any) {
    console.error(`POST /streams/${req.params.id}/confirm-funding error:`, error);
    res.status(500).json({ error: 'Failed to confirm funding', message: error.message });
  }
});

/**
 * POST /api/streams/:id/claim
 * Build claim transaction for vested amount
 */
router.post('/streams/:id/claim', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { recipientAddress } = req.body;

    if (!recipientAddress) {
      return res.status(400).json({ error: 'Recipient address required' });
    }

    const row = db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    if (!row) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    if (row.status !== 'ACTIVE') {
      return res.status(400).json({
        error: 'Stream is not active',
        message: `Stream status is ${row.status}. Only ACTIVE streams can be claimed.`,
      });
    }
    if (!row.contract_address || !row.constructor_params) {
      return res.status(400).json({
        error: 'Stream contract is not fully configured',
        message: 'This stream has no deployable on-chain contract state.',
      });
    }

    // Verify recipient matches
    if (row.recipient.toLowerCase() !== recipientAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the stream recipient can claim funds' });
    }

    const contractService = new ContractService('chipnet');
    const constructorParams = deserializeConstructorParams(row.constructor_params);
    const currentCommitment = await contractService.getNFTCommitment(row.contract_address)
      || row.nft_commitment
      || '00'.repeat(40);

    if (row.stream_type === 'RECURRING') {
      const recurringClaimService = new PaymentClaimService('chipnet');
      const recurringState = parseRecurringCommitment(currentCommitment);
      const claimTx = await recurringClaimService.buildClaimTransaction({
        paymentId: row.stream_id,
        contractAddress: row.contract_address,
        recipient: row.recipient,
        amountPerInterval: Number(toBigIntParam(constructorParams[3], 'amountPerInterval')),
        intervalSeconds: Number(toBigIntParam(constructorParams[4], 'intervalSeconds')),
        totalPaid: Number(recurringState.totalPaid),
        nextPaymentTime: recurringState.nextPaymentTime,
        currentTime: Math.floor(Date.now() / 1000),
        endTime: row.end_time || undefined,
        tokenType: row.token_type === 'CASHTOKENS' ? 'FUNGIBLE_TOKEN' : 'BCH',
        tokenCategory: row.token_category || undefined,
        constructorParams,
        currentCommitment,
      });
      const claimableAmount = onChainAmountToDisplay(claimTx.claimableAmount, row.token_type);
      return res.json({
        success: true,
        claimableAmount,
        wcTransaction: serializeWcTransaction(claimTx.wcTransaction),
      });
    }

    const claimService = new StreamClaimService('chipnet');
    const isTokenStream = isFungibleTokenType(row.token_type);
    const totalAmountOnChain = isTokenStream
      ? Math.max(0, Math.trunc(Number(row.total_amount)))
      : bchToSatoshis(Number(row.total_amount));
    const totalReleasedOnChain = isTokenStream
      ? Math.max(0, Math.trunc(Number(row.withdrawn_amount || 0)))
      : bchToSatoshis(Number(row.withdrawn_amount || 0));
    const computedStepCount = row.interval_seconds && row.end_time
      ? Math.max(1, Math.floor((row.end_time - row.start_time) / row.interval_seconds))
      : 0;
    const stepAmountOnChain = computedStepCount > 0
      ? Math.floor(totalAmountOnChain / computedStepCount)
      : undefined;

    // Build claim parameters
    const claimParams = {
      streamId: row.stream_id,
      contractAddress: row.contract_address,
      recipient: row.recipient,
      totalAmount: totalAmountOnChain,
      totalReleased: totalReleasedOnChain,
      startTime: row.start_time,
      endTime: row.end_time || row.start_time + 86400 * 365,
      currentTime: Math.floor(Date.now() / 1000),
      streamType: row.stream_type as 'LINEAR' | 'STEP',
      stepInterval: row.interval_seconds,
      stepAmount: stepAmountOnChain,
      tokenType: row.token_type === 'CASHTOKENS' ? 'FUNGIBLE_TOKEN' as const : 'BCH' as const,
      tokenCategory: row.token_category,
      constructorParams,
      currentCommitment,
    };

    // Validate claim
    const validation = claimService.validateClaim(claimParams);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const claimTx = await claimService.buildClaimTransaction(claimParams);
    const claimableAmount = onChainAmountToDisplay(claimTx.claimableAmount, row.token_type);

    res.json({
      success: true,
      claimableAmount,
      wcTransaction: serializeWcTransaction(claimTx.wcTransaction),
    });
  } catch (error: any) {
    console.error(`POST /streams/${req.params.id}/claim error:`, error);
    res.status(500).json({ error: 'Failed to build claim transaction', message: error.message });
  }
});

/**
 * POST /api/streams/:id/confirm-claim
 * Update stream state after successful claim
 */
router.post('/streams/:id/confirm-claim', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { claimedAmount, txHash } = req.body;

    if (!claimedAmount || !txHash) {
      return res.status(400).json({ error: 'Claimed amount and transaction hash required' });
    }

    if (!(await transactionExists(txHash, 'chipnet'))) {
      return res.status(400).json({ error: 'Transaction hash not found on chipnet' });
    }

    const row = db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    if (!row) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    const claimedAmountOnChain = isFungibleTokenType(row.token_type)
      ? Math.max(0, Math.trunc(Number(claimedAmount)))
      : bchToSatoshis(Number(claimedAmount));

    const expectedClaimOutput = await transactionHasExpectedOutput(
      txHash,
      {
        address: row.recipient,
        minimumSatoshis: BigInt(
          isFungibleTokenType(row.token_type)
            ? 546
            : Math.max(546, claimedAmountOnChain),
        ),
        ...(row.token_type === 'CASHTOKENS' && row.token_category
          ? {
              tokenCategory: row.token_category,
              minimumTokenAmount: BigInt(Math.max(0, Math.trunc(claimedAmountOnChain))),
            }
          : {}),
      },
      'chipnet',
    );

    if (!expectedClaimOutput) {
      return res.status(400).json({
        error: 'Claim transaction does not include the expected recipient output',
      });
    }

    // Update withdrawn amount
    const newWithdrawnAmount = row.withdrawn_amount + claimedAmount;

    db!.prepare(`
      UPDATE streams
      SET withdrawn_amount = ?, updated_at = ?
      WHERE id = ?
    `).run(newWithdrawnAmount, Math.floor(Date.now() / 1000), id);

    // Record claim in stream_claims table
    db!.prepare(`
      INSERT INTO stream_claims (id, stream_id, recipient, amount, claimed_at, tx_hash)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      row.stream_id,
      row.recipient,
      claimedAmount,
      Math.floor(Date.now() / 1000),
      txHash
    );

    const updatedRow = db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    const stream = streamService.enrichStream(rowToStream(updatedRow));

    res.json({
      success: true,
      message: 'Claim confirmed',
      stream,
    });
  } catch (error: any) {
    console.error(`POST /streams/${req.params.id}/confirm-claim error:`, error);
    res.status(500).json({ error: 'Failed to confirm claim', message: error.message });
  }
});

/**
 * GET /api/streams/:id/claim-info
 * Get claim transaction parameters for an active stream
 */
router.get('/streams/:id/claim-info', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const row = db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    if (!row) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    if (row.status !== 'ACTIVE') {
      return res.status(400).json({
        error: 'Stream is not active',
        message: `Stream status is ${row.status}. Only ACTIVE streams can be claimed.`,
      });
    }
    if (!row.contract_address || !row.constructor_params) {
      return res.status(400).json({
        error: 'Stream contract is not fully configured',
        message: 'This stream has no deployable on-chain contract state.',
      });
    }

    const contractService = new ContractService('chipnet');
    const constructorParams = deserializeConstructorParams(row.constructor_params);
    const currentCommitment = await contractService.getNFTCommitment(row.contract_address)
      || row.nft_commitment
      || '00'.repeat(40);

    if (row.stream_type === 'RECURRING') {
      const recurringClaimService = new PaymentClaimService('chipnet');
      const recurringState = parseRecurringCommitment(currentCommitment);
      const claimTx = await recurringClaimService.buildClaimTransaction({
        paymentId: row.stream_id,
        contractAddress: row.contract_address,
        recipient: row.recipient,
        amountPerInterval: Number(toBigIntParam(constructorParams[3], 'amountPerInterval')),
        intervalSeconds: Number(toBigIntParam(constructorParams[4], 'intervalSeconds')),
        totalPaid: Number(recurringState.totalPaid),
        nextPaymentTime: recurringState.nextPaymentTime,
        currentTime: Math.floor(Date.now() / 1000),
        endTime: row.end_time || undefined,
        tokenType: row.token_type === 'CASHTOKENS' ? 'FUNGIBLE_TOKEN' : 'BCH',
        tokenCategory: row.token_category || undefined,
        constructorParams,
        currentCommitment,
      });
      const claimableAmount = onChainAmountToDisplay(claimTx.claimableAmount, row.token_type);
      return res.json({
        success: true,
        claimInfo: {
          streamId: row.stream_id,
          contractAddress: row.contract_address,
          recipient: row.recipient,
          claimableAmount,
          totalReleased: row.withdrawn_amount,
          wcTransaction: serializeWcTransaction(claimTx.wcTransaction),
        },
      });
    }

    const claimService = new StreamClaimService('chipnet');
    const isTokenStream = isFungibleTokenType(row.token_type);
    const totalAmountOnChain = isTokenStream
      ? Math.max(0, Math.trunc(Number(row.total_amount)))
      : bchToSatoshis(Number(row.total_amount));
    const totalReleasedOnChain = isTokenStream
      ? Math.max(0, Math.trunc(Number(row.withdrawn_amount || 0)))
      : bchToSatoshis(Number(row.withdrawn_amount || 0));
    const computedStepCount = row.interval_seconds && row.end_time
      ? Math.max(1, Math.floor((row.end_time - row.start_time) / row.interval_seconds))
      : 0;
    const stepAmountOnChain = computedStepCount > 0
      ? Math.floor(totalAmountOnChain / computedStepCount)
      : undefined;

    // Build claim parameters
    const claimParams = {
      streamId: row.stream_id,
      contractAddress: row.contract_address,
      recipient: row.recipient,
      totalAmount: totalAmountOnChain,
      totalReleased: totalReleasedOnChain,
      startTime: row.start_time,
      endTime: row.end_time || row.start_time + 86400 * 365,
      currentTime: Math.floor(Date.now() / 1000),
      streamType: row.stream_type as 'LINEAR' | 'STEP',
      stepInterval: row.interval_seconds,
      stepAmount: stepAmountOnChain,
      tokenType: row.token_type === 'CASHTOKENS' ? 'FUNGIBLE_TOKEN' as const : 'BCH' as const,
      tokenCategory: row.token_category,
      constructorParams,
      currentCommitment,
    };

    // Validate claim
    const validation = claimService.validateClaim(claimParams);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Claim validation failed',
        message: validation.error,
      });
    }

    // Build claim transaction parameters
    const claimTx = await claimService.buildClaimTransaction(claimParams);
    const claimableAmount = onChainAmountToDisplay(claimTx.claimableAmount, row.token_type);

    res.json({
      success: true,
      claimInfo: {
        streamId: row.stream_id,
        contractAddress: row.contract_address,
        recipient: row.recipient,
        claimableAmount,
        totalReleased: row.withdrawn_amount,
        wcTransaction: serializeWcTransaction(claimTx.wcTransaction),
      },
    });
  } catch (error: any) {
    console.error(`GET /streams/${req.params.id}/claim-info error:`, error);
    res.status(500).json({ error: 'Failed to get claim info', message: error.message });
  }
});

/**
 * POST /api/streams/:id/cancel
 * Cancel a stream (sender only)
 */
router.post('/streams/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const signerAddress = ((req.headers['x-user-address'] as string) || req.body?.sender || '').trim();
    const allowUnsafeRecovery = req.body?.allowUnsafeRecovery === true;
    if (!signerAddress) {
      return res.status(400).json({ error: 'x-user-address header is required' });
    }

    const row = db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    if (!row) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    const stream = rowToStream(row);

    if (!streamService.canCancel(stream, signerAddress)) {
      return res.status(403).json({
        error: 'Cannot cancel stream',
        reason: !stream.cancelable
          ? 'Stream is not cancelable'
          : stream.sender.toLowerCase() !== signerAddress.toLowerCase()
          ? 'Only sender can cancel'
          : 'Stream is not active',
      });
    }

    const constructorParams = deserializeConstructorParams(row.constructor_params || '[]');
    const contractService = new ContractService('chipnet');
    const currentCommitment = await contractService.getNFTCommitment(row.contract_address)
      || row.nft_commitment
      || '00'.repeat(40);

    const cancelService = new StreamCancelService('chipnet');
    const cancelTx = await cancelService.buildCancelTransaction({
      streamType: row.stream_type as 'LINEAR' | 'STEP' | 'RECURRING',
      contractAddress: row.contract_address,
      sender: signerAddress,
      recipient: row.recipient,
      currentTime: Math.floor(Date.now() / 1000),
      tokenType: row.token_type === 'CASHTOKENS' ? 'FUNGIBLE_TOKEN' : 'BCH',
      tokenCategory: row.token_category || undefined,
      constructorParams,
      currentCommitment,
    });

    // Safety guard: cancel return must resolve back to the sender wallet address.
    if (!allowUnsafeRecovery && cancelTx.cancelReturnAddress.toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(409).json({
        error: 'Unsafe cancel destination',
        message:
          'The stream sender hash resolves to a different return address than the signing wallet. ' +
          'Cancel is blocked to avoid stranded funds.',
        senderAddress: signerAddress,
        cancelReturnAddress: cancelTx.cancelReturnAddress,
      });
    }

    res.json({
      success: true,
      message: 'Cancel transaction ready',
      vestedAmount: cancelTx.vestedAmount,
      unvestedAmount: cancelTx.unvestedAmount,
      cancelReturnAddress: cancelTx.cancelReturnAddress,
      senderAddress: signerAddress,
      wcTransaction: serializeWcTransaction(cancelTx.wcTransaction),
    });
  } catch (error: any) {
    console.error(`POST /streams/${req.params.id}/cancel error:`, error);
    res.status(500).json({ error: 'Failed to cancel stream', message: error.message });
  }
});

/**
 * POST /api/streams/:id/confirm-cancel
 * Confirm stream cancellation after on-chain tx broadcast
 */
router.post('/streams/:id/confirm-cancel', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { txHash } = req.body;
    const signerAddress = ((req.headers['x-user-address'] as string) || req.body?.sender || '').trim();
    if (!signerAddress) {
      return res.status(400).json({ error: 'x-user-address header is required' });
    }
    if (!txHash) {
      return res.status(400).json({ error: 'Transaction hash is required' });
    }
    if (!(await transactionExists(txHash, 'chipnet'))) {
      return res.status(400).json({ error: 'Transaction hash not found on chipnet' });
    }

    const row = db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    if (!row) {
      return res.status(404).json({ error: 'Stream not found' });
    }
    if (!['ACTIVE', 'PAUSED'].includes(String(row.status))) {
      return res.status(400).json({ error: `Cannot confirm cancel for stream status ${row.status}` });
    }
    if (String(row.sender).toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Only the stream sender can confirm cancellation' });
    }

    // A valid cancel spend must consume the covenant state UTXO without recreating it.
    const hasStateOutput = await transactionHasExpectedOutput(
      txHash,
      {
        address: row.contract_address,
        minimumSatoshis: 546n,
        requireNft: true,
      },
      'chipnet',
    );
    if (hasStateOutput) {
      return res.status(400).json({
        error: 'Cancel transaction still includes a stream covenant state output',
      });
    }

    const now = Math.floor(Date.now() / 1000);
    db!.prepare(`
      UPDATE streams
      SET status = 'CANCELLED', tx_hash = ?, updated_at = ?
      WHERE id = ?
    `).run(txHash, now, id);

    const updatedRow = db!.prepare('SELECT * FROM streams WHERE id = ?').get(id) as any;
    const stream = streamService.enrichStream(rowToStream(updatedRow));

    return res.json({
      success: true,
      message: 'Stream cancellation confirmed',
      txHash,
      stream,
    });
  } catch (error: any) {
    console.error(`POST /streams/${req.params.id}/confirm-cancel error:`, error);
    return res.status(500).json({ error: 'Failed to confirm stream cancel', message: error.message });
  }
});

/**
 * POST /api/treasuries/:vaultId/batch-create
 * Batch create multiple streams from a treasury
 */
router.post('/treasuries/:vaultId/batch-create', async (req: Request, res: Response) => {
  try {
    const { vaultId } = req.params;
    const { recipients } = req.body;

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'Recipients array is required' });
    }

    const errors: string[] = [];
    recipients.forEach((r, idx) => {
      if (!r.address) errors.push(`Recipient ${idx + 1}: Missing address`);
      if (!r.amount || r.amount <= 0) errors.push(`Recipient ${idx + 1}: Invalid amount`);
      if (!r.duration || r.duration <= 0) errors.push(`Recipient ${idx + 1}: Invalid duration`);
    });

    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', errors });
    }

    const totalAmount = recipients.reduce((sum: number, r: any) => sum + r.amount, 0);
    const now = Math.floor(Date.now() / 1000);

    const countRow = db!.prepare('SELECT COUNT(*) as cnt FROM streams').get() as any;
    let sequence = (countRow?.cnt ?? 0) + 1;

    const insertStmt = db!.prepare(`
      INSERT INTO streams (id, stream_id, vault_id, sender, recipient, token_type, token_category,
        total_amount, withdrawn_amount, stream_type, start_time, end_time, cliff_timestamp,
        cancelable, transferable, status, created_at, updated_at, constructor_params)
      VALUES (?, ?, ?, ?, ?, 'BCH', NULL, ?, 0, ?, ?, ?, NULL, ?, ?, 'ACTIVE', ?, ?, ?)
    `);

    const createdStreams = db!.transaction(() => {
      return recipients.map((r: any) => {
        const id = randomUUID();
        const streamId = streamService.generateStreamId('BCH', sequence++);

        // Constructor params for each stream
        const constructorParams = [
          r.address, // recipient
          'vault_address', // sender
          { type: 'bigint', value: Math.floor(r.amount * 100000000).toString() },
          { type: 'bigint', value: now.toString() },
          { type: 'bigint', value: (now + r.duration).toString() },
          r.type || 'LINEAR',
          r.cancelable !== false,
        ];

        insertStmt.run(
          id, streamId, vaultId, 'vault_address', r.address,
          r.amount, r.type || 'LINEAR', now, now + r.duration,
          r.cancelable !== false ? 1 : 0, r.transferable === true ? 1 : 0,
          now, now, JSON.stringify(constructorParams)
        );
        return { id, stream_id: streamId, recipient: r.address, amount: r.amount };
      });
    })();

    res.json({
      success: true,
      message: `Created ${createdStreams.length} streams`,
      streams: createdStreams,
      totalAmount,
    });
  } catch (error: any) {
    console.error(`POST /treasuries/${req.params.vaultId}/batch-create error:`, error);
    res.status(500).json({ error: 'Failed to create streams', message: error.message });
  }
});

/**
 * GET /api/explorer/streams
 * Public stream explorer
 */
router.get('/explorer/streams', async (req: Request, res: Response) => {
  try {
    const { token, status } = req.query;

    let query = 'SELECT * FROM streams WHERE 1=1';
    const params: any[] = [];

    if (token) {
      query += ' AND token_type = ?';
      params.push(token);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT 100';
    const rows = db!.prepare(query).all(...params) as any[];
    const streams = streamService.enrichStreams(rows.map(rowToStream));

    res.json({
      success: true,
      streams,
      total: streams.length,
    });
  } catch (error: any) {
    console.error('GET /explorer/streams error:', error);
    res.status(500).json({ error: 'Failed to fetch explorer streams', message: error.message });
  }
});

function rowToStream(row: any): Stream {
  return {
    id: row.id,
    stream_id: row.stream_id,
    vault_id: row.vault_id,
    sender: row.sender,
    recipient: row.recipient,
    token_type: row.token_type,
    token_category: row.token_category || undefined,
    total_amount: row.total_amount,
    withdrawn_amount: row.withdrawn_amount,
    stream_type: row.stream_type,
    start_time: row.start_time,
    end_time: row.end_time || undefined,
    interval_seconds: row.interval_seconds || undefined,
    cliff_timestamp: row.cliff_timestamp || undefined,
    cancelable: Boolean(row.cancelable),
    transferable: Boolean(row.transferable),
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function deserializeConstructorParams(rawParams: string): any[] {
  const parsed = JSON.parse(rawParams || '[]');
  return parsed.map((p: any) => {
    if (p?.type === 'bytes') return Buffer.from(p.value, 'hex');
    if (p?.type === 'bigint') return BigInt(p.value);
    return p?.value ?? p;
  });
}

function parseRecurringCommitment(commitmentHex: string): { totalPaid: bigint; nextPaymentTime: number } {
  const bytes = hexToBin(commitmentHex || '');
  if (bytes.length < 23) {
    throw new Error(`Invalid recurring stream commitment length: expected >=23, got ${bytes.length}`);
  }
  const totalPaid = new DataView(bytes.buffer, bytes.byteOffset + 2, 8).getBigUint64(0, true);
  const nextPaymentTime =
    bytes[18]
    + (bytes[19] << 8)
    + (bytes[20] << 16)
    + (bytes[21] << 24)
    + (bytes[22] * 0x100000000);
  return { totalPaid, nextPaymentTime };
}

function toBigIntParam(value: unknown, name: string): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  if (typeof value === 'string' && value.length > 0) return BigInt(value);
  throw new Error(`Invalid ${name} in constructor parameters`);
}

function isP2pkhAddress(address: string): boolean {
  const decoded = cashAddressToLockingBytecode(address);
  if (typeof decoded === 'string') return false;
  const b = decoded.bytecode;
  return (
    b.length === 25 &&
    b[0] === 0x76 &&
    b[1] === 0xa9 &&
    b[2] === 0x14 &&
    b[23] === 0x88 &&
    b[24] === 0xac
  );
}

function deriveStandaloneVaultId(seed: string): string {
  return createHash('sha256').update(seed).digest('hex');
}

export default router;
