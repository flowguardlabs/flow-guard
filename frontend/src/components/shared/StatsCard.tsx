/**
 * Professional Stats Card Component
 * With optional circular progress and consistent styling
 */

import { LucideIcon } from 'lucide-react';
import { Card } from '../ui/Card';
import { CircularProgress } from '../streams/CircularProgress';

interface StatsCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: {
    value: number;
    label: string;
    positive?: boolean;
  };
  progress?: {
    percentage: number;
    label?: string;
  };
  color?: 'primary' | 'accent' | 'secondary' | 'muted';
  className?: string;
}

export function StatsCard({
  label,
  value,
  subtitle,
  icon: Icon,
  trend,
  progress,
  color = 'primary',
  className = '',
}: StatsCardProps) {
  const colorClasses = {
    primary: {
      bg: 'bg-primary/10',
      text: 'text-primary',
      icon: 'text-primary',
    },
    accent: {
      bg: 'bg-accent/10',
      text: 'text-accent',
      icon: 'text-accent',
    },
    secondary: {
      bg: 'bg-secondary/10',
      text: 'text-secondary',
      icon: 'text-secondary',
    },
    muted: {
      bg: 'bg-surfaceAlt',
      text: 'text-textPrimary',
      icon: 'text-textMuted',
    },
  };

  const colors = colorClasses[color];

  return (
    <Card className={`p-4 md:p-5 lg:p-6 shadow-sm ${className}`}>
      {progress ? (
        // Card with circular progress
        <div className="flex flex-col items-center">
          <CircularProgress
            percentage={progress.percentage}
            size={120}
            strokeWidth={10}
            label={progress.label || label}
          />
          <div className="mt-3 md:mt-4 text-center">
            <p className="text-xs md:text-sm text-textMuted font-sans mb-1">{label}</p>
            <p className={`text-lg md:text-xl lg:text-2xl font-display font-bold ${colors.text}`}>
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-textMuted font-mono mt-1">{subtitle}</p>
            )}
          </div>
        </div>
      ) : (
        // Standard card layout
        <div className="flex items-start gap-3 md:gap-4">
          {Icon && (
            <div className={`shrink-0 p-2 md:p-3 rounded-full ${colors.bg}`}>
              <Icon className={`w-5 h-5 md:w-6 md:h-6 ${colors.icon}`} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between mb-1">
              <p className="min-w-0 text-xs md:text-sm text-textMuted font-sans uppercase tracking-wider break-words">
                {label}
              </p>
              {trend && (
                <span
                  className={`text-xs font-mono ${
                    trend.positive === false ? 'text-error' : 'text-accent'
                  }`}
                >
                  {trend.positive === false ? '-' : '+'}
                  {trend.value}
                </span>
              )}
            </div>
            <p className={`break-words text-xl md:text-2xl lg:text-3xl font-display font-bold ${colors.text}`}>
              {value}
            </p>
            {subtitle && (
              <p className="mt-1 break-words text-xs text-textMuted font-mono">{subtitle}</p>
            )}
            {trend?.label && (
              <p className="mt-2 break-words text-xs text-textMuted font-sans">{trend.label}</p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
