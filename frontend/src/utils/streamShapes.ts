export type StreamShapeType = 'LINEAR' | 'RECURRING' | 'STEP' | 'TRANCHE' | 'HYBRID';

export interface StreamScheduleTemplate {
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  streamType: StreamShapeType;
  contractFamily: 'VestingCovenant' | 'RecurringPaymentCovenant' | 'TrancheVestingCovenant' | 'HybridVestingCovenant';
  duration: string;
  cliffDays: string;
  recurringIntervalDays?: string;
  stepIntervalDays?: string;
  hybridUnlockDays?: string;
  hybridUnlockPercent?: string;
  trancheOffsetsDays?: string[];
  tranchePercentages?: string[];
  refillable?: boolean;
  tags: string[];
}

export const streamScheduleTemplates: StreamScheduleTemplate[] = [
  {
    id: 'linear-open',
    streamType: 'LINEAR',
    contractFamily: 'VestingCovenant',
    eyebrow: 'Linear',
    title: 'Open vesting',
    description: 'Continuous unlock from day one for grants, contributor allocations, and broad vesting plans.',
    duration: '180',
    cliffDays: '0',
    tags: ['continuous', 'team', 'grants'],
  },
  {
    id: 'linear-cliff',
    streamType: 'LINEAR',
    contractFamily: 'VestingCovenant',
    eyebrow: 'Linear + Cliff',
    title: 'Contributor vesting',
    description: 'Continuous vesting with a 90-day cliff that releases accrued balance when the cliff lifts.',
    duration: '365',
    cliffDays: '90',
    tags: ['cliff', 'contributors', 'investors'],
  },
  {
    id: 'hybrid-upfront-linear',
    streamType: 'HYBRID',
    contractFamily: 'HybridVestingCovenant',
    eyebrow: 'Hybrid',
    title: 'Upfront unlock + linear vesting',
    description: 'Release a fixed upfront share at one checkpoint, then vest the remainder linearly to the end.',
    duration: '365',
    cliffDays: '0',
    hybridUnlockDays: '90',
    hybridUnlockPercent: '25',
    tags: ['hybrid', 'upfront', 'contributors'],
  },
  {
    id: 'hybrid-cliff-linear',
    streamType: 'HYBRID',
    contractFamily: 'HybridVestingCovenant',
    eyebrow: 'Hybrid + Cliff',
    title: 'Cliff unlock + linear tail',
    description: 'Hold value until a cliff date, unlock a larger first tranche, then vest the balance linearly through completion.',
    duration: '540',
    cliffDays: '0',
    hybridUnlockDays: '180',
    hybridUnlockPercent: '40',
    tags: ['hybrid', 'cliff', 'investors'],
  },
  {
    id: 'recurring-open-weekly',
    streamType: 'RECURRING',
    contractFamily: 'RecurringPaymentCovenant',
    eyebrow: 'Recurring + Refillable',
    title: 'Weekly runway',
    description: 'Open-ended weekly payroll that can be refilled without redeploying the stream.',
    duration: '84',
    cliffDays: '0',
    recurringIntervalDays: '7',
    refillable: true,
    tags: ['weekly', 'payroll', 'refillable'],
  },
  {
    id: 'recurring-open-monthly',
    streamType: 'RECURRING',
    contractFamily: 'RecurringPaymentCovenant',
    eyebrow: 'Recurring + Refillable',
    title: 'Monthly runway',
    description: 'Open-ended monthly payroll or grants stream with top-up runway management.',
    duration: '180',
    cliffDays: '0',
    recurringIntervalDays: '30',
    refillable: true,
    tags: ['monthly', 'runway', 'refillable'],
  },
  {
    id: 'recurring-weekly',
    streamType: 'RECURRING',
    contractFamily: 'RecurringPaymentCovenant',
    eyebrow: 'Recurring',
    title: 'Weekly payroll',
    description: 'Fixed weekly releases for contractors, allowances, and operational retainers.',
    duration: '84',
    cliffDays: '0',
    recurringIntervalDays: '7',
    tags: ['weekly', 'payroll', 'allowance'],
  },
  {
    id: 'recurring-monthly',
    streamType: 'RECURRING',
    contractFamily: 'RecurringPaymentCovenant',
    eyebrow: 'Recurring',
    title: 'Monthly payroll',
    description: 'Fixed monthly releases across a six-month window for payroll or long-running retainers.',
    duration: '180',
    cliffDays: '0',
    recurringIntervalDays: '30',
    tags: ['monthly', 'salary', 'ops'],
  },
  {
    id: 'recurring-quarterly',
    streamType: 'RECURRING',
    contractFamily: 'RecurringPaymentCovenant',
    eyebrow: 'Recurring',
    title: 'Quarterly disbursements',
    description: 'Release the same amount each quarter for board stipends, grants, and treasury disbursements.',
    duration: '360',
    cliffDays: '0',
    recurringIntervalDays: '90',
    tags: ['quarterly', 'board', 'grants'],
  },
  {
    id: 'tranche-backweighted',
    streamType: 'TRANCHE',
    contractFamily: 'TrancheVestingCovenant',
    eyebrow: 'Custom Tranches',
    title: 'Backweighted unlocks',
    description: 'Staged unlocks with increasing size as the schedule matures.',
    duration: '360',
    cliffDays: '0',
    trancheOffsetsDays: ['30', '120', '240', '360'],
    tranchePercentages: ['10', '20', '30', '40'],
    tags: ['backweighted', 'custom', 'contributors'],
  },
  {
    id: 'tranche-frontloaded',
    streamType: 'TRANCHE',
    contractFamily: 'TrancheVestingCovenant',
    eyebrow: 'Custom Tranches',
    title: 'Frontloaded release',
    description: 'Unlock a larger first tranche, then taper later releases across the full schedule.',
    duration: '240',
    cliffDays: '0',
    trancheOffsetsDays: ['30', '90', '150', '240'],
    tranchePercentages: ['40', '30', '20', '10'],
    tags: ['frontloaded', 'custom', 'launch'],
  },
  {
    id: 'tranche-cliff-staged',
    streamType: 'TRANCHE',
    contractFamily: 'TrancheVestingCovenant',
    eyebrow: 'Custom Tranches',
    title: 'Cliff then staged unlocks',
    description: 'Keep value locked through an initial cliff, then release equal staged tranches to completion.',
    duration: '360',
    cliffDays: '90',
    trancheOffsetsDays: ['90', '180', '270', '360'],
    tranchePercentages: ['25', '25', '25', '25'],
    tags: ['cliff', 'custom', 'staged'],
  },
  {
    id: 'tranche-monthly-runway',
    streamType: 'TRANCHE',
    contractFamily: 'TrancheVestingCovenant',
    eyebrow: 'Custom Tranches',
    title: 'Monthly staged runway',
    description: 'Eight monthly unlock checkpoints for more granular treasury, contributor, or grant releases.',
    duration: '240',
    cliffDays: '0',
    trancheOffsetsDays: ['30', '60', '90', '120', '150', '180', '210', '240'],
    tranchePercentages: ['10', '10', '10', '10', '12', '12', '16', '20'],
    tags: ['monthly', 'granular', 'custom'],
  },
  {
    id: 'tranche-performance-ladder',
    streamType: 'TRANCHE',
    contractFamily: 'TrancheVestingCovenant',
    eyebrow: 'Custom Tranches',
    title: 'Performance ladder',
    description: 'A seven-stage unlock ladder for milestone-heavy contributor, grants, or incentive plans.',
    duration: '420',
    cliffDays: '0',
    trancheOffsetsDays: ['30', '90', '150', '210', '270', '330', '420'],
    tranchePercentages: ['8', '10', '12', '14', '16', '18', '22'],
    tags: ['ladder', 'milestones', 'custom'],
  },
  {
    id: 'step-timelock',
    streamType: 'STEP',
    contractFamily: 'VestingCovenant',
    eyebrow: 'Milestone',
    title: 'Timelock',
    description: 'A single unlock at the end of the schedule for grants, launch reserves, or cliff-only commitments.',
    duration: '180',
    cliffDays: '0',
    stepIntervalDays: '180',
    tags: ['timelock', 'one-shot', 'reserves'],
  },
  {
    id: 'step-double-unlock',
    streamType: 'STEP',
    contractFamily: 'VestingCovenant',
    eyebrow: 'Milestone',
    title: 'Double unlock',
    description: 'Two unlock events split across the term for milestone-driven grants or staged investor releases.',
    duration: '180',
    cliffDays: '0',
    stepIntervalDays: '90',
    tags: ['double', 'milestones', 'investors'],
  },
  {
    id: 'step-monthly',
    streamType: 'STEP',
    contractFamily: 'VestingCovenant',
    eyebrow: 'Milestone',
    title: 'Monthly unlocks',
    description: 'Chunked monthly unlocks where each milestone releases a fixed allocation.',
    duration: '180',
    cliffDays: '0',
    stepIntervalDays: '30',
    tags: ['monthly', 'milestones', 'contributors'],
  },
  {
    id: 'step-quarterly-cliff',
    streamType: 'STEP',
    contractFamily: 'VestingCovenant',
    eyebrow: 'Milestone + Cliff',
    title: 'Quarterly milestones',
    description: 'Quarterly milestone unlocks with an initial cliff for launch, protocol, or treasury runway plans.',
    duration: '360',
    cliffDays: '90',
    stepIntervalDays: '90',
    tags: ['quarterly', 'cliff', 'launch'],
  },
];

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function normalizeChartPoints(points: Array<{ x: number; y: number }>) {
  const normalized: Array<{ x: number; y: number }> = [];

  for (const point of points) {
    const x = clamp01(point.x);
    const y = clamp01(point.y);
    const previous = normalized[normalized.length - 1];

    if (previous && Math.abs(previous.x - x) < 0.0001 && Math.abs(previous.y - y) < 0.0001) {
      continue;
    }

    normalized.push({ x, y });
  }

  return normalized.length > 0 ? normalized : [{ x: 0, y: 0 }, { x: 1, y: 0 }];
}

export function buildScheduleChartPoints(params: {
  streamType: StreamShapeType;
  durationDays: number;
  cliffDays: number;
  intervalDays: number;
  totalOnChain: number;
  hybridUnlockDays?: number;
  hybridUnlockPercent?: number;
  trancheSchedule?: Array<{
    offsetDays: number;
    cumulativeAmountOnChain: number;
  }>;
}) {
  const {
    streamType,
    durationDays,
    cliffDays,
    intervalDays,
    totalOnChain,
    hybridUnlockDays,
    hybridUnlockPercent,
    trancheSchedule,
  } = params;

  if (!durationDays || durationDays <= 0) {
    return [{ x: 0, y: 0 }, { x: 1, y: 0 }];
  }

  if (streamType === 'LINEAR') {
    if (cliffDays > 0 && cliffDays < durationDays) {
      const cliffX = cliffDays / durationDays;
      const cliffY = totalOnChain > 0
        ? Math.floor((totalOnChain * cliffDays) / durationDays) / totalOnChain
        : cliffX;
      return normalizeChartPoints([
        { x: 0, y: 0 },
        { x: cliffX, y: 0 },
        { x: cliffX, y: cliffY },
        { x: 1, y: 1 },
      ]);
    }

    return [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  }

  if (streamType === 'HYBRID') {
    if (!hybridUnlockDays || hybridUnlockDays <= 0 || hybridUnlockDays >= durationDays) {
      return [{ x: 0, y: 0 }, { x: 1, y: 0 }];
    }
    const unlockX = hybridUnlockDays / durationDays;
    const unlockY = Math.max(0, Math.min(1, (hybridUnlockPercent || 0) / 100));
    return normalizeChartPoints([
      { x: 0, y: 0 },
      { x: unlockX, y: 0 },
      { x: unlockX, y: unlockY },
      { x: 1, y: 1 },
    ]);
  }

  if (!intervalDays || intervalDays <= 0) {
    return [{ x: 0, y: 0 }, { x: 1, y: 0 }];
  }

  const releaseCount = Math.floor(durationDays / intervalDays);
  if (releaseCount < 1) {
    return [{ x: 0, y: 0 }, { x: 1, y: 0 }];
  }

  if (streamType === 'RECURRING') {
    const fullHorizon = cliffDays + durationDays;
    const points = [{ x: 0, y: 0 }];

    if (cliffDays > 0) {
      points.push({ x: cliffDays / fullHorizon, y: 0 });
    }

    for (let index = 1; index <= releaseCount; index += 1) {
      points.push({
        x: (cliffDays + index * intervalDays) / fullHorizon,
        y: index / releaseCount,
      });
    }

    return normalizeChartPoints(points);
  }

  if (streamType === 'TRANCHE') {
    if (!trancheSchedule || trancheSchedule.length === 0) {
      return [{ x: 0, y: 0 }, { x: 1, y: 0 }];
    }

    const points = [{ x: 0, y: 0 }];
    for (const tranche of trancheSchedule) {
      const x = tranche.offsetDays / durationDays;
      const y = totalOnChain > 0
        ? tranche.cumulativeAmountOnChain / totalOnChain
        : 0;
      points.push({ x, y: points[points.length - 1].y });
      points.push({ x, y });
    }
    return normalizeChartPoints(points);
  }

  const stepAmountOnChain = totalOnChain > 0
    ? Math.floor((totalOnChain + releaseCount - 1) / releaseCount)
    : 1;
  const cliffCompletedSteps = cliffDays > 0
    ? Math.min(releaseCount, Math.floor(cliffDays / intervalDays))
    : 0;
  const points = [{ x: 0, y: 0 }];

  if (cliffDays > 0) {
    const cliffY = totalOnChain > 0
      ? Math.min(cliffCompletedSteps * stepAmountOnChain, totalOnChain) / totalOnChain
      : cliffCompletedSteps / releaseCount;
    points.push({ x: cliffDays / durationDays, y: 0 });
    if (cliffY > 0) {
      points.push({ x: cliffDays / durationDays, y: cliffY });
    }
  }

  for (let index = Math.max(1, cliffCompletedSteps + 1); index <= releaseCount; index += 1) {
    const y = totalOnChain > 0
      ? Math.min(index * stepAmountOnChain, totalOnChain) / totalOnChain
      : index / releaseCount;
    points.push({
      x: (index * intervalDays) / durationDays,
      y,
    });
  }

  return normalizeChartPoints(points);
}

export function getStreamScheduleTemplateById(templateId?: string | null) {
  return streamScheduleTemplates.find((template) => template.id === templateId) ?? null;
}

export function getStreamScheduleTemplateLabel(templateId?: string | null) {
  return getStreamScheduleTemplateById(templateId)?.title ?? null;
}

export function matchesStreamScheduleTemplate(
  params: {
    streamType: StreamShapeType;
    duration: string;
    cliffDays: string;
    recurringIntervalDays?: string;
    stepIntervalDays?: string;
    hybridUnlockDays?: string;
    hybridUnlockPercent?: string;
    trancheOffsetsDays?: string[];
    tranchePercentages?: string[];
    refillable?: boolean;
  },
  template: StreamScheduleTemplate,
) {
  if (
    params.streamType !== template.streamType ||
    params.duration !== template.duration ||
    params.cliffDays !== template.cliffDays
  ) {
    return false;
  }

  if (template.streamType === 'RECURRING') {
    return (
      params.recurringIntervalDays === template.recurringIntervalDays &&
      Boolean(params.refillable) === Boolean(template.refillable)
    );
  }

  if (template.streamType === 'STEP') {
    return params.stepIntervalDays === template.stepIntervalDays;
  }

  if (template.streamType === 'HYBRID') {
    return (
      params.hybridUnlockDays === template.hybridUnlockDays
      && params.hybridUnlockPercent === template.hybridUnlockPercent
    );
  }

  if (template.streamType === 'TRANCHE') {
    return (
      JSON.stringify(params.trancheOffsetsDays || []) === JSON.stringify(template.trancheOffsetsDays || [])
      && JSON.stringify(params.tranchePercentages || []) === JSON.stringify(template.tranchePercentages || [])
    );
  }

  return true;
}
