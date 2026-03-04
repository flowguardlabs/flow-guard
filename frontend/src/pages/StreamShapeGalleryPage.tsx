import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  GitBranch,
  Plus,
  Repeat,
  ShieldCheck,
  Sparkles,
  Trash2,
  TimerReset,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { StreamScheduleChart } from '../components/streams/StreamScheduleChart';
import { readDaoLaunchContext, rememberDaoLaunchContext, type DaoLaunchContext } from '../utils/daoStreamLaunch';
import {
  buildScheduleChartPoints,
  streamScheduleTemplates,
  type StreamScheduleTemplate,
} from '../utils/streamShapes';

interface GalleryTranchePoint {
  id: string;
  offsetDays: string;
  percentage: string;
}

function getTemplateIcon(template: StreamScheduleTemplate) {
  switch (template.streamType) {
    case 'LINEAR':
      return Clock3;
    case 'RECURRING':
      return Repeat;
    case 'STEP':
      return GitBranch;
    case 'HYBRID':
      return TimerReset;
    default:
      return Sparkles;
  }
}

function getTemplateSubtitle(template: StreamScheduleTemplate) {
  if (template.streamType === 'LINEAR') {
    return template.cliffDays !== '0'
      ? 'Linear vesting with a cliff-triggered release of the accrued balance.'
      : 'Continuous vesting from start to finish.';
  }
  if (template.streamType === 'RECURRING') {
    return `Fixed releases every ${template.recurringIntervalDays} days using RecurringPaymentCovenant.`;
  }
  if (template.streamType === 'HYBRID') {
    return `${template.hybridUnlockPercent}% unlock on day ${template.hybridUnlockDays}, then linear vesting via HybridVestingCovenant.`;
  }
  if (template.streamType === 'TRANCHE') {
    return `${template.trancheOffsetsDays?.length || 0} immutable unlock checkpoints using TrancheVestingCovenant.`;
  }
  if (template.stepIntervalDays === template.duration) {
    return 'A single end-of-term unlock using VestingCovenant milestone mode.';
  }
  return `Chunked unlocks every ${template.stepIntervalDays} days using VestingCovenant milestone mode.`;
}

const DEFAULT_GALLERY_TRANCHES: GalleryTranchePoint[] = [
  { id: 'gallery-tranche-1', offsetDays: '45', percentage: '20' },
  { id: 'gallery-tranche-2', offsetDays: '120', percentage: '30' },
  { id: 'gallery-tranche-3', offsetDays: '210', percentage: '20' },
  { id: 'gallery-tranche-4', offsetDays: '300', percentage: '30' },
];

export default function StreamShapeGalleryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const launchState = location.state as { daoContext?: DaoLaunchContext } | null;
  const daoContext = launchState?.daoContext || readDaoLaunchContext();
  const [customDurationDays, setCustomDurationDays] = useState('300');
  const [customTranches, setCustomTranches] = useState<GalleryTranchePoint[]>(DEFAULT_GALLERY_TRANCHES);

  useEffect(() => {
    if (daoContext) {
      rememberDaoLaunchContext(daoContext);
    }
  }, [daoContext]);

  const groupedTemplates = useMemo(() => ({
    LINEAR: streamScheduleTemplates.filter((template) => template.streamType === 'LINEAR'),
    HYBRID: streamScheduleTemplates.filter((template) => template.streamType === 'HYBRID'),
    RECURRING: streamScheduleTemplates.filter((template) => template.streamType === 'RECURRING'),
    STEP: streamScheduleTemplates.filter((template) => template.streamType === 'STEP'),
    TRANCHE: streamScheduleTemplates.filter((template) => template.streamType === 'TRANCHE'),
  }), []);

  const customTrancheDesigner = useMemo(() => {
    const durationDays = Number(customDurationDays || 0);
    const parsedRows = customTranches.map((tranche) => ({
      ...tranche,
      offsetDaysValue: Number(tranche.offsetDays || 0),
      percentageValue: Number(tranche.percentage || 0),
    }));

    if (!durationDays || durationDays <= 0) {
      return {
        warning: 'Set a positive schedule duration to design a custom staged unlock.',
        chartPoints: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
        releaseLabel: 'Pending schedule',
        cadenceLabel: 'Custom tranche checkpoints',
      };
    }

    if (parsedRows.length < 1 || parsedRows.length > 8) {
      return {
        warning: 'Custom tranche vesting supports between 1 and 8 checkpoints.',
        chartPoints: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
        releaseLabel: 'Pending schedule',
        cadenceLabel: 'Custom tranche checkpoints',
      };
    }

    for (let index = 0; index < parsedRows.length; index += 1) {
      const row = parsedRows[index];
      if (!row.offsetDaysValue || row.offsetDaysValue <= 0) {
        return {
          warning: `Checkpoint ${index + 1} needs a positive unlock offset.`,
          chartPoints: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
          releaseLabel: 'Pending schedule',
          cadenceLabel: 'Custom tranche checkpoints',
        };
      }
      if (!row.percentageValue || row.percentageValue <= 0) {
        return {
          warning: `Checkpoint ${index + 1} needs a positive unlock percentage.`,
          chartPoints: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
          releaseLabel: 'Pending schedule',
          cadenceLabel: 'Custom tranche checkpoints',
        };
      }
      if (index > 0 && row.offsetDaysValue <= parsedRows[index - 1].offsetDaysValue) {
        return {
          warning: 'Checkpoint offsets must be strictly increasing.',
          chartPoints: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
          releaseLabel: 'Pending schedule',
          cadenceLabel: 'Custom tranche checkpoints',
        };
      }
    }

    const totalPercentage = parsedRows.reduce((sum, row) => sum + row.percentageValue, 0);
    if (Math.abs(totalPercentage - 100) > 0.0001) {
      return {
        warning: 'Checkpoint percentages must sum to 100.',
        chartPoints: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
        releaseLabel: `${parsedRows.length} checkpoints`,
        cadenceLabel: 'Custom tranche checkpoints',
      };
    }

    if (parsedRows[parsedRows.length - 1].offsetDaysValue !== durationDays) {
      return {
        warning: 'The final checkpoint should land on the full schedule duration.',
        chartPoints: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
        releaseLabel: `${parsedRows.length} checkpoints`,
        cadenceLabel: 'Custom tranche checkpoints',
      };
    }

    let runningPercentage = 0;
    const chartSchedule = parsedRows.map((row) => {
      runningPercentage += row.percentageValue;
      return {
        offsetDays: row.offsetDaysValue,
        cumulativeAmountOnChain: runningPercentage,
      };
    });

    return {
      warning: null as string | null,
      chartPoints: buildScheduleChartPoints({
        streamType: 'TRANCHE',
        durationDays,
        cliffDays: 0,
        intervalDays: 0,
        totalOnChain: 100,
        trancheSchedule: chartSchedule,
      }),
      releaseLabel: `${parsedRows.length} staged unlocks`,
      cadenceLabel: 'Custom tranche checkpoints',
    };
  }, [customDurationDays, customTranches]);

  const updateCustomTranche = (id: string, field: 'offsetDays' | 'percentage', value: string) => {
    setCustomTranches((previous) => previous.map((tranche) => (
      tranche.id === id ? { ...tranche, [field]: value } : tranche
    )));
  };

  const addCustomTranche = () => {
    setCustomTranches((previous) => {
      if (previous.length >= 8) return previous;
      const lastOffset = Number(previous[previous.length - 1]?.offsetDays || 0);
      return [
        ...previous,
        {
          id: `gallery-tranche-${Date.now()}`,
          offsetDays: String(lastOffset + 30 || 30),
          percentage: '10',
        },
      ];
    });
  };

  const removeCustomTranche = (id: string) => {
    setCustomTranches((previous) => (
      previous.length <= 1 ? previous : previous.filter((tranche) => tranche.id !== id)
    ));
  };

  const launchCustomTranche = () => {
    const offsets = customTranches.map((tranche) => tranche.offsetDays).join('|');
    const percentages = customTranches.map((tranche) => tranche.percentage).join('|');
    navigate(
      `/streams/create?template=tranche-backweighted&duration=${encodeURIComponent(customDurationDays)}&trancheOffsets=${encodeURIComponent(offsets)}&tranchePercentages=${encodeURIComponent(percentages)}`,
      {
        state: daoContext ? { daoContext } : undefined,
      },
    );
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        <div className="mb-8 rounded-[2rem] border border-border/60 bg-gradient-to-br from-surface via-surface to-background p-6 md:p-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-mono uppercase tracking-[0.18em] text-textMuted">
            <Sparkles className="h-4 w-4 text-accent" />
            Contract-backed schedule gallery
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div>
              <h1 className="font-display text-3xl md:text-5xl text-textPrimary mb-4">
                Browse stream shapes that actually map to our UTXO covenants
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-textMuted font-mono">
                FlowGuard currently supports a richer template system on top of two real contract families:
                <span className="text-textPrimary"> VestingCovenant </span>
                for continuous and milestone unlocks, and
                <span className="text-textPrimary"> RecurringPaymentCovenant </span>
                for fixed payroll-style releases. We now also expose
                <span className="text-textPrimary"> TrancheVestingCovenant </span>
                for bounded custom unlock schedules, and
                <span className="text-textPrimary"> HybridVestingCovenant </span>
                for one-time upfront unlocks followed by a linear tail. Every template below compiles into one of those covenant families.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Button onClick={() => navigate('/streams/create', {
                  state: daoContext ? { daoContext } : undefined,
                })}>
                  Create From Scratch
                </Button>
                <Button variant="outline" onClick={() => navigate('/streams/create?template=linear-cliff', {
                  state: daoContext ? { daoContext } : undefined,
                })}>
                  Start With A Template
                </Button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                {
                  title: 'What is real today',
                  icon: ShieldCheck,
                  body: 'Linear vesting, linear + cliff, fixed recurring releases, refillable recurring runway, milestone plans, and bounded custom tranche schedules.',
                },
                {
                  title: 'What is not faked',
                  icon: CheckCircle2,
                  body: 'Template choice feeds the create flow, persists on the stream record, and is rendered back on list/detail pages.',
                },
                {
                  title: 'Current ceiling',
                  icon: TimerReset,
                  body: 'No arbitrary spline curves and no exponential unlocks yet. Shapes must still compile into BCH-safe covenant transitions.',
                },
                {
                  title: 'Why this matters',
                  icon: Repeat,
                  body: 'Streams now feel distinct from recurring payments because the unlock story, cadence, and vesting math are visible upfront.',
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <Card key={item.title} padding="lg" className="h-full border-border/60">
                    <div className="flex items-start gap-3">
                      <div className="rounded-2xl bg-accent/10 p-3">
                        <Icon className="h-5 w-5 text-accent" />
                      </div>
                      <div>
                        <h2 className="font-display text-lg text-textPrimary mb-2">{item.title}</h2>
                        <p className="text-sm font-mono leading-6 text-textMuted">{item.body}</p>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-10">
          {([
            ['LINEAR', 'Linear Vesting'],
            ['HYBRID', 'Upfront + Linear Hybrid'],
            ['RECURRING', 'Recurring Releases'],
            ['STEP', 'Milestone Vesting'],
            ['TRANCHE', 'Custom Tranche Vesting'],
          ] as const).map(([key, heading]) => (
            <section key={key}>
              <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-textMuted mb-2">Supported schedule family</p>
                  <h2 className="font-display text-2xl md:text-3xl text-textPrimary">{heading}</h2>
                </div>
                <p className="max-w-2xl text-sm font-mono leading-6 text-textMuted">
                  {key === 'LINEAR' && 'Best for contributor vesting and investor allocations where value accrues continuously.'}
                  {key === 'HYBRID' && 'Best for grant, contributor, or investor schedules that need a meaningful first unlock before the remaining value vests over time.'}
                  {key === 'RECURRING' && 'Best for payroll, stipends, retainers, and any fixed payment that should release on a cadence.'}
                  {key === 'STEP' && 'Best for grant tranches, milestone-based contracts, timelocks, and explicit staged unlocks.'}
                  {key === 'TRANCHE' && 'Best for non-uniform release plans where each checkpoint can unlock a different percentage of the total allocation.'}
                </p>
              </div>

              {key === 'TRANCHE' && (
                <Card padding="lg" className="mb-5 border-border/60">
                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                    <div>
                      <div className="mb-4 inline-flex rounded-full border border-border bg-background px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-textMuted">
                        Custom designer
                      </div>
                      <h3 className="font-display text-2xl text-textPrimary mb-3">
                        Design a staged unlock before you create it
                      </h3>
                      <p className="text-sm font-mono leading-6 text-textMuted mb-5">
                        Build a custom tranche geometry here, preview the unlock curve, then open the create flow with those checkpoints preloaded.
                      </p>

                      <div className="grid gap-4 md:grid-cols-2 mb-4">
                        <Input
                          label="Schedule duration (days)"
                          type="number"
                          min="1"
                          value={customDurationDays}
                          onChange={(event) => setCustomDurationDays(event.target.value)}
                          helpText="The final checkpoint should land on this duration."
                        />
                        <div className="flex items-end">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={addCustomTranche}
                            disabled={customTranches.length >= 8}
                            className="w-full"
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Add checkpoint
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {customTranches.map((tranche, index) => (
                          <div key={tranche.id} className="rounded-2xl border border-border/60 bg-surfaceAlt p-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <div>
                                <p className="text-xs uppercase tracking-[0.18em] text-textMuted mb-1">Checkpoint {index + 1}</p>
                                <p className="font-display text-lg text-textPrimary">Tranche unlock</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeCustomTranche(tranche.id)}
                                disabled={customTranches.length <= 1}
                                className="rounded-xl border border-border bg-background p-2 text-textMuted transition-colors hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                              <Input
                                label="Unlock offset (days)"
                                type="number"
                                min="1"
                                value={tranche.offsetDays}
                                onChange={(event) => updateCustomTranche(tranche.id, 'offsetDays', event.target.value)}
                              />
                              <Input
                                label="Unlock percentage"
                                type="number"
                                min="1"
                                max="100"
                                value={tranche.percentage}
                                onChange={(event) => updateCustomTranche(tranche.id, 'percentage', event.target.value)}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-border/60 bg-surface p-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-textMuted mb-1">Resolved preview</p>
                          <p className="font-display text-2xl text-textPrimary">Custom tranche unlock curve</p>
                        </div>
                        <div className="rounded-full border border-border bg-background px-3 py-1 text-xs font-mono text-textMuted">
                          {customTrancheDesigner.releaseLabel}
                        </div>
                      </div>

                      {customTrancheDesigner.warning && (
                        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-primary/30 bg-primarySoft px-4 py-3">
                          <AlertCircle className="mt-0.5 h-4 w-4 text-primary shrink-0" />
                          <p className="text-sm font-mono text-textSecondary">{customTrancheDesigner.warning}</p>
                        </div>
                      )}

                      <StreamScheduleChart
                        shape="TRANCHE"
                        points={customTrancheDesigner.chartPoints}
                        title="Custom tranche unlock curve"
                        subtitle="Preview how your staged unlock checkpoints will look before moving into stream creation."
                        className="mb-4"
                      />

                      <div className="mb-5 rounded-2xl border border-border/60 bg-surfaceAlt p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-textMuted mb-2">Why this matters</p>
                        <p className="text-sm font-mono leading-6 text-textMuted">
                          This is the same staged unlock model used by the create flow. You are not sketching fake UI geometry here; you are shaping the bounded tranche schedule that the create page will pass to the tranche covenant payload.
                        </p>
                      </div>

                      <Button
                        onClick={launchCustomTranche}
                        disabled={Boolean(customTrancheDesigner.warning)}
                        className="w-full"
                      >
                        Open In Stream Builder
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              <div className="grid gap-5 xl:grid-cols-2">
                {groupedTemplates[key].map((template) => {
                  const Icon = getTemplateIcon(template);
                  const intervalDays = template.streamType === 'RECURRING'
                    ? Number(template.recurringIntervalDays || 0)
                    : Number(template.stepIntervalDays || 0);
                  const chartPoints = buildScheduleChartPoints({
                    streamType: template.streamType,
                    durationDays: Number(template.duration),
                    cliffDays: Number(template.cliffDays),
                    intervalDays,
                    totalOnChain: 100,
                    hybridUnlockDays: Number(template.hybridUnlockDays || 0),
                    hybridUnlockPercent: Number(template.hybridUnlockPercent || 0),
                    trancheSchedule: template.trancheOffsetsDays?.map((offsetDays, index) => {
                      const percentages = (template.tranchePercentages || []).slice(0, index + 1)
                        .reduce((sum, value) => sum + Number(value), 0);
                      return {
                        offsetDays: Number(offsetDays),
                        cumulativeAmountOnChain: percentages,
                      };
                    }),
                  });

                  return (
                    <Card key={template.id} padding="lg" className="border-border/60">
                      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-start gap-3">
                          <div className="rounded-2xl bg-primary/10 p-3">
                            <Icon className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <div className="mb-2 inline-flex rounded-full border border-border bg-background px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-textMuted">
                              {template.eyebrow}
                            </div>
                            <h3 className="font-display text-xl text-textPrimary">{template.title}</h3>
                            <p className="mt-2 text-sm font-mono leading-6 text-textMuted">
                              {template.description}
                            </p>
                          </div>
                        </div>
                        <div className="rounded-full border border-border bg-surfaceAlt px-3 py-1 text-xs font-mono text-textMuted">
                          {template.contractFamily}
                        </div>
                      </div>

                      <div className="mb-5 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border border-border/60 bg-surfaceAlt p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-textMuted mb-2">Duration</p>
                          <p className="font-display text-lg text-textPrimary">{template.duration} days</p>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-surfaceAlt p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-textMuted mb-2">Cliff</p>
                          <p className="font-display text-lg text-textPrimary">
                            {template.cliffDays === '0' ? 'None' : `${template.cliffDays} days`}
                          </p>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-surfaceAlt p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-textMuted mb-2">Cadence</p>
                          <p className="font-display text-lg text-textPrimary">
                            {template.streamType === 'LINEAR'
                              ? 'Continuous'
                              : template.streamType === 'TRANCHE'
                                ? `${template.trancheOffsetsDays?.length || 0} unlocks`
                              : `${template.recurringIntervalDays || template.stepIntervalDays} days`}
                          </p>
                        </div>
                      </div>

                      <StreamScheduleChart
                        shape={template.streamType}
                        points={chartPoints}
                        title={template.title}
                        subtitle={getTemplateSubtitle(template)}
                        className="mb-5"
                      />

                      <div className="mb-5 flex flex-wrap gap-2">
                        {template.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-border bg-background px-3 py-1 text-xs font-mono text-textMuted"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm font-mono text-textMuted">
                          Template ID: <span className="text-textPrimary">{template.id}</span>
                        </p>
                        <Button
                          onClick={() => navigate(`/streams/create?template=${template.id}`, {
                            state: daoContext ? { daoContext } : undefined,
                          })}
                        >
                          Use Template
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
