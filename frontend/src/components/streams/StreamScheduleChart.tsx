import { useId } from 'react';

interface StreamScheduleChartPoint {
  x: number;
  y: number;
}

interface StreamScheduleChartProps {
  shape: 'LINEAR' | 'RECURRING' | 'STEP' | 'TRANCHE' | 'HYBRID';
  points: StreamScheduleChartPoint[];
  className?: string;
  title?: string;
  subtitle?: string;
  variant?: 'panel' | 'row';
  heightClassName?: string;
  showLegend?: boolean;
  showAxisLabels?: boolean;
}

function formatPath(points: StreamScheduleChartPoint[], width: number, height: number) {
  if (points.length === 0) return '';
  return points
    .map((point, index) => {
      const x = Math.max(0, Math.min(width, point.x * width));
      const y = Math.max(0, Math.min(height, height - point.y * height));
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
}

function formatArea(points: StreamScheduleChartPoint[], width: number, height: number) {
  if (points.length === 0) return '';
  const line = formatPath(points, width, height);
  const last = points[points.length - 1];
  const lastX = Math.max(0, Math.min(width, last.x * width));
  return `${line} L ${lastX} ${height} L 0 ${height} Z`;
}

function getShapeLabel(shape: 'LINEAR' | 'RECURRING' | 'STEP' | 'TRANCHE' | 'HYBRID') {
  switch (shape) {
    case 'LINEAR':
      return 'Continuous unlock';
    case 'RECURRING':
      return 'Fixed recurring payouts';
    case 'STEP':
      return 'Milestone unlocks';
    case 'TRANCHE':
      return 'Custom tranche vesting';
    case 'HYBRID':
      return 'Upfront unlock + linear vesting';
    default:
      return shape;
  }
}

export function StreamScheduleChart({
  shape,
  points,
  className = '',
  title,
  subtitle,
  variant = 'panel',
  heightClassName,
  showLegend = true,
  showAxisLabels = true,
}: StreamScheduleChartProps) {
  const gradientId = useId().replace(/:/g, '-');
  const width = 560;
  const height = 240;
  const linePath = formatPath(points, width, height);
  const areaPath = formatArea(points, width, height);
  const isRowVariant = variant === 'row';
  const containerClassName = isRowVariant
    ? 'rounded-2xl border border-border/60 bg-surface p-4 sm:p-5'
    : 'rounded-2xl border border-border/60 bg-surface p-5';
  const headerClassName = isRowVariant
    ? 'flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-4'
    : 'flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-5';
  const titleClassName = isRowVariant
    ? 'font-display text-lg text-textPrimary'
    : 'font-display text-xl text-textPrimary';
  const subtitleClassName = isRowVariant
    ? 'text-xs font-mono text-textMuted mt-1'
    : 'text-sm font-mono text-textMuted mt-1';
  const resolvedHeightClassName = heightClassName || (isRowVariant ? 'h-48 sm:h-56' : 'h-64');
  const lineStrokeWidth = isRowVariant ? 5 : 6;
  const pointRadius = isRowVariant ? 4 : 5;
  const pointStrokeWidth = isRowVariant ? 2.5 : 3;

  return (
    <div className={`${containerClassName} ${className}`}>
      <div className={headerClassName}>
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-textMuted mb-2">Unlock Curve</p>
          <h4 className={titleClassName}>
            {title || getShapeLabel(shape)}
          </h4>
          <p className={subtitleClassName}>
            {subtitle || 'Preview how the vested balance evolves over the full schedule.'}
          </p>
        </div>
        {showLegend && (
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-mono text-textMuted">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
            Vested balance
          </div>
        )}
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-background px-3 py-4 sm:px-4">
        <div className={`absolute inset-x-0 ${showAxisLabels ? 'top-6 bottom-10' : 'top-6 bottom-4'} px-3 sm:px-4`}>
          <div className="flex h-full flex-col justify-between">
            {[100, 75, 50, 25, 0].map((tick) => (
              <div key={tick} className="border-t border-dashed border-border/40" />
            ))}
          </div>
        </div>

        <svg
          viewBox={`0 0 ${width} ${height}`}
          className={`relative z-10 w-full ${resolvedHeightClassName}`}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.03" />
            </linearGradient>
          </defs>
          {areaPath && (
            <path
              d={areaPath}
              fill={`url(#${gradientId})`}
              className="text-accent"
            />
          )}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="currentColor"
              strokeWidth={lineStrokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              className="text-primary"
            />
          )}
          {points.map((point) => (
            <circle
              key={`${point.x}-${point.y}`}
              cx={point.x * width}
              cy={height - point.y * height}
              r={pointRadius}
              className="fill-accent stroke-surface"
              strokeWidth={pointStrokeWidth}
            />
          ))}
        </svg>

        {showAxisLabels && (
          <div className="relative z-10 mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-textMuted">
            <span>Start</span>
            <span>Schedule duration</span>
            <span>Fully vested</span>
          </div>
        )}
      </div>
    </div>
  );
}
