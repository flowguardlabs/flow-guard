import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { fetchVault, fetchProposals, approveProposal } from '../utils/api';
import { approveProposalOnChain, executePayoutOnChain, unlockCycleOnChain } from '../utils/blockchain';
import { AddSignerModal } from '../components/vaults/AddSignerModal';
import { useWallet } from '../hooks/useWallet';
import { CheckCircle, DollarSign, Unlock, ExternalLink } from 'lucide-react';

export default function VaultDetailPage() {
  const { id } = useParams<{ id: string }>();
  const wallet = useWallet();
  const [vault, setVault] = useState<any>(null);
  const [proposals, setProposals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProposals, setLoadingProposals] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddSignerModal, setShowAddSignerModal] = useState(false);
  const [approvingProposalId, setApprovingProposalId] = useState<string | null>(null);
  const [executingProposalId, setExecutingProposalId] = useState<string | null>(null);
  const [unlockingCycle, setUnlockingCycle] = useState<number | null>(null);
  const [eligibleCycles, setEligibleCycles] = useState<number[]>([]);
  const [currentCycle, setCurrentCycle] = useState<number>(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  const loadTransactions = async () => {
    if (!id || !vault?.contractAddress) return;
    try {
      setLoadingTransactions(true);
      const API_BASE_URL = import.meta.env.VITE_API_URL ||
        (import.meta.env.PROD ? 'https://flow-guard.fly.dev/api' : '/api');
      const response = await fetch(`${API_BASE_URL}/vaults/${id}/transactions`);
      if (response.ok) {
        const data = await response.json();
        setTransactions(data.transactions || []);
      }
    } catch (err) {
      console.error('Failed to load transactions:', err);
    } finally {
      setLoadingTransactions(false);
    }
  };

  useEffect(() => {
    const loadVault = async () => {
      if (!id) return;
      try {
        setLoading(true);
        const vaultData = await fetchVault(id, wallet.address || undefined);
        setVault(vaultData);
        setError(null);
      } catch (err: any) {
        setError(err.message || 'Failed to load vault');
      } finally {
        setLoading(false);
      }
    };

    loadVault();
  }, [id, wallet.address]);

  useEffect(() => {
    const loadProposals = async () => {
      if (!id) return;
      try {
        setLoadingProposals(true);
        const proposalsData = await fetchProposals(id);
        setProposals(proposalsData);
      } catch (err: any) {
        console.error('Failed to load proposals:', err);
      } finally {
        setLoadingProposals(false);
      }
    };

    loadProposals();
  }, [id]);

  useEffect(() => {
    const loadEligibleCycles = async () => {
      if (!id || !vault?.contractAddress) return;
      try {
        const API_BASE_URL = import.meta.env.VITE_API_URL ||
          (import.meta.env.PROD ? 'https://flow-guard.fly.dev/api' : '/api');
        const response = await fetch(`${API_BASE_URL}/vaults/${id}/cycles/eligible`);
        if (response.ok) {
          const data = await response.json();
          setEligibleCycles(data.eligibleCycles || []);
          setCurrentCycle(data.currentCycle || 0);
        }
      } catch (err) {
        console.error('Failed to load eligible cycles:', err);
      }
    };

    loadEligibleCycles();
  }, [id, vault?.contractAddress]);

  useEffect(() => {
    loadTransactions();
  }, [id, vault?.contractAddress]);

  // Reload transactions after successful operations
  useEffect(() => {
    if (id && (approvingProposalId === null && executingProposalId === null && unlockingCycle === null)) {
      loadTransactions();
    }
  }, [id, approvingProposalId, executingProposalId, unlockingCycle]);

  const role = vault?.role || 'viewer';
  const isCreator = role === 'creator';
  const isSigner = role === 'signer' || isCreator;
  const canInteract = isSigner; // Can create proposals and approve

  const handleApproveProposal = async (proposalId: string) => {
    if (!wallet.address) {
      alert('WARNING: Please connect your wallet to approve proposals');
      return;
    }

    try {
      setApprovingProposalId(proposalId);

      // Try on-chain approval if vault has contract address and wallet is connected
      if (vault?.contractAddress && wallet.isConnected && wallet.publicKey) {
        try {
          console.log('Attempting on-chain approval...');
          const txid = await approveProposalOnChain(
            wallet,
            proposalId,
            wallet.publicKey,
            {
              vaultId: id,
              proposalId,
            }
          );
          console.log('On-chain approval successful, txid:', txid);
          alert(`SUCCESS: Approval Successful!\n\nYour signature has been broadcast to the BCH blockchain.\n\nTransaction ID: ${txid}\n\nView on explorer: https://chipnet.chaingraph.cash/tx/${txid}`);
        } catch (onChainError: any) {
          console.warn('On-chain approval failed, falling back to database:', onChainError);
          // Fallback to database approval
          await approveProposal(proposalId, wallet.address);
          alert('SUCCESS: Approval recorded in database.\n\nNOTE: On-chain transaction failed. Approval saved locally.');
        }
      } else {
        // No contract address or wallet not fully connected - use database approval
        await approveProposal(proposalId, wallet.address);
        alert(
          'SUCCESS: Approval recorded in FlowGuard database only.\n\n' +
          'No blockchain transaction was created for this approval. ' +
          'Use on-chain approvals when you are ready to exercise full covenant security.'
        );
      }

      // Reload proposals
      if (id) {
        const proposalsData = await fetchProposals(id);
        setProposals(proposalsData);
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to approve proposal';
      // Provide more specific error messages for common covenant validation failures
      let userFriendlyMsg = errorMsg;
      if (errorMsg.includes('not pending') || errorMsg.includes('state')) {
        userFriendlyMsg = 'Proposal state validation failed. The proposal may have already been approved or executed on-chain.';
      } else if (errorMsg.includes('Signer not authorized') || errorMsg.includes('not authorized')) {
        userFriendlyMsg = 'You are not authorized to approve this proposal. Only designated signers can approve proposals.';
      } else if (errorMsg.includes('network') || errorMsg.includes('connection')) {
        userFriendlyMsg = 'Network connection error. Please check your internet connection and try again.';
      }
      alert(`ERROR: Approval Failed\n\n${userFriendlyMsg}\n\nPlease try again or contact support if the issue persists.`);
    } finally {
      setApprovingProposalId(null);
    }
  };

  const handleExecutePayout = async (proposalId: string) => {
    if (!wallet.address) {
      alert('WARNING: Please connect your wallet to execute payouts');
      return;
    }

    if (!vault?.contractAddress) {
      alert('ERROR: Cannot execute payout\n\nThis vault does not have an on-chain contract address.');
      return;
    }

    if (!wallet.isConnected || !wallet.publicKey) {
      alert('WARNING: Wallet not fully connected\n\nPlease reconnect your wallet and try again.');
      return;
    }

    // Confirm with user before executing
    const confirmed = confirm(
      'EXECUTE PAYOUT?\n\n' +
      'This will broadcast a multi-signature transaction to the BCH blockchain.\n\n' +
      `• ${vault.approvalThreshold} signers must sign this transaction\n` +
      '• Funds will be sent from the contract to the recipient\n' +
      '• This action cannot be undone\n\n' +
      'Do you want to continue?'
    );

    if (!confirmed) {
      return;
    }

    try {
      setExecutingProposalId(proposalId);
      console.log('Attempting on-chain payout execution...');

      const proposal = proposals.find(p => p.id === proposalId);
      const txid = await executePayoutOnChain(wallet, proposalId, {
        vaultId: id,
        proposalId,
        amount: proposal?.amount,
        toAddress: proposal?.recipient,
      });

      console.log('On-chain payout execution successful, txid:', txid);
      alert(
        `SUCCESS: Payout Executed Successfully!\n\n` +
        `Funds have been sent from the vault contract to the recipient.\n\n` +
        `Transaction ID: ${txid}\n\n` +
        `View on explorer: https://chipnet.chaingraph.cash/tx/${txid}`
      );

      // Reload proposals to show updated status
      if (id) {
        const proposalsData = await fetchProposals(id);
        setProposals(proposalsData);
      }

      // Reload vault to show updated balance
      if (id) {
        const vaultData = await fetchVault(id, wallet.address || undefined);
        setVault(vaultData);
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to execute payout';
      console.error('Payout execution failed:', err);
      // Provide more specific error messages for covenant validation failures
      let userFriendlyMsg = errorMsg;
      if (errorMsg.includes('not approved') || errorMsg.includes('state')) {
        userFriendlyMsg = 'Proposal state validation failed. The proposal must be approved on-chain before execution.';
      } else if (errorMsg.includes('threshold') || errorMsg.includes('signatures')) {
        userFriendlyMsg = `Insufficient signatures. This payout requires ${vault.approvalThreshold} signer approvals.`;
      } else if (errorMsg.includes('spending cap') || errorMsg.includes('exceeds')) {
        userFriendlyMsg = 'Amount exceeds the vault spending cap. Please adjust the proposal amount.';
      } else if (errorMsg.includes('network') || errorMsg.includes('connection')) {
        userFriendlyMsg = 'Network connection error. Please check your internet connection and try again.';
      }
      alert(
        `ERROR: Payout Execution Failed\n\n` +
        `${userFriendlyMsg}\n\n` +
        `Possible reasons:\n` +
        `• Insufficient approvals (requires ${vault.approvalThreshold} signers)\n` +
        `• Proposal not approved on-chain\n` +
        `• Wallet signature rejected\n` +
        `• Network error\n\n` +
        `Please check the proposal status and try again.`
      );
    } finally {
      setExecutingProposalId(null);
    }
  };

  const handleUnlockCycle = async (cycleNumber: number) => {
    if (!wallet.address) {
      alert('WARNING: Please connect your wallet to unlock cycles');
      return;
    }

    if (!vault?.contractAddress) {
      alert('ERROR: Cannot unlock cycle\n\nThis vault does not have an on-chain contract address.');
      return;
    }

    if (!wallet.isConnected || !wallet.publicKey) {
      alert('WARNING: Wallet not fully connected\n\nPlease reconnect your wallet and try again.');
      return;
    }

    if (!id) {
      alert('ERROR: Invalid vault ID');
      return;
    }

    // Confirm with user before unlocking
    const confirmed = confirm(
      'UNLOCK CYCLE?\n\n' +
      'This will broadcast a multi-signature transaction to the BCH blockchain.\n\n' +
      `• Cycle #${cycleNumber} will be unlocked\n` +
      `• ${vault.unlockAmount || 0} BCH will become available\n` +
      `• ${vault.approvalThreshold} signers must sign this transaction\n` +
      '• This action cannot be undone\n\n' +
      'Do you want to continue?'
    );

    if (!confirmed) {
      return;
    }

    try {
      setUnlockingCycle(cycleNumber);
      console.log('Attempting on-chain cycle unlock...');

      const txid = await unlockCycleOnChain(wallet, id, cycleNumber, wallet.publicKey, {
        vaultId: id,
        amount: vault?.unlockAmount,
      });

      console.log('On-chain cycle unlock successful, txid:', txid);
      alert(
        `SUCCESS: Cycle Unlocked Successfully!\n\n` +
        `Cycle #${cycleNumber} has been unlocked on the blockchain.\n` +
        `${vault.unlockAmount || 0} BCH is now available for spending.\n\n` +
        `Transaction ID: ${txid}\n\n` +
        `View on explorer: https://chipnet.chaingraph.cash/tx/${txid}`
      );

      // Reload vault to show updated balance and cycles
      if (id) {
        const vaultData = await fetchVault(id, wallet.address || undefined);
        setVault(vaultData);

        // Reload eligible cycles
        const API_BASE_URL = import.meta.env.VITE_API_URL ||
          (import.meta.env.PROD ? 'https://flow-guard.fly.dev/api' : '/api');
        const response = await fetch(`${API_BASE_URL}/vaults/${id}/cycles/eligible`);
        if (response.ok) {
          const data = await response.json();
          setEligibleCycles(data.eligibleCycles || []);
          setCurrentCycle(data.currentCycle || 0);
        }
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to unlock cycle';
      console.error('Cycle unlock failed:', err);
      // Provide more specific error messages for covenant validation failures
      let userFriendlyMsg = errorMsg;
      if (errorMsg.includes('cannot be unlocked') || errorMsg.includes('not eligible')) {
        userFriendlyMsg = `Cycle #${cycleNumber} is not yet eligible for unlock. Cycles unlock based on the vault's cycle duration.`;
      } else if (errorMsg.includes('state') || errorMsg.includes('already unlocked')) {
        userFriendlyMsg = 'Cycle state validation failed. This cycle may have already been unlocked on-chain.';
      } else if (errorMsg.includes('Signer not authorized') || errorMsg.includes('not authorized')) {
        userFriendlyMsg = 'You are not authorized to unlock cycles. Only designated signers can unlock cycles.';
      } else if (errorMsg.includes('network') || errorMsg.includes('connection')) {
        userFriendlyMsg = 'Network connection error. Please check your internet connection and try again.';
      }
      alert(
        `ERROR: Cycle Unlock Failed\n\n` +
        `${userFriendlyMsg}\n\n` +
        `Possible reasons:\n` +
        `• Cycle not yet eligible for unlock (check cycle duration)\n` +
        `• Cycle already unlocked on-chain\n` +
        `• Insufficient signer approvals\n` +
        `• Wallet signature rejected\n` +
        `• Network error\n\n` +
        `Please check the cycle status and try again.`
      );
    } finally {
      setUnlockingCycle(null);
    }
  };

  if (loading) {
    return (
      <div className="section-spacious">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-16">Loading vault...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="section-spacious">
        <div className="max-w-7xl mx-auto">
          <Card padding="lg" className="text-center py-16 border-2 border-red-200 bg-red-50">
            <h2 className="text-2xl font-semibold mb-4 text-red-800">Error loading vault</h2>
            <p className="text-red-600 mb-4">{error}</p>
            <Link to="/vaults">
              <Button>Back to Vaults</Button>
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  if (!vault) {
    return (
      <div className="section-spacious">
        <div className="max-w-7xl mx-auto">
          <Card padding="lg" className="text-center py-16">
            <h2 className="text-2xl font-semibold mb-4">Vault not found</h2>
            <Link to="/vaults">
              <Button>Back to Vaults</Button>
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  // Calculate unlocked/locked amounts (mock for now)
  const unlocked = vault.unlockAmount || 0;
  const locked = (vault.totalDeposit || 0) - unlocked;

  return (
    <div className="section-spacious">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <Link to="/vaults" className="text-green-600 hover:underline">
            ← Back to Vaults
          </Link>
        </div>

        <div className="flex justify-between items-start mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-4xl font-bold section-bold">
                {vault.name || vault.vaultId || `Vault ${vault.id?.slice(0, 8)}`}
              </h1>
              <span
                className={`inline-flex items-center px-3 py-1 text-sm font-semibold rounded-full ${
                  role === 'creator'
                    ? 'bg-blue-100 text-blue-800'
                    : role === 'signer'
                    ? 'bg-purple-100 text-purple-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {role === 'creator' ? 'Creator' : role === 'signer' ? 'Signer' : 'Viewer'}
              </span>
              {vault.isPublic && (
                <span className="inline-flex items-center px-3 py-1 bg-yellow-100 text-yellow-800 text-sm font-semibold rounded-full">
                  Public
                </span>
              )}
            </div>
            {vault.description && <p className="text-gray-600">{vault.description}</p>}
          </div>
          <div className="flex gap-3">
            {isCreator && (
              <Button variant="outline" size="lg" onClick={() => setShowAddSignerModal(true)}>
                + Add Signer
              </Button>
            )}
            {canInteract && (
              <Link to={`/vaults/${id}/proposals/create`}>
                <Button size="lg">Create Proposal</Button>
              </Link>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <Card padding="lg">
            <h3 className="text-sm text-gray-600 mb-2">Total Deposit</h3>
            <p className="text-3xl font-bold">{vault.totalDeposit || 0} BCH</p>
          </Card>
          <Card padding="lg">
            <h3 className="text-sm text-gray-600 mb-2">On-Chain Balance</h3>
            <p className="text-3xl font-bold text-blue-600">
              {vault.balance !== undefined ? (vault.balance / 100000000).toFixed(8) : '0.00000000'} BCH
            </p>
            <p className="text-xs text-gray-500 mt-1">Live from blockchain</p>
          </Card>
          <Card padding="lg">
            <h3 className="text-sm text-gray-600 mb-2">Locked</h3>
            <p className="text-3xl font-bold">{locked.toFixed(2)} BCH</p>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Card padding="lg">
            <h2 className="text-xl font-semibold mb-4">Vault Details</h2>
            <div className="space-y-3">
              {vault.contractAddress && (
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="text-xs text-blue-800 dark:text-blue-200 mb-1 font-semibold">Contract Address (BCH Chipnet)</div>
                  <a
                    href={`https://chipnet.chaingraph.cash/address/${vault.contractAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-blue-600 dark:text-blue-400 hover:underline break-all"
                  >
                    {vault.contractAddress}
                  </a>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">Spending Cap:</span>
                <span className="font-semibold">{vault.spendingCap || 'No cap'} BCH</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Approval Threshold:</span>
                <span className="font-semibold">
                  {vault.approvalThreshold}-of-{vault.signers?.length || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Cycle Duration:</span>
                <span className="font-semibold">
                  {vault.cycleDuration === 604800
                    ? 'Weekly'
                    : vault.cycleDuration === 2592000
                    ? 'Monthly'
                    : vault.cycleDuration === 7776000
                    ? 'Quarterly'
                    : `${vault.cycleDuration}s`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Unlock Amount:</span>
                <span className="font-semibold">{vault.unlockAmount || 0} BCH</span>
              </div>
            </div>
          </Card>

          <Card padding="lg">
            <h2 className="text-xl font-semibold mb-4">Signers</h2>
            <div className="space-y-2">
              {vault.signers && vault.signers.length > 0 ? (
                vault.signers.map((signer: string, index: number) => (
                  <div key={index} className="flex items-center justify-between">
                    <span className="font-mono text-sm">{signer}</span>
                    {signer.toLowerCase() === vault.creator?.toLowerCase() ? (
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded font-semibold">
                        Creator
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                        Signer {index + 1}
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-gray-600 text-sm">No signers</p>
              )}
            </div>
          </Card>
        </div>

        {canInteract ? (
          <Card padding="lg" className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Active Proposals</h2>
            {loadingProposals ? (
              <p className="text-gray-600">Loading proposals...</p>
            ) : proposals.length === 0 ? (
              <p className="text-gray-600">No active proposals</p>
            ) : (
              <div className="space-y-4">
                {proposals.map((proposal) => (
                  <div
                    key={proposal.id}
                    className="p-4 border border-gray-200 rounded-lg hover:border-green-500 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-semibold">{proposal.amount} BCH</h3>
                        <p className="text-sm text-gray-600">{proposal.reason}</p>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          proposal.status === 'approved'
                            ? 'bg-green-100 text-green-800'
                            : proposal.status === 'executed'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {proposal.status}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-4">
                      <div className="text-sm text-gray-600">
                        To: <span className="font-mono">{proposal.recipient}</span>
                      </div>
                      <div className="text-sm">
                        <span className="text-gray-600">Approvals: </span>
                        <span className="font-semibold">
                          {proposal.approvalCount || 0}/{vault.approvalThreshold || 0}
                        </span>
                      </div>
                    </div>
                    {proposal.status === 'pending' && (
                      <div className="mt-4 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleApproveProposal(proposal.id)}
                          disabled={approvingProposalId === proposal.id}
                        >
                          {approvingProposalId === proposal.id ? 'Approving...' : 'Approve Proposal'}
                        </Button>
                      </div>
                    )}
                    {proposal.status === 'approved' && vault?.contractAddress && (
                      <div className="mt-4 flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleExecutePayout(proposal.id)}
                          disabled={executingProposalId === proposal.id}
                        >
                          <DollarSign className="w-4 h-4 mr-1" />
                          {executingProposalId === proposal.id ? 'Executing...' : 'Execute Payout'}
                        </Button>
                        <div className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Ready to execute - {vault.approvalThreshold} approvals met
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        ) : (
          <Card padding="lg" className="bg-gray-50 mb-8">
            <h2 className="text-xl font-semibold mb-4">Active Proposals</h2>
            <p className="text-gray-600">
              You don't have permission to view proposals. Only signers can view and interact with proposals.
            </p>
          </Card>
        )}

        {vault?.contractAddress && canInteract && (
          <Card padding="lg" className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Unlock Cycles</h2>
            {eligibleCycles.length === 0 ? (
              <div className="text-gray-600">
                <p className="mb-2">No cycles eligible for unlock at this time.</p>
                <p className="text-sm">
                  Current Cycle: <span className="font-semibold">#{currentCycle}</span>
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  Cycles become eligible based on the vault's cycle duration setting.
                </p>
              </div>
            ) : (
              <div>
                <div className="mb-4 text-sm text-gray-600">
                  <p>
                    Current Cycle: <span className="font-semibold">#{currentCycle}</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Unlocking a cycle releases {vault.unlockAmount || 0} BCH for spending
                  </p>
                </div>
                <div className="space-y-3">
                  {eligibleCycles.map((cycleNum) => (
                    <div
                      key={cycleNum}
                      className="p-4 border border-gray-200 rounded-lg hover:border-green-500 transition-colors"
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <h3 className="font-semibold text-lg">Cycle #{cycleNum}</h3>
                          <p className="text-sm text-gray-600">
                            Unlock Amount: <span className="font-semibold">{vault.unlockAmount || 0} BCH</span>
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleUnlockCycle(cycleNum)}
                          disabled={unlockingCycle === cycleNum}
                        >
                          <Unlock className="w-4 h-4 mr-1" />
                          {unlockingCycle === cycleNum ? 'Unlocking...' : 'Unlock Cycle'}
                        </Button>
                      </div>
                      <div className="mt-2 text-xs text-green-600 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        Ready to unlock - requires {vault.approvalThreshold} signer approvals
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}

        {vault?.contractAddress && (
          <Card padding="lg">
            <h2 className="text-xl font-semibold mb-4">Transaction History</h2>
            {loadingTransactions ? (
              <p className="text-gray-600">Loading transactions...</p>
            ) : transactions.length === 0 ? (
              <div className="text-gray-600">
                <p className="mb-2">No on-chain transactions found for this vault.</p>
                <p className="text-sm text-gray-500">
                  Transactions will appear here once proposals are approved and executed on-chain.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {transactions.map((tx: any) => (
                  <div
                    key={tx.id}
                    className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-600 transition-colors bg-white dark:bg-[#1a1a1a]"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`px-2 py-1 rounded text-xs font-semibold ${
                              tx.txType === 'proposal'
                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200'
                                : tx.txType === 'approve'
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                                : tx.txType === 'payout'
                                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200'
                                : tx.txType === 'unlock'
                                ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
                            }`}
                          >
                            {tx.txType?.toUpperCase() || 'TRANSACTION'}
                          </span>
                          <span
                            className={`px-2 py-1 rounded text-xs font-semibold ${
                              tx.status === 'confirmed'
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                                : tx.status === 'pending'
                                ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200'
                                : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'
                            }`}
                          >
                            {tx.status?.toUpperCase() || 'PENDING'}
                          </span>
                          {tx.amount && (
                            <span className="font-semibold text-gray-900 dark:text-white">
                              {tx.amount} BCH
                            </span>
                          )}
                        </div>
                        {tx.toAddress && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            To: <span className="font-mono">{tx.toAddress.slice(0, 20)}...</span>
                          </p>
                        )}
                      </div>
                      <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                        {tx.createdAt && new Date(tx.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="text-xs">
                        <span className="text-gray-600 dark:text-gray-400">TX Hash: </span>
                        <a
                          href={`https://chipnet.chaingraph.cash/tx/${tx.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-blue-600 dark:text-blue-400 hover:underline break-all"
                        >
                          {tx.txHash?.slice(0, 16)}...{tx.txHash?.slice(-16)}
                        </a>
                      </div>
                      <a
                        href={`https://chipnet.chaingraph.cash/tx/${tx.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                      >
                        View on Explorer
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Add Signer Modal */}
        {showAddSignerModal && id && (
          <AddSignerModal
            vaultId={id}
            onClose={() => setShowAddSignerModal(false)}
            onSuccess={() => {
              setShowAddSignerModal(false);
              // Reload vault data
              fetchVault(id, wallet.address || undefined).then(setVault).catch(console.error);
            }}
          />
        )}
      </div>
    </div>
  );
}
