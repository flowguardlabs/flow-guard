/**
 * StreamsPage - Professional Stream Management
 * Sablier-quality with DataTable, circular progress, CSV import/export
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Plus, Inbox, Send, Clock, Zap, ExternalLink } from 'lucide-react';
import { useWallet } from '../hooks/useWallet';
import { Button } from '../components/ui/Button';
import { DataTable, Column } from '../components/shared/DataTable';
import { StatsCard } from '../components/shared/StatsCard';
import { getExplorerTxUrl } from '../utils/blockchain';
import { formatLogicalId } from '../utils/display';

type RoleView = 'recipient' | 'sender' | 'all';

interface Stream {
  id: string;
  stream_id: string;
  sender: string;
  recipient: string;
  token_type: 'BCH' | 'CASHTOKENS';
  total_amount: number;
  withdrawn_amount: number;
  vested_amount: number;
  claimable_amount: number;
  progress_percentage: number;
  stream_type: string;
  start_time: number;
  end_time?: number;
  status: string;
  created_at: number;
  tx_hash?: string | null;
  latest_event?: {
    event_type: string;
    status?: string | null;
    tx_hash?: string | null;
    created_at: number;
  } | null;
}

export default function StreamsPage() {
  const wallet = useWallet();
  const navigate = useNavigate();
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleView, setRoleView] = useState<RoleView>('recipient');
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  const network = import.meta.env.VITE_BCH_NETWORK === 'mainnet' ? 'mainnet' : 'chipnet';

  const formatEventLabel = (eventType: string) => {
    switch (eventType) {
      case 'created':
        return 'Stream Created';
      case 'funded':
        return 'Stream Funded';
      case 'claim':
        return 'Claim Processed';
      case 'paused':
        return 'Stream Paused';
      case 'resumed':
        return 'Stream Resumed';
      case 'cancelled':
        return 'Stream Cancelled';
      default:
        return eventType
          .split('_')
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' ');
    }
  };

  useEffect(() => {
    if (!wallet.address) {
      setLoading(false);
      return;
    }

    const fetchStreams = async () => {
      try {
        setLoading(true);

        let queryParams = '';
        if (roleView === 'recipient') {
          queryParams = `recipient=${wallet.address}`;
        } else if (roleView === 'sender') {
          queryParams = `sender=${wallet.address}`;
        } else {
          queryParams = `address=${wallet.address}`;
        }

        const response = await fetch(`/api/streams?${queryParams}`);
        const data = await response.json();
        setStreams(data.streams || []);
      } catch (error) {
        console.error('Failed to fetch streams:', error);
        setStreams([]);
      } finally {
        setLoading(false);
      }
    };

    fetchStreams();
  }, [wallet.address, roleView]);

  // Calculate totals
  const totalClaimable = streams
    .filter(s => s.status === 'ACTIVE')
    .reduce((sum, s) => sum + s.claimable_amount, 0);

  const totalVested = streams.reduce((sum, s) => sum + s.vested_amount, 0);
  const totalWithdrawn = streams.reduce((sum, s) => sum + s.withdrawn_amount, 0);
  const totalValue = streams.reduce((sum, s) => sum + s.total_amount, 0);

  // Filter streams by status
  const filteredStreams = streams.filter(stream => {
    if (filter === 'active' && stream.status !== 'ACTIVE') return false;
    if (filter === 'completed' && stream.status !== 'COMPLETED') return false;
    return true;
  });

  // Table columns
  const columns: Column<Stream>[] = [
    {
      key: 'stream_id',
      label: 'Stream ID',
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-sans font-medium text-textPrimary">{formatLogicalId(row.stream_id)}</p>
          <p className="text-xs text-textMuted font-mono">{row.stream_type}</p>
        </div>
      ),
    },
    {
      key: 'sender',
      label: 'Sender',
      sortable: true,
      render: (row) => (
        <p className="font-mono text-sm text-textMuted">
          {row.sender.slice(0, 15)}...{row.sender.slice(-10)}
        </p>
      ),
    },
    {
      key: 'recipient',
      label: 'Recipient',
      sortable: true,
      render: (row) => (
        <p className="font-mono text-sm text-textMuted">
          {row.recipient.slice(0, 15)}...{row.recipient.slice(-10)}
        </p>
      ),
    },
    {
      key: 'total_amount',
      label: 'Total Amount',
      sortable: true,
      className: 'text-right',
      render: (row) => (
        <p className="font-display font-bold text-primary">
          {row.total_amount.toFixed(4)} {row.token_type}
        </p>
      ),
    },
    {
      key: 'progress_percentage',
      label: 'Progress',
      sortable: true,
      className: 'text-center',
      render: (row) => (
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-surfaceAlt rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all"
              style={{ width: `${row.progress_percentage}%` }}
            />
          </div>
          <span className="text-xs font-mono text-textMuted w-12">
            {row.progress_percentage.toFixed(0)}%
          </span>
        </div>
      ),
    },
    {
      key: 'claimable_amount',
      label: 'Claimable',
      sortable: true,
      className: 'text-right',
      render: (row) => (
        <p className="font-display font-bold text-accent">
          {row.claimable_amount.toFixed(4)} {row.token_type}
        </p>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      className: 'text-center',
      render: (row) => {
        const statusColors = {
          ACTIVE: 'bg-accent/10 text-accent border-accent',
          COMPLETED: 'bg-primary/10 text-primary border-primary',
          PAUSED: 'bg-secondary/10 text-secondary border-secondary',
          CANCELLED: 'bg-surfaceAlt text-textMuted border-border',
        };
        return (
          <span
            className={`px-3 py-1 rounded-full text-xs font-sans font-medium border ${
              statusColors[row.status as keyof typeof statusColors] || statusColors.CANCELLED
            }`}
          >
            {row.status}
          </span>
        );
      },
    },
    {
      key: 'latest_event',
      label: 'Latest Activity',
      render: (row) => {
        if (!row.latest_event) {
          return <span className="text-xs text-textMuted font-sans">No events</span>;
        }

        const latestTxHash = row.latest_event.tx_hash || row.tx_hash;
        return (
          <div className="space-y-1">
            <p className="text-sm font-sans text-textPrimary">
              {formatEventLabel(row.latest_event.event_type)}
            </p>
            <p className="text-xs text-textMuted font-mono">
              {new Date(row.latest_event.created_at * 1000).toLocaleString()}
            </p>
            {latestTxHash && (
              <a
                href={getExplorerTxUrl(latestTxHash, network)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
                className="inline-flex items-center gap-1 text-xs text-primary hover:text-primaryHover font-medium"
              >
                View Tx
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        );
      },
    },
  ];

  const handleImport = (data: any[]) => {
    // CSV import - could prefill a batch create form
    console.log('Imported streams:', data);
    // Navigate to batch create with prefilled data
    navigate('/streams/batch-create', { state: { importedData: data } });
  };

  if (!wallet.isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md">
          <Inbox className="w-16 h-16 text-textMuted mx-auto mb-4" />
          <h2 className="text-2xl font-display font-bold text-textPrimary mb-2">
            Connect Your Wallet
          </h2>
          <p className="text-textMuted font-sans mb-6">
            Please connect your wallet to view and manage your streams.
          </p>
          <Button onClick={() => {}}>Connect Wallet</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 md:gap-6 mb-6 md:mb-8">
            <div>
              <h1 className="font-display font-medium text-3xl md:text-5xl lg:text-6xl text-textPrimary mb-3 md:mb-4">
                Streams
              </h1>
              <p className="font-sans text-textMuted max-w-2xl text-sm leading-relaxed">
                Automated token streaming for salaries, vesting, and recurring payments. View as recipient or sender.
              </p>
            </div>
            <Button
              size="lg"
              onClick={() => navigate('/streams/create')}
              className="shadow-lg"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Stream
            </Button>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
            <StatsCard
              label="Total Value"
              value={`${totalValue.toFixed(4)} BCH`}
              subtitle={`${streams.length} streams`}
              icon={TrendingUp}
              color="primary"
            />
            <StatsCard
              label="Total Vested"
              value={`${totalVested.toFixed(4)} BCH`}
              subtitle="Already vested"
              icon={Clock}
              color="accent"
              progress={{
                percentage: totalValue > 0 ? (totalVested / totalValue) * 100 : 0,
                label: 'Vested',
              }}
            />
            <StatsCard
              label="Claimable Now"
              value={`${totalClaimable.toFixed(4)} BCH`}
              subtitle="Available to claim"
              icon={Zap}
              color="accent"
            />
            <StatsCard
              label="Withdrawn"
              value={`${totalWithdrawn.toFixed(4)} BCH`}
              subtitle="Already claimed"
              icon={Inbox}
              color="secondary"
            />
          </div>

          {/* Role View Toggle */}
          <div className="flex flex-wrap items-center gap-2 mb-3 md:mb-4">
            <Button
              variant={roleView === 'recipient' ? 'primary' : 'outline'}
              onClick={() => setRoleView('recipient')}
              className="flex items-center gap-2"
            >
              <Inbox className="w-4 h-4" />
              As Recipient
            </Button>
            <Button
              variant={roleView === 'sender' ? 'primary' : 'outline'}
              onClick={() => setRoleView('sender')}
              className="flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              As Sender
            </Button>
            <Button
              variant={roleView === 'all' ? 'primary' : 'outline'}
              onClick={() => setRoleView('all')}
            >
              All Streams
            </Button>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-textMuted font-sans">Status:</span>
            {(['all', 'active', 'completed'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-3 py-1.5 rounded-md text-xs font-sans font-medium transition-colors ${
                  filter === status
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-surface text-textSecondary hover:bg-surfaceAlt border border-border'
                }`}
              >
                {status.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Data Table */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent mx-auto mb-4" />
            <p className="text-textSecondary font-sans">Loading streams...</p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredStreams}
            onRowClick={(stream) => navigate(`/streams/${stream.id}`)}
            enableSearch
            enableExport
            enableImport
            onImport={handleImport}
            emptyMessage="No streams found. Create your first stream to get started."
          />
        )}
      </div>
    </div>
  );
}
