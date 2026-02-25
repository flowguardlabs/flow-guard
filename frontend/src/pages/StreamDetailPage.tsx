import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
  Calendar,
  TrendingUp,
  Download,
  XCircle,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import { useWallet } from '../hooks/useWallet';
import { useNetwork } from '../hooks/useNetwork';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { CircularProgress } from '../components/streams/CircularProgress';
import {
  deserializeWcSignOptions,
  fundStreamContract,
  getExplorerTxUrl,
  type SerializedWcTransaction,
} from '../utils/blockchain';

interface Stream {
  id: string;
  stream_id: string;
  vault_id: string;
  sender: string;
  recipient: string;
  token_type: 'BCH' | 'CASHTOKENS';
  token_category?: string;
  total_amount: number;
  withdrawn_amount: number;
  vested_amount: number;
  claimable_amount: number;
  progress_percentage: number;
  stream_type: 'LINEAR' | 'RECURRING' | 'STEP';
  start_time: number;
  end_time?: number;
  interval_seconds?: number;
  cliff_timestamp?: number;
  cancelable: boolean;
  transferable: boolean;
  status: 'PENDING' | 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'COMPLETED';
  created_at: number;
}

interface Claim {
  id: string;
  amount: number;
  claimed_at: number;
  tx_hash?: string;
}

/**
 * StreamDetailPage - Single Stream View
 * Like Sablier's stream detail page with circular progress ring
 */
export default function StreamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const wallet = useWallet();
  const network = useNetwork();
  const navigate = useNavigate();
  const [stream, setStream] = useState<Stream | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [funding, setFunding] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Fetch stream details
  useEffect(() => {
    const fetchStream = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/streams/${id}`);
        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: 'Failed to fetch stream' }));
          throw new Error(error.error || 'Failed to fetch stream');
        }
        const data = await response.json();
        setStream(data.stream);
        setClaims(data.claims || []);
      } catch (error) {
        console.error('Failed to fetch stream:', error);
        setLoadError(error instanceof Error ? error.message : 'Failed to load stream');
        setStream(null);
        setClaims([]);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchStream();
    }
  }, [id, wallet.address]);

  const handleClaim = async () => {
    if (!stream || stream.claimable_amount <= 0) return;
    if (!wallet.isConnected) {
      alert('Please connect your wallet first');
      return;
    }

    try {
      setClaiming(true);

      const claimResponse = await fetch(`/api/streams/${stream.id}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientAddress: wallet.address }),
      });

      if (!claimResponse.ok) {
        const errorData = await claimResponse.json();
        throw new Error(errorData.error || 'Failed to create claim transaction');
      }

      const { claimableAmount, wcTransaction } = await claimResponse.json() as {
        success: boolean;
        claimableAmount: number;
        wcTransaction: SerializedWcTransaction;
      };

      const signResult = await wallet.signCashScriptTransaction({
        ...deserializeWcSignOptions(wcTransaction),
        broadcast: wcTransaction.broadcast ?? true,
        userPrompt: `Claim ${claimableAmount.toFixed(4)} BCH from stream ${stream.stream_id}`,
      });

      // Confirm claim with backend to record the txid and update withdrawn amount
      const confirmResponse = await fetch(`/api/streams/${stream.id}/confirm-claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txHash: signResult.signedTransactionHash,
          claimedAmount: claimableAmount,
        }),
      });

      if (!confirmResponse.ok) {
        console.error('Failed to confirm claim, but transaction was broadcast');
      }

      // Refresh stream data
      const streamResponse = await fetch(`/api/streams/${stream.id}`);
      const streamData = await streamResponse.json();
      setStream(streamData.stream);
      setClaims(streamData.claims || []);

      alert(`Successfully claimed ${claimableAmount.toFixed(4)} BCH!\nTx: ${signResult.signedTransactionHash}`);
    } catch (error) {
      console.error('Claim failed:', error);
      alert(`Claim failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setClaiming(false);
    }
  };

  const handleCancel = async () => {
    if (!stream || !stream.cancelable) return;
    if (!wallet.isConnected) {
      alert('Please connect your wallet first');
      return;
    }
    const signerAddress = wallet.address ?? '';

    const confirmed = window.confirm(
      `Are you sure you want to cancel this stream?\n\n` +
      `Recipient will keep all vested funds (${stream.vested_amount.toFixed(4)} BCH).\n` +
      `Remaining funds (${(stream.total_amount - stream.vested_amount).toFixed(4)} BCH) will be returned to the sender.`
    );

    if (!confirmed) return;

    try {
      setCancelling(true);

      // Get transaction descriptor from backend
      const cancelResponse = await fetch(`/api/streams/${stream.id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-address': signerAddress,
        },
        body: JSON.stringify({}),
      });

      if (!cancelResponse.ok) {
        const errorData = await cancelResponse.json();
        throw new Error(errorData.message || errorData.error || 'Failed to create cancel transaction');
      }

      const payload = await cancelResponse.json() as { wcTransaction?: SerializedWcTransaction };
      if (!payload.wcTransaction) {
        throw new Error(
          'Cancel transaction signing is not wired yet for this stream type. ' +
          'Backend must return a WalletConnect-compatible transaction object.',
        );
      }

      const signResult = await wallet.signCashScriptTransaction({
        ...deserializeWcSignOptions(payload.wcTransaction),
        broadcast: payload.wcTransaction.broadcast ?? true,
        userPrompt: payload.wcTransaction.userPrompt ?? `Cancel stream ${stream.stream_id}`,
      });

      const confirmResponse = await fetch(`/api/streams/${stream.id}/confirm-cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-address': signerAddress,
        },
        body: JSON.stringify({
          txHash: signResult.signedTransactionHash,
        }),
      });

      if (!confirmResponse.ok) {
        const errorData = await confirmResponse.json().catch(() => ({ error: 'Failed to confirm cancel' }));
        throw new Error(errorData.message || errorData.error || 'Cancel transaction broadcast but confirmation failed');
      }

      console.log('Cancel transaction signed and broadcast:', signResult.signedTransactionHash);

      alert(`Stream cancelled successfully!\nTx: ${signResult.signedTransactionHash}`);
      navigate('/streams');
    } catch (error) {
      console.error('Cancel failed:', error);
      alert(`Cancel failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setCancelling(false);
    }
  };

  const handleFund = async () => {
    if (!stream || stream.status !== 'PENDING') return;
    if (!wallet.isConnected) {
      alert('Please connect your wallet first');
      return;
    }

    try {
      setFunding(true);

      const txId = await fundStreamContract(wallet, stream.id);
      console.log('Stream funded successfully. TxID:', txId);

      // Refresh stream data
      const streamResponse = await fetch(`/api/streams/${stream.id}`);
      const streamData = await streamResponse.json();
      setStream(streamData.stream);

      alert(`Stream funded successfully!\nTx: ${txId}`);
    } catch (error) {
      console.error('Funding failed:', error);
      alert(`Funding failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setFunding(false);
    }
  };

  const copyToClipboard = async (text: string, type: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedAddress(type);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const formatAddress = (addr: string) => `${addr.slice(0, 10)}...${addr.slice(-8)}`;
  const formatDate = (timestamp: number) =>
    new Date(timestamp * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const formatDuration = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      ACTIVE: 'bg-green-100 text-green-800',
      PAUSED: 'bg-yellow-100 text-yellow-800',
      CANCELLED: 'bg-red-100 text-red-800',
      COMPLETED: 'bg-gray-100 text-gray-800',
    };

    const icons: Record<string, any> = {
      ACTIVE: CheckCircle2,
      PAUSED: Clock,
      CANCELLED: XCircle,
      COMPLETED: CheckCircle2,
    };

    const Icon = icons[status] || AlertCircle;

    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${styles[status]}`}>
        <Icon className="w-4 h-4" />
        {status}
      </span>
    );
  };

  const getExplorerUrl = (txHash: string) => {
    return getExplorerTxUrl(txHash, network);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-textSecondary">Loading stream details...</p>
        </div>
      </div>
    );
  }

  if (loadError || !stream) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <Card padding="lg" className="border-red-200 bg-red-50/50">
          <p className="font-mono text-sm text-red-700">
            {loadError || 'Stream not found'}
          </p>
          <div className="mt-4">
            <Button variant="secondary" onClick={() => navigate('/streams')}>
              Back to Streams
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const isSender = wallet.address?.toLowerCase() === stream.sender.toLowerCase();
  const isRecipient = wallet.address?.toLowerCase() === stream.recipient.toLowerCase();

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          to="/streams"
          className="inline-flex items-center gap-2 text-textSecondary hover:text-primary transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Streams
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-textPrimary mb-1">
              {stream.stream_type} Stream
            </h1>
            <button
              onClick={() => copyToClipboard(stream.stream_id, 'stream_id')}
              className="flex items-center gap-2 group"
              title="Click to copy full ID"
            >
              <p className="text-sm font-mono text-textMuted truncate max-w-[300px] md:max-w-[500px]">
                {stream.stream_id.slice(0, 8)}...{stream.stream_id.slice(-8)}
              </p>
              {copiedAddress === 'stream_id' ? (
                <Check className="w-3 h-3 text-green-600" />
              ) : (
                <Copy className="w-3 h-3 text-textMuted opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </button>
            <p className="text-textSecondary text-sm mt-1">
              Created {formatDate(stream.created_at)}
            </p>
          </div>
          {getStatusBadge(stream.status)}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content - Left 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Progress Ring Card */}
          <Card className="p-8">
            <div className="flex flex-col md:flex-row items-center gap-8">
              {/* Circular Progress */}
              <CircularProgress
                percentage={stream.progress_percentage}
                size={240}
                strokeWidth={16}
                label="Vested"
              />

              {/* Stats */}
              <div className="flex-1 grid grid-cols-2 gap-6 w-full">
                <div>
                  <p className="text-sm text-textMuted mb-1">Total Amount</p>
                  <p className="text-lg md:text-xl lg:text-2xl font-bold text-textPrimary">
                    {stream.total_amount.toFixed(4)} BCH
                  </p>
                </div>
                <div>
                  <p className="text-sm text-textMuted mb-1">Vested</p>
                  <p className="text-lg md:text-xl lg:text-2xl font-bold text-primary">
                    {stream.vested_amount.toFixed(4)} BCH
                  </p>
                </div>
                <div>
                  <p className="text-sm text-textMuted mb-1">Withdrawn</p>
                  <p className="text-lg md:text-xl lg:text-2xl font-bold text-textSecondary">
                    {stream.withdrawn_amount.toFixed(4)} BCH
                  </p>
                </div>
                <div>
                  <p className="text-sm text-textMuted mb-1">Claimable Now</p>
                  <p className="text-lg md:text-xl lg:text-2xl font-bold text-green-600">
                    {stream.claimable_amount.toFixed(4)} BCH
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-8 pt-6 border-t border-border flex gap-4">
              {/* Fund Button (for PENDING streams) */}
              {stream.status === 'PENDING' && isSender && (
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleFund}
                  disabled={funding}
                  className="flex-1"
                >
                  <TrendingUp className="w-5 h-5 mr-2" />
                  {funding ? 'Funding...' : 'Fund Stream'}
                </Button>
              )}

              {/* Claim Button (for ACTIVE streams) */}
              {isRecipient && stream.status === 'ACTIVE' && (
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleClaim}
                  disabled={stream.claimable_amount <= 0 || claiming}
                  className="flex-1"
                >
                  <Download className="w-5 h-5 mr-2" />
                  {claiming ? 'Claiming...' : `Claim ${stream.claimable_amount.toFixed(4)} BCH`}
                </Button>
              )}

              {/* Cancel Button (for sender) */}
              {stream.cancelable && isSender && stream.status === 'ACTIVE' && (
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={cancelling}
                >
                  <XCircle className="w-5 h-5 mr-2" />
                  {cancelling ? 'Cancelling...' : 'Cancel Stream'}
                </Button>
              )}
            </div>
          </Card>

          {/* Timeline Card */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-textPrimary mb-4">Timeline</h3>

            <div className="space-y-4">
              {/* Start */}
              <div className="flex items-start gap-4">
                <div className="mt-1 p-2 bg-green-100 rounded-full">
                  <Calendar className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-textPrimary">Stream Started</p>
                  <p className="text-sm text-textMuted">{formatDate(stream.start_time)}</p>
                </div>
              </div>

              {/* Cliff */}
              {stream.cliff_timestamp && (
                <div className="flex items-start gap-4">
                  <div className="mt-1 p-2 bg-purple-100 rounded-full">
                    <Clock className="w-4 h-4 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-medium text-textPrimary">Cliff Period Ended</p>
                    <p className="text-sm text-textMuted">{formatDate(stream.cliff_timestamp)}</p>
                  </div>
                </div>
              )}

              {/* End */}
              {stream.end_time && (
                <div className="flex items-start gap-4">
                  <div className="mt-1 p-2 bg-blue-100 rounded-full">
                    <CheckCircle2 className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-textPrimary">
                      {Date.now() / 1000 < stream.end_time ? 'Stream Ends' : 'Stream Ended'}
                    </p>
                    <p className="text-sm text-textMuted">{formatDate(stream.end_time)}</p>
                    {stream.start_time && stream.end_time && (
                      <p className="text-xs text-textMuted mt-1">
                        Duration: {formatDuration(stream.end_time - stream.start_time)}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Claim History */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-textPrimary mb-4">Claim History</h3>

            {claims.length === 0 ? (
              <div className="text-center py-8">
                <TrendingUp className="w-12 h-12 text-textMuted mx-auto mb-3" />
                <p className="text-textSecondary">No claims yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {claims.map((claim) => (
                  <div
                    key={claim.id}
                    className="flex items-center justify-between p-4 bg-surfaceAlt rounded-lg"
                  >
                    <div>
                      <p className="font-semibold text-textPrimary">
                        {claim.amount.toFixed(4)} BCH
                      </p>
                      <p className="text-sm text-textMuted">
                        {formatDate(claim.claimed_at)}
                      </p>
                    </div>
                    {claim.tx_hash && (
                      <a
                        href={getExplorerUrl(claim.tx_hash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-primary hover:text-primaryHover"
                      >
                        View TX
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar - Right 1/3 */}
        <div className="space-y-6">
          {/* Attributes */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-textPrimary mb-4">Attributes</h3>

            <div className="space-y-4">
              {/* Sender */}
              <div>
                <p className="text-xs text-textMuted mb-1">Sender</p>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-mono text-textPrimary truncate">
                    {formatAddress(stream.sender)}
                  </p>
                  <button
                    onClick={() => copyToClipboard(stream.sender, 'sender')}
                    className="p-1 hover:bg-surfaceAlt rounded transition-colors"
                  >
                    {copiedAddress === 'sender' ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4 text-textMuted" />
                    )}
                  </button>
                </div>
              </div>

              {/* Recipient */}
              <div>
                <p className="text-xs text-textMuted mb-1">Recipient</p>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-mono text-textPrimary truncate">
                    {formatAddress(stream.recipient)}
                  </p>
                  <button
                    onClick={() => copyToClipboard(stream.recipient, 'recipient')}
                    className="p-1 hover:bg-surfaceAlt rounded transition-colors"
                  >
                    {copiedAddress === 'recipient' ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4 text-textMuted" />
                    )}
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-border" />

              {/* Type */}
              <div className="flex justify-between">
                <p className="text-xs text-textMuted">Stream Type</p>
                <p className="text-sm font-medium text-textPrimary">{stream.stream_type}</p>
              </div>

              {/* Token */}
              <div className="flex justify-between">
                <p className="text-xs text-textMuted">Token</p>
                <p className="text-sm font-medium text-textPrimary">{stream.token_type}</p>
              </div>

              {/* Cancelable */}
              <div className="flex justify-between">
                <p className="text-xs text-textMuted">Cancelable</p>
                <p className="text-sm font-medium text-textPrimary">
                  {stream.cancelable ? 'Yes' : 'No'}
                </p>
              </div>

              {/* Transferable */}
              <div className="flex justify-between">
                <p className="text-xs text-textMuted">Transferable</p>
                <p className="text-sm font-medium text-textPrimary">
                  {stream.transferable ? 'Yes' : 'No'}
                </p>
              </div>

              {/* Divider */}
              <div className="border-t border-border" />

              {/* Vault Link */}
              <div>
                <p className="text-xs text-textMuted mb-2">Treasury</p>
                <Link
                  to={`/vaults/${stream.vault_id}`}
                  className="text-sm text-primary hover:text-primaryHover flex items-center gap-1"
                >
                  View Treasury
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </Card>

          {/* Quick Stats */}
          <Card className="p-6 bg-gradient-to-br from-primary/5 to-white">
            <h3 className="text-sm font-semibold text-textMuted mb-4">Quick Stats</h3>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-textMuted">Progress</span>
                <span className="text-sm font-bold text-primary">
                  {stream.progress_percentage.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-textMuted">Unclaimed</span>
                <span className="text-sm font-bold text-green-600">
                  {(stream.vested_amount - stream.withdrawn_amount).toFixed(4)} BCH
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-textMuted">Remaining</span>
                <span className="text-sm font-bold text-textSecondary">
                  {(stream.total_amount - stream.vested_amount).toFixed(4)} BCH
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
