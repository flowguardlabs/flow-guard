/**
 * AirdropsPage - Professional Airdrop Campaign Management
 * Sablier-quality with DataTable, circular progress, CSV import/export
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gift, Plus, Users, DollarSign, TrendingUp, Zap } from 'lucide-react';
import { useWallet } from '../hooks/useWallet';
import { Button } from '../components/ui/Button';
import { DataTable, Column } from '../components/shared/DataTable';
import { StatsCard } from '../components/shared/StatsCard';

type CampaignStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'EXPIRED';
type CampaignType = 'AIRDROP' | 'BOUNTY' | 'REWARD' | 'GRANT';

interface AirdropCampaign {
  id: string;
  campaign_id: string;
  creator: string;
  title: string;
  description?: string;
  campaign_type: CampaignType;
  token_type: 'BCH' | 'CASHTOKENS';
  token_category?: string;
  total_amount: number;
  amount_per_claim: number;
  total_recipients: number;
  claimed_count: number;
  remaining_claims: number;
  claim_link: string;
  start_date: number;
  end_date?: number;
  status: CampaignStatus;
  require_kyc: boolean;
  max_claims_per_address?: number;
  created_at: number;
}

export default function AirdropsPage() {
  const wallet = useWallet();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<AirdropCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'created' | 'claimable'>('created');
  const [statusFilter, setStatusFilter] = useState<'all' | CampaignStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | CampaignType>('all');

  useEffect(() => {
    if (!wallet.address) {
      setLoading(false);
      return;
    }

    const fetchCampaigns = async () => {
      try {
        setLoading(true);
        const endpoint =
          viewMode === 'created'
            ? `/api/airdrops?creator=${wallet.address}`
            : `/api/airdrops/claimable?address=${wallet.address}`;

        const response = await fetch(endpoint);
        const data = await response.json();
        setCampaigns(data.campaigns || []);
      } catch (error) {
        console.error('Failed to fetch campaigns:', error);
        setCampaigns([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCampaigns();
  }, [wallet.address, viewMode]);

  // Calculate stats
  const activeCampaigns = campaigns.filter((c) => c.status === 'ACTIVE');
  const totalDistributed = campaigns.reduce(
    (sum, c) => sum + c.claimed_count * c.amount_per_claim,
    0
  );
  const totalRecipients = campaigns.reduce((sum, c) => sum + c.claimed_count, 0);
  const totalValue = campaigns.reduce((sum, c) => sum + c.total_amount, 0);

  // Filter campaigns
  const filteredCampaigns = campaigns.filter((campaign) => {
    if (statusFilter !== 'all' && campaign.status !== statusFilter) return false;
    if (typeFilter !== 'all' && campaign.campaign_type !== typeFilter) return false;
    return true;
  });

  // Table columns
  const columns: Column<AirdropCampaign>[] = [
    {
      key: 'campaign_id',
      label: 'Campaign',
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-sans font-medium text-textPrimary">{row.title}</p>
          <p className="text-xs text-textMuted font-mono">{row.campaign_id}</p>
        </div>
      ),
    },
    {
      key: 'campaign_type',
      label: 'Type',
      sortable: true,
      render: (row) => {
        const typeColors = {
          AIRDROP: 'bg-primary/10 text-primary border-primary',
          BOUNTY: 'bg-accent/10 text-accent border-accent',
          REWARD: 'bg-secondary/10 text-secondary border-secondary',
          GRANT: 'bg-surfaceAlt text-textPrimary border-border',
        };
        return (
          <span
            className={`px-3 py-1 rounded-full text-xs font-sans font-medium border ${
              typeColors[row.campaign_type]
            }`}
          >
            {row.campaign_type}
          </span>
        );
      },
    },
    {
      key: 'total_amount',
      label: 'Total Pool',
      sortable: true,
      className: 'text-right',
      render: (row) => (
        <div className="text-right">
          <p className="font-display font-bold text-primary">
            {row.total_amount.toFixed(4)} {row.token_type}
          </p>
          <p className="text-xs text-textMuted font-mono">
            {row.amount_per_claim.toFixed(4)} per claim
          </p>
        </div>
      ),
    },
    {
      key: 'claimed_count',
      label: 'Claimed',
      sortable: true,
      className: 'text-right',
      render: (row) => {
        const distributed = row.claimed_count * row.amount_per_claim;
        return (
          <div className="text-right">
            <p className="font-display font-bold text-accent">
              {distributed.toFixed(4)} {row.token_type}
            </p>
            <p className="text-xs text-textMuted font-mono">
              {row.claimed_count} / {row.total_recipients} recipients
            </p>
          </div>
        );
      },
    },
    {
      key: 'progress',
      label: 'Progress',
      sortable: false,
      render: (row) => {
        const progress = (row.claimed_count / row.total_recipients) * 100;
        return (
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-surfaceAlt rounded-full h-2 overflow-hidden min-w-[100px]">
              <div
                className="h-full bg-accent rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs font-mono text-textMuted w-12">
              {progress.toFixed(0)}%
            </span>
          </div>
        );
      },
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      className: 'text-center',
      render: (row) => {
        const statusColors = {
          ACTIVE: 'bg-accent/10 text-accent border-accent',
          PAUSED: 'bg-secondary/10 text-secondary border-secondary',
          COMPLETED: 'bg-primary/10 text-primary border-primary',
          EXPIRED: 'bg-surfaceAlt text-textMuted border-border',
        };
        return (
          <span
            className={`px-3 py-1 rounded-full text-xs font-sans font-medium border ${
              statusColors[row.status]
            }`}
          >
            {row.status}
          </span>
        );
      },
    },
    {
      key: 'created_at',
      label: 'Created',
      sortable: true,
      render: (row) => {
        const date = new Date(row.created_at * 1000);
        return (
          <div>
            <p className="text-sm font-sans text-textPrimary">
              {date.toLocaleDateString()}
            </p>
            <p className="text-xs text-textMuted font-mono">
              {date.toLocaleTimeString()}
            </p>
          </div>
        );
      },
    },
  ];

  const handleImport = (data: any[]) => {
    console.log('Imported campaigns:', data);
    navigate('/airdrops/batch-create', { state: { importedData: data } });
  };

  if (!wallet.isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md">
          <Gift className="w-16 h-16 text-textMuted mx-auto mb-4" />
          <h2 className="text-2xl font-display font-bold text-textPrimary mb-2">
            Connect Your Wallet
          </h2>
          <p className="text-textMuted font-sans mb-6">
            Please connect your wallet to view and manage airdrop campaigns.
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
                Airdrops
              </h1>
              <p className="font-sans text-textMuted max-w-2xl text-sm leading-relaxed">
                {viewMode === 'created'
                  ? 'Manage mass distribution campaigns and track claim progress'
                  : 'Discover and claim available airdrops'}
              </p>
            </div>
            {viewMode === 'created' && (
              <Button
                size="lg"
                onClick={() => navigate('/airdrops/create')}
                className="shadow-lg"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Campaign
              </Button>
            )}
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
            <StatsCard
              label="Active Campaigns"
              value={activeCampaigns.length}
              subtitle={`${campaigns.length} total`}
              icon={Gift}
              color="primary"
            />
            <StatsCard
              label="Total Distributed"
              value={`${totalDistributed.toFixed(4)} BCH`}
              subtitle="Across all campaigns"
              icon={DollarSign}
              color="accent"
              progress={{
                percentage: totalValue > 0 ? (totalDistributed / totalValue) * 100 : 0,
                label: 'Distributed',
              }}
            />
            <StatsCard
              label="Total Claimants"
              value={totalRecipients}
              subtitle="Unique claims"
              icon={Users}
              color="secondary"
            />
            <StatsCard
              label="Total Value"
              value={`${totalValue.toFixed(4)} BCH`}
              subtitle="All campaigns"
              icon={TrendingUp}
              color="muted"
            />
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-2 mb-4">
            <Button
              variant={viewMode === 'created' ? 'primary' : 'outline'}
              onClick={() => setViewMode('created')}
              className="flex items-center gap-2"
            >
              <TrendingUp className="w-4 h-4" />
              My Campaigns
            </Button>
            <Button
              variant={viewMode === 'claimable' ? 'primary' : 'outline'}
              onClick={() => setViewMode('claimable')}
              className="flex items-center gap-2"
            >
              <Gift className="w-4 h-4" />
              Claimable
            </Button>
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-textMuted font-sans">Type:</span>
            {(['all', 'AIRDROP', 'BOUNTY', 'REWARD', 'GRANT'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={`px-3 py-1.5 rounded-md text-xs font-sans font-medium transition-colors ${
                  typeFilter === type
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-surface text-textSecondary hover:bg-surfaceAlt border border-border'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-textMuted font-sans">Status:</span>
            {(['all', 'ACTIVE', 'PAUSED', 'COMPLETED', 'EXPIRED'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-md text-xs font-sans font-medium transition-colors ${
                  statusFilter === status
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-surface text-textSecondary hover:bg-surfaceAlt border border-border'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {/* Data Table */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent mx-auto mb-4" />
            <p className="text-textSecondary font-sans">Loading campaigns...</p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredCampaigns}
            onRowClick={(campaign) => navigate(`/airdrops/${campaign.id}`)}
            enableSearch
            enableExport
            enableImport
            onImport={handleImport}
            emptyMessage="No airdrop campaigns found. Create your first campaign to get started."
          />
        )}
      </div>
    </div>
  );
}
