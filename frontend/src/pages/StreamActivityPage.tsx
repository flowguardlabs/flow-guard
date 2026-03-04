import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, ExternalLink, Filter, Sparkles, Waves } from 'lucide-react';
import { useWallet } from '../hooks/useWallet';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatsCard } from '../components/shared/StatsCard';
import { DataTable, type Column } from '../components/shared/DataTable';
import { getExplorerTxUrl } from '../utils/blockchain';
import { formatLogicalId } from '../utils/display';
import { getStreamScheduleTemplateLabel } from '../utils/streamShapes';
import { readDaoLaunchContext, type DaoLaunchContext } from '../utils/daoStreamLaunch';

type ActivityScope = 'personal' | 'treasury' | 'context';
type DateRangePreset = 'all' | '24h' | '7d' | '30d' | '90d';
type EventTypeFilter = 'all' | 'created' | 'funded' | 'claim' | 'paused' | 'resumed' | 'refilled' | 'cancelled';

interface StreamLaunchContext {
  source: string;
  title?: string;
  description?: string;
  preferredLane?: string;
}

interface StreamActivityEvent {
  id: string;
  entity_id: string;
  event_type: string;
  actor: string | null;
  amount: number | null;
  status: string | null;
  tx_hash: string | null;
  details?: unknown;
  created_at: number;
  stream: {
    stream_id: string;
    vault_id?: string | null;
    sender: string;
    recipient: string;
    stream_type: string;
    schedule_template?: string | null;
    launch_context?: StreamLaunchContext | null;
  };
}

function formatAssetAmount(amount: number | null) {
  if (typeof amount !== 'number') return 'N/A';
  return `${amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  })} BCH/tokens`;
}

function formatEventLabel(eventType: string) {
  switch (eventType) {
    case 'created':
      return 'Created';
    case 'funded':
      return 'Funded';
    case 'claim':
      return 'Claimed';
    case 'paused':
      return 'Paused';
    case 'resumed':
      return 'Resumed';
    case 'refilled':
      return 'Refilled';
    case 'cancelled':
      return 'Cancelled';
    default:
      return eventType
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
  }
}

export default function StreamActivityPage() {
  const wallet = useWallet();
  const navigate = useNavigate();
  const location = useLocation();
  const launchState = location.state as { daoContext?: DaoLaunchContext } | null;
  const daoContext = launchState?.daoContext || readDaoLaunchContext();
  const isDaoRoute = location.pathname.startsWith('/app/dao');
  const [scope, setScope] = useState<ActivityScope>(isDaoRoute ? 'treasury' : 'personal');
  const [dateRange, setDateRange] = useState<DateRangePreset>('30d');
  const [eventType, setEventType] = useState<EventTypeFilter>('all');
  const [events, setEvents] = useState<StreamActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalEvents, setTotalEvents] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const network = import.meta.env.VITE_BCH_NETWORK === 'mainnet' ? 'mainnet' : 'chipnet';

  useEffect(() => {
    if (!wallet.address && scope === 'personal') {
      setEvents([]);
      setLoading(false);
      return;
    }

    const fetchActivity = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        params.set('limit', '25');
        params.set('page', String(page));

        if (scope === 'personal' && wallet.address) {
          params.set('address', wallet.address);
        }
        if (scope === 'treasury') {
          params.set('treasury', 'true');
        }
        if (scope === 'context' && daoContext?.source) {
          params.set('contextSource', daoContext.source);
          params.set('treasury', 'true');
        }
        if (eventType !== 'all') {
          params.set('eventType', eventType);
        }
        if (dateRange !== 'all') {
          const rangeSeconds = {
            '24h': 24 * 60 * 60,
            '7d': 7 * 24 * 60 * 60,
            '30d': 30 * 24 * 60 * 60,
            '90d': 90 * 24 * 60 * 60,
          }[dateRange];
          params.set('dateFrom', String(Math.floor(Date.now() / 1000) - rangeSeconds));
        }

        const response = await fetch(`/api/streams/activity?${params.toString()}`);
        const data = await response.json();
        setEvents(data.events || []);
        setTotalEvents(Number(data.total || 0));
        setTotalPages(Math.max(1, Number(data.totalPages || 1)));
      } catch (error) {
        console.error('Failed to fetch stream activity:', error);
        setEvents([]);
        setTotalEvents(0);
        setTotalPages(1);
      } finally {
        setLoading(false);
      }
    };

    fetchActivity();
  }, [wallet.address, scope, daoContext?.source, eventType, dateRange, page]);

  useEffect(() => {
    setPage(1);
  }, [wallet.address, scope, daoContext?.source, eventType, dateRange]);

  const uniqueStreamCount = useMemo(
    () => new Set(events.map((event) => event.stream.stream_id)).size,
    [events],
  );
  const claimCount = useMemo(
    () => events.filter((event) => event.event_type === 'claim').length,
    [events],
  );
  const treasuryLinkedCount = useMemo(
    () => events.filter((event) => Boolean(event.stream.vault_id)).length,
    [events],
  );
  const activeContextCount = useMemo(
    () => events.filter((event) => Boolean(event.stream.launch_context?.source)).length,
    [events],
  );

  const columns: Column<StreamActivityEvent>[] = [
    {
      key: 'event_type',
      label: 'Event',
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-sans font-medium text-textPrimary">{formatEventLabel(row.event_type)}</p>
          <p className="text-xs text-textMuted font-mono mt-1">
            {new Date(row.created_at * 1000).toLocaleString()}
          </p>
        </div>
      ),
    },
    {
      key: 'stream',
      label: 'Stream',
      render: (row) => (
        <div>
          <p className="font-sans font-medium text-textPrimary">{formatLogicalId(row.stream.stream_id)}</p>
          <p className="text-xs text-textSecondary font-mono mt-1">
            {getStreamScheduleTemplateLabel(row.stream.schedule_template || '') || row.stream.stream_type}
          </p>
          {row.stream.launch_context?.preferredLane && (
            <p className="text-xs text-textMuted font-mono mt-1">
              Lane • {row.stream.launch_context.preferredLane}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'actor',
      label: 'Actor',
      render: (row) => (
        <p className="font-mono text-sm text-textMuted break-all">
          {row.actor || 'System'}
        </p>
      ),
    },
    {
      key: 'amount',
      label: 'Amount',
      sortable: true,
      className: 'text-right',
      render: (row) => (
        <p className="font-display font-bold text-primary">
          {formatAssetAmount(row.amount)}
        </p>
      ),
    },
    {
      key: 'tx_hash',
      label: 'Transaction',
      render: (row) => row.tx_hash ? (
        <a
          href={getExplorerTxUrl(row.tx_hash, network)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="inline-flex items-center gap-1 text-xs text-primary hover:text-primaryHover font-medium"
        >
          View Tx
          <ExternalLink className="w-3 h-3" />
        </a>
      ) : (
        <span className="text-xs text-textMuted font-sans">No tx</span>
      ),
    },
  ];

  const backDestination = isDaoRoute ? '/app/dao' : '/streams';
  const backLabel = isDaoRoute ? 'Back to Organization Workspace' : 'Back to Streams';
  const buildEventDaoContext = (event: StreamActivityEvent): DaoLaunchContext | undefined => {
    if (daoContext) return daoContext;
    if (!event.stream.launch_context) return undefined;
    return {
      source: event.stream.launch_context.source,
      title: event.stream.launch_context.title || 'Organization stream workflow',
      description:
        event.stream.launch_context.description ||
        'This stream was launched from an organization workspace and should remain tied to treasury workflow navigation.',
      preferredLane: event.stream.launch_context.preferredLane,
    };
  };

  return (
    <div className="min-h-screen pb-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <Link
          to={backDestination}
          className="inline-flex items-center gap-2 text-textSecondary hover:text-primary transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          {backLabel}
        </Link>

        {isDaoRoute && (
          <Card className="mb-6 p-5 md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-primary font-mono mb-2">
                  Organization stream feed
                </p>
                <h2 className="font-display text-2xl text-textPrimary mb-2">
                  {daoContext?.title || 'DAO treasury activity'}
                </h2>
                <p className="max-w-3xl text-textSecondary">
                  {daoContext?.description || 'Review how treasury-backed stream operations are being created, funded, claimed, paused, resumed, and refilled across the organization.'}
                </p>
              </div>
              {daoContext?.source && (
                <span className="rounded-full border border-border bg-surfaceAlt px-3 py-1 text-xs font-mono text-textMuted">
                  Source • {daoContext.source}
                </span>
              )}
            </div>
          </Card>
        )}

        <div className="mb-6 md:mb-8">
          <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 md:gap-6 mb-6 md:mb-8">
            <div>
              <h1 className="font-display font-medium text-3xl md:text-5xl lg:text-6xl text-textPrimary mb-3 md:mb-4">
                Stream Activity
              </h1>
              <p className="font-sans text-textMuted max-w-2xl text-sm leading-relaxed">
                Audit live stream creation, funding, claims, refills, and treasury execution context from one place.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate('/streams', {
                  state: daoContext ? { daoContext } : undefined,
                })}
              >
                <Waves className="w-4 h-4 mr-2" />
                Open Streams
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
            <StatsCard
              label="Events"
              value={`${totalEvents}`}
              subtitle={`${events.length} loaded on this page`}
              icon={Clock}
              color="primary"
            />
            <StatsCard
              label="Streams touched"
              value={`${uniqueStreamCount}`}
              subtitle="Unique stream schedules"
              icon={Waves}
              color="accent"
            />
            <StatsCard
              label="Claims"
              value={`${claimCount}`}
              subtitle="Claim events in current view"
              icon={Sparkles}
              color="secondary"
            />
            <StatsCard
              label="Treasury-linked"
              value={`${treasuryLinkedCount}`}
              subtitle={`${activeContextCount} with saved organization context`}
              icon={Filter}
              color="secondary"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3 md:mb-4">
            {wallet.address && (
              <Button
                variant={scope === 'personal' ? 'primary' : 'outline'}
                onClick={() => setScope('personal')}
                className="flex items-center gap-2"
              >
                Personal activity
              </Button>
            )}
            <Button
              variant={scope === 'treasury' ? 'primary' : 'outline'}
              onClick={() => setScope('treasury')}
              className="flex items-center gap-2"
            >
              Treasury feed
            </Button>
            {daoContext?.source && (
              <Button
                variant={scope === 'context' ? 'primary' : 'outline'}
                onClick={() => setScope('context')}
                className="flex items-center gap-2"
              >
                This launch context
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
            <div className="flex flex-wrap items-center gap-2">
              {(['all', '24h', '7d', '30d', '90d'] as DateRangePreset[]).map((preset) => (
                <Button
                  key={preset}
                  variant={dateRange === preset ? 'primary' : 'outline'}
                  onClick={() => setDateRange(preset)}
                >
                  {preset === 'all' ? 'All time' : preset}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-textMuted font-sans">Event type</span>
              <select
                value={eventType}
                onChange={(event) => setEventType(event.target.value as EventTypeFilter)}
                className="rounded-lg border border-border bg-surface px-4 py-2 text-sm text-textPrimary focus:outline-none focus:ring-2 focus:ring-focusRing"
              >
                <option value="all">All events</option>
                <option value="created">Created</option>
                <option value="funded">Funded</option>
                <option value="claim">Claims</option>
                <option value="paused">Paused</option>
                <option value="resumed">Resumed</option>
                <option value="refilled">Refilled</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent mx-auto mb-4" />
            <p className="text-textSecondary font-sans">Loading stream activity...</p>
          </div>
        ) : (
          <div className="space-y-4">
            <DataTable
              columns={columns}
              data={events}
              onRowClick={(event) => {
                const context = buildEventDaoContext(event);
                navigate(`/streams/${event.entity_id}`, {
                  state: context ? { daoContext: context } : undefined,
                });
              }}
              enableSearch
              enableExport
              emptyMessage="No stream activity found for the selected scope."
            />
            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surfaceAlt px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-textSecondary">
                Page {page} of {totalPages} • {totalEvents} total event{totalEvents === 1 ? '' : 's'}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
