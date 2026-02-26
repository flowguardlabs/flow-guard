import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useWallet } from '../hooks/useWallet';
import { useNetwork } from '../hooks/useNetwork';
import {
  fundPaymentContract,
  claimPaymentFunds,
  pausePaymentOnChain,
  resumePaymentOnChain,
  cancelPaymentOnChain,
  getExplorerTxUrl,
} from '../utils/blockchain';
import { formatLogicalId } from '../utils/display';
import {
  ChevronLeft,
  Repeat,
  DollarSign,
  Calendar,
  Clock,
  Pause,
  Play,
  X,
  TrendingUp,
  ExternalLink,
  Wallet,
  Download,
  History,
} from 'lucide-react';

interface ActivityEvent {
  id: string;
  event_type: string;
  actor: string | null;
  amount: number | null;
  status: string | null;
  tx_hash: string | null;
  created_at: number;
  details?: Record<string, unknown> | null;
}

export default function PaymentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const wallet = useWallet();
  const network = useNetwork();
  const [payment, setPayment] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [claimableIntervals, setClaimableIntervals] = useState(0);
  const [claimableAmount, setClaimableAmount] = useState(0);
  const [events, setEvents] = useState<ActivityEvent[]>([]);

  useEffect(() => {
    const fetchPayment = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/payments/${id}`);
        const data = await response.json();
        setPayment(data.payment);
        setHistory(data.history || []);
        setEvents(data.events || []);
      } catch (error) {
        console.error('Failed to fetch payment:', error);
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchPayment();
  }, [id]);

  // RecurringPaymentCovenant.pay() permits exactly one interval per transaction.
  useEffect(() => {
    if (!payment || payment.status !== 'ACTIVE') {
      setClaimableIntervals(0);
      setClaimableAmount(0);
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const nextPaymentDate = Number(payment.next_payment_date || 0);
    const endDate = Number(payment.end_date || 0);
    const due = now >= nextPaymentDate;
    const withinEnd = endDate <= 0 || nextPaymentDate <= endDate;

    if (due && withinEnd) {
      setClaimableIntervals(1);
      setClaimableAmount(Number(payment.amount_per_period || 0));
      return;
    }

    setClaimableIntervals(0);
    setClaimableAmount(0);
  }, [payment]);

  const handlePause = async () => {
    if (!wallet.isConnected) {
      alert('Please connect your wallet first');
      return;
    }
    setActionLoading('pause');
    try {
      const txHash = await pausePaymentOnChain(wallet, id!);
      alert(`Payment paused on-chain.\n\nTransaction: ${txHash}`);
      const response = await fetch(`/api/payments/${id}`);
      const data = await response.json();
      setPayment(data.payment);
      setEvents(data.events || []);
    } catch (error: any) {
      console.error('Failed to pause payment:', error);
      alert(`Failed to pause payment: ${error.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleResume = async () => {
    if (!wallet.isConnected) {
      alert('Please connect your wallet first');
      return;
    }
    setActionLoading('resume');
    try {
      const txHash = await resumePaymentOnChain(wallet, id!);
      alert(`Payment resumed on-chain.\n\nTransaction: ${txHash}`);
      const response = await fetch(`/api/payments/${id}`);
      const data = await response.json();
      setPayment(data.payment);
      setEvents(data.events || []);
    } catch (error: any) {
      console.error('Failed to resume payment:', error);
      alert(`Failed to resume payment: ${error.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this recurring payment? This cannot be undone.')) {
      return;
    }
    if (!wallet.isConnected) {
      alert('Please connect your wallet first');
      return;
    }

    setActionLoading('cancel');
    try {
      const txHash = await cancelPaymentOnChain(wallet, id!);
      alert(`Payment cancelled on-chain.\n\nTransaction: ${txHash}`);
      navigate('/payments');
    } catch (error: any) {
      console.error('Failed to cancel payment:', error);
      alert(`Failed to cancel payment: ${error.message}`);
      setActionLoading(null);
    }
  };

  const handleFund = async () => {
    if (!wallet.isConnected) {
      alert('Please connect your wallet first');
      return;
    }

    setActionLoading('fund');
    try {
      const txHash = await fundPaymentContract(wallet, id!);
      alert(`Payment funded successfully!\n\nTransaction: ${txHash}`);

      // Refresh payment data
      const response = await fetch(`/api/payments/${id}`);
      const data = await response.json();
      setPayment(data.payment);
      setEvents(data.events || []);
    } catch (error: any) {
      console.error('Failed to fund payment:', error);
      alert(`Failed to fund payment: ${error.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleClaim = async () => {
    if (!wallet.isConnected) {
      alert('Please connect your wallet first');
      return;
    }

    if (claimableAmount <= 0) {
      alert('No payment intervals available to claim yet');
      return;
    }

    setActionLoading('claim');
    try {
      const txHash = await claimPaymentFunds(wallet, id!);
      alert(`Claimed ${claimableAmount.toFixed(4)} BCH successfully!\n\nTransaction: ${txHash}`);

      // Refresh payment data
      const response = await fetch(`/api/payments/${id}`);
      const data = await response.json();
      setPayment(data.payment);
      setHistory(data.history || []);
      setEvents(data.events || []);
    } catch (error: any) {
      console.error('Failed to claim payment:', error);
      alert(`Failed to claim payment: ${error.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-textMuted font-mono">Loading payment...</p>
        </div>
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="p-8">
        <Card padding="xl" className="text-center">
          <h2 className="text-lg md:text-xl lg:text-2xl font-display font-bold text-textPrimary mb-2">Payment not found</h2>
          <p className="text-textMuted font-mono mb-6">This payment does not exist or you don't have access.</p>
          <Button onClick={() => navigate('/payments')}>Back to Payments</Button>
        </Card>
      </div>
    );
  }

  const isSender = wallet.address === payment.sender;
  const isRecipient = wallet.address === payment.recipient;
  const daysUntilNext = Math.ceil((payment.next_payment_date - Math.floor(Date.now() / 1000)) / 86400);

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/payments')}
            className="inline-flex items-center gap-2 text-primary hover:text-primaryHover font-mono mb-4 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Payments
          </button>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-display font-bold text-textPrimary mb-2">
                {formatLogicalId(payment.payment_id)}
              </h1>
              <p className="text-textMuted font-mono">
                Recurring {payment.interval.toLowerCase()} payment
              </p>
            </div>

            <div className="flex gap-3">
              {/* Fund button for sender when PENDING */}
              {isSender && payment.status === 'PENDING' && (
                <Button
                  variant="primary"
                  onClick={handleFund}
                  disabled={actionLoading === 'fund'}
                  className="flex items-center gap-2"
                >
                  <Wallet className="w-4 h-4" />
                  {actionLoading === 'fund' ? 'Funding...' : 'Fund Payment'}
                </Button>
              )}

              {/* Claim button for recipient when ACTIVE */}
              {isRecipient && payment.status === 'ACTIVE' && (
                <Button
                  variant="primary"
                  onClick={handleClaim}
                  disabled={actionLoading === 'claim' || claimableIntervals === 0}
                  className="flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  {actionLoading === 'claim'
                    ? 'Claiming...'
                    : claimableIntervals > 0
                      ? 'Claim Payment'
                      : 'No Claim Available'}
                </Button>
              )}

              {/* Pause/Resume/Cancel for sender */}
              {isSender && payment.pausable && payment.status !== 'PENDING' && (
                <>
                  {payment.status === 'ACTIVE' ? (
                    <Button
                      variant="outline"
                      onClick={handlePause}
                      disabled={actionLoading === 'pause'}
                      className="flex items-center gap-2"
                    >
                      <Pause className="w-4 h-4" />
                      {actionLoading === 'pause' ? 'Pausing...' : 'Pause'}
                    </Button>
                  ) : payment.status === 'PAUSED' ? (
                    <Button
                      variant="outline"
                      onClick={handleResume}
                      disabled={actionLoading === 'resume'}
                      className="flex items-center gap-2"
                    >
                      <Play className="w-4 h-4" />
                      {actionLoading === 'resume' ? 'Resuming...' : 'Resume'}
                    </Button>
                  ) : null}

                  <Button
                    variant="outline"
                    onClick={handleCancel}
                    disabled={!!actionLoading}
                    className="flex items-center gap-2 text-error border-error hover:bg-error/5"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Claimable Amount Banner for Recipient */}
        {isRecipient && payment.status === 'ACTIVE' && claimableIntervals > 0 && (
          <Card padding="lg" className="mb-6 bg-primary/5 border-primary">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-mono text-textMuted uppercase mb-1">Claimable Now</p>
                <p className="text-2xl md:text-3xl font-display font-bold text-primary">
                  {claimableAmount.toFixed(4)} BCH
                </p>
                <p className="text-sm font-mono text-textMuted mt-1">
                  1 payment interval ready
                </p>
              </div>
              <Button
                variant="primary"
                onClick={handleClaim}
                disabled={actionLoading === 'claim'}
                className="flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                {actionLoading === 'claim' ? 'Claiming...' : 'Claim Now'}
              </Button>
            </div>
          </Card>
        )}

        {/* Stats Grid */}
        <div className="grid md:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
          <Card padding="lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-mono text-textMuted uppercase tracking-wide">Amount per Payment</span>
              <DollarSign className="w-5 h-5 text-textMuted" />
            </div>
            <p className="text-xl md:text-2xl lg:text-3xl font-display font-bold text-textPrimary">
              {payment.amount_per_period.toFixed(4)} <span className="text-lg text-textMuted">BCH</span>
            </p>
          </Card>

          <Card padding="lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-mono text-textMuted uppercase tracking-wide">Total Paid</span>
              <TrendingUp className="w-5 h-5 text-textMuted" />
            </div>
            <p className="text-xl md:text-2xl lg:text-3xl font-display font-bold text-textPrimary">
              {payment.total_paid.toFixed(4)} <span className="text-lg text-textMuted">BCH</span>
            </p>
            <p className="text-xs font-mono text-textMuted mt-1">{payment.payment_count} payments</p>
          </Card>

          <Card padding="lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-mono text-textMuted uppercase tracking-wide">Next Payment</span>
              <Clock className="w-5 h-5 text-textMuted" />
            </div>
            <p className="text-xl md:text-2xl lg:text-3xl font-display font-bold text-textPrimary">
              {payment.status === 'ACTIVE' ? (daysUntilNext > 0 ? `${daysUntilNext}d` : 'Today') : 'N/A'}
            </p>
            <p className="text-xs font-mono text-textMuted mt-1">
              {payment.status === 'ACTIVE' && new Date(payment.next_payment_date * 1000).toLocaleDateString()}
            </p>
          </Card>

          <Card padding="lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-mono text-textMuted uppercase tracking-wide">Status</span>
              <Repeat className="w-5 h-5 text-textMuted" />
            </div>
            <p className="text-xl md:text-2xl lg:text-3xl font-display font-bold text-textPrimary">{payment.status}</p>
            <p className="text-xs font-mono text-textMuted mt-1">{payment.interval}</p>
          </Card>
        </div>

        {/* Payment Details */}
        <div className="grid md:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
          <Card padding="lg">
            <h3 className="text-xl font-display font-bold text-textPrimary mb-4">Payment Details</h3>
            <div className="space-y-3">
              <div>
                <span className="block text-xs font-mono text-textMuted uppercase mb-1">Sender</span>
                <p className="text-sm font-mono text-textPrimary break-all">{payment.sender}</p>
              </div>
              <div>
                <span className="block text-xs font-mono text-textMuted uppercase mb-1">Recipient</span>
                <p className="text-sm font-mono text-textPrimary break-all">{payment.recipient}</p>
                {payment.recipient_name && (
                  <p className="text-sm font-display text-textMuted">{payment.recipient_name}</p>
                )}
              </div>
              <div>
                <span className="block text-xs font-mono text-textMuted uppercase mb-1">Token Type</span>
                <p className="text-sm font-mono text-textPrimary">{payment.token_type}</p>
              </div>
            </div>
          </Card>

          <Card padding="lg">
            <h3 className="text-xl font-display font-bold text-textPrimary mb-4">Schedule</h3>
            <div className="space-y-3">
              <div>
                <span className="block text-xs font-mono text-textMuted uppercase mb-1">Start Date</span>
                <p className="text-sm font-mono text-textPrimary">
                  {new Date(payment.start_date * 1000).toLocaleDateString()}
                </p>
              </div>
              {payment.end_date && (
                <div>
                  <span className="block text-xs font-mono text-textMuted uppercase mb-1">End Date</span>
                  <p className="text-sm font-mono text-textPrimary">
                    {new Date(payment.end_date * 1000).toLocaleDateString()}
                  </p>
                </div>
              )}
              <div>
                <span className="block text-xs font-mono text-textMuted uppercase mb-1">Interval</span>
                <p className="text-sm font-mono text-textPrimary">{payment.interval}</p>
              </div>
              <div>
                <span className="block text-xs font-mono text-textMuted uppercase mb-1">Pausable</span>
                <p className="text-sm font-mono text-textPrimary">{payment.pausable ? 'Yes' : 'No'}</p>
              </div>
            </div>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
          <Card padding="lg">
            <h3 className="text-xl font-display font-bold text-textPrimary mb-4">On-Chain Links</h3>
            <div className="space-y-3">
              <div>
                <span className="block text-xs font-mono text-textMuted uppercase mb-1">Contract</span>
                <p className="text-sm font-mono text-textPrimary break-all">{payment.contract_address || '-'}</p>
              </div>
              <div>
                <span className="block text-xs font-mono text-textMuted uppercase mb-1">Funding Transaction</span>
                {payment.tx_hash ? (
                  <a
                    href={getExplorerTxUrl(payment.tx_hash, network)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:text-primaryHover font-mono text-sm transition-colors"
                  >
                    {payment.tx_hash.slice(0, 12)}...{payment.tx_hash.slice(-10)}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <p className="text-sm font-mono text-textMuted">Not funded yet</p>
                )}
              </div>
            </div>
          </Card>

          <Card padding="lg">
            <h3 className="text-xl font-display font-bold text-textPrimary mb-4 flex items-center gap-2">
              <History className="w-5 h-5" />
              Activity Timeline
            </h3>
            {events.length === 0 ? (
              <p className="text-sm font-mono text-textMuted">No activity events recorded yet.</p>
            ) : (
              <div className="space-y-3 max-h-[18rem] overflow-y-auto pr-1">
                {events.map((event) => (
                  <div key={event.id} className="rounded-lg border border-border bg-surfaceAlt p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-display font-bold text-textPrimary">
                          {formatPaymentEventLabel(event.event_type)}
                        </p>
                        <p className="text-xs font-mono text-textMuted">
                          {new Date(event.created_at * 1000).toLocaleString()}
                        </p>
                        {event.actor && (
                          <p className="text-xs font-mono text-textMuted mt-1 break-all">
                            actor: {event.actor}
                          </p>
                        )}
                        {typeof event.amount === 'number' && (
                          <p className="text-xs font-mono text-textMuted mt-1">
                            amount: {event.amount.toFixed(4)} BCH
                          </p>
                        )}
                      </div>
                      {event.tx_hash && (
                        <a
                          href={getExplorerTxUrl(event.tx_hash, network)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:text-primaryHover font-mono text-xs transition-colors"
                        >
                          tx
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Payment History */}
        <Card padding="lg">
          <h3 className="text-xl font-display font-bold text-textPrimary mb-4">Payment History</h3>

          {history.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="w-12 h-12 text-textMuted mx-auto mb-3" />
              <p className="text-textMuted font-mono">No payments made yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-xs font-mono text-textMuted uppercase">Date</th>
                    <th className="text-left py-3 px-4 text-xs font-mono text-textMuted uppercase">Amount</th>
                    <th className="text-left py-3 px-4 text-xs font-mono text-textMuted uppercase">Transaction</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => (
                    <tr key={item.id} className="border-b border-border/40 hover:bg-surfaceAlt transition-colors">
                      <td className="py-3 px-4 font-mono text-sm text-textPrimary">
                        {new Date(item.paid_at * 1000).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 font-display font-bold text-sm text-textPrimary">
                        {item.amount.toFixed(4)} BCH
                      </td>
                      <td className="py-3 px-4">
                        <a
                          href={getExplorerTxUrl(item.tx_hash, network)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:text-primaryHover font-mono text-sm transition-colors"
                        >
                          {item.tx_hash.slice(0, 10)}...{item.tx_hash.slice(-8)}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function formatPaymentEventLabel(eventType: string): string {
  switch (eventType) {
    case 'created':
      return 'Payment Created';
    case 'funded':
      return 'Payment Funded';
    case 'claim':
      return 'Payment Claimed';
    case 'paused':
      return 'Payment Paused';
    case 'resumed':
      return 'Payment Resumed';
    case 'cancelled':
      return 'Payment Cancelled';
    default:
      return eventType
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
  }
}
