/**
 * GuardrailsChart Component
 *
 * Displays treasury guardrails visualization
 * - Period cap usage
 * - Category budget breakdown
 * - Recipient cap status
 */

import React from 'react';
import { Card } from '../ui/Card';

interface GuardrailsChartProps {
  periodCap: bigint;
  spentThisPeriod: bigint;
  categoryBudgets: Array<{
    label: string;
    budget: bigint;
    spent: bigint;
  }>;
}

const GuardrailsChart: React.FC<GuardrailsChartProps> = ({
  periodCap,
  spentThisPeriod,
  categoryBudgets,
}) => {
  const formatBCH = (satoshis: bigint): string => {
    return (Number(satoshis) / 100000000).toFixed(4);
  };

  const periodCapPercent = periodCap > 0n
    ? Number((spentThisPeriod * 100n) / periodCap)
    : 0;

  return (
    <Card>
      <h3 className="text-lg font-display font-semibold text-text-primary mb-4">
        Spending Guardrails
      </h3>

      {/* Period Cap */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="font-medium text-text-secondary">Period Cap</span>
          <span className="text-text-tertiary">
            {formatBCH(spentThisPeriod)} / {formatBCH(periodCap)} BCH
          </span>
        </div>
        <div className="relative h-3 bg-surface-elevated rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              periodCapPercent >= 90
                ? 'bg-error'
                : periodCapPercent >= 75
                ? 'bg-warning'
                : 'bg-success'
            }`}
            style={{ width: `${Math.min(periodCapPercent, 100)}%` }}
          />
        </div>
        <div className="text-xs text-text-tertiary mt-1">
          {periodCapPercent.toFixed(1)}% used this period
        </div>
      </div>

      {/* Category Budgets */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-text-secondary">
          Category Budgets
        </h4>
        {categoryBudgets.map((category, index) => {
          const percent = category.budget > 0n
            ? Number((category.spent * 100n) / category.budget)
            : 0;

          return (
            <div key={index}>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-text-primary">{category.label}</span>
                <span className="text-text-tertiary">
                  {formatBCH(category.spent)} / {formatBCH(category.budget)} BCH
                </span>
              </div>
              <div className="relative h-2 bg-surface-elevated rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    percent >= 90
                      ? 'bg-error'
                      : percent >= 75
                      ? 'bg-warning'
                      : 'bg-brand-500'
                  }`}
                  style={{ width: `${Math.min(percent, 100)}%` }}
                />
              </div>
              <div className="text-xs text-text-tertiary mt-1">
                {percent.toFixed(1)}% used • {formatBCH(category.budget - category.spent)} BCH remaining
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default GuardrailsChart;
