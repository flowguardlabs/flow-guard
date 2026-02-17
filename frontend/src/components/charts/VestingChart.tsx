/**
 * VestingChart Component
 *
 * Displays vesting schedule visualization
 * - Timeline of vesting unlocks
 * - Released vs remaining amounts
 * - Next unlock date
 */

import React from 'react';
import { Card } from '../ui/Card';

interface VestingChartProps {
  totalAmount: bigint;
  releasedAmount: bigint;
  nextUnlockTimestamp: bigint;
  amountPerInterval: bigint;
  intervalSeconds: bigint;
  scheduleType: 'recurring' | 'linear' | 'step';
}

const VestingChart: React.FC<VestingChartProps> = ({
  totalAmount,
  releasedAmount,
  nextUnlockTimestamp,
  amountPerInterval,
  intervalSeconds,
  scheduleType,
}) => {
  const formatBCH = (satoshis: bigint): string => {
    return (Number(satoshis) / 100000000).toFixed(4);
  };

  const formatDate = (timestamp: bigint): string => {
    return new Date(Number(timestamp) * 1000).toLocaleDateString();
  };

  const percentReleased = totalAmount > 0n
    ? Number((releasedAmount * 100n) / totalAmount)
    : 0;

  const remainingAmount = totalAmount - releasedAmount;
  const nextUnlockDate = new Date(Number(nextUnlockTimestamp) * 1000);
  const daysUntilUnlock = Math.ceil(
    (nextUnlockDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  const scheduleTypeLabel = {
    recurring: 'Recurring Schedule',
    linear: 'Linear Vesting',
    step: 'Step Vesting',
  }[scheduleType];

  const intervalDays = Number(intervalSeconds) / (60 * 60 * 24);

  return (
    <Card>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-display font-semibold text-text-primary">
            {scheduleTypeLabel}
          </h3>
          <span className="px-3 py-1 text-sm font-medium bg-brand-100 text-brand-500 rounded-full">
            {percentReleased.toFixed(1)}% Vested
          </span>
        </div>

        {/* Progress Bar */}
        <div>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-text-secondary">Released</span>
            <span className="text-text-tertiary">
              {formatBCH(releasedAmount)} / {formatBCH(totalAmount)} BCH
            </span>
          </div>
          <div className="relative h-4 bg-surface-elevated rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-500 to-brand-400 transition-all"
              style={{ width: `${percentReleased}%` }}
            />
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm font-medium text-text-secondary mb-1">
              Remaining
            </div>
            <div className="text-xl font-display font-bold text-text-primary">
              {formatBCH(remainingAmount)} BCH
            </div>
          </div>
          <div>
            <div className="text-sm font-medium text-text-secondary mb-1">
              Per Unlock
            </div>
            <div className="text-xl font-display font-bold text-text-primary">
              {formatBCH(amountPerInterval)} BCH
            </div>
          </div>
          <div>
            <div className="text-sm font-medium text-text-secondary mb-1">
              Next Unlock
            </div>
            <div className="text-xl font-display font-bold text-brand-500">
              {daysUntilUnlock > 0 ? `${daysUntilUnlock}d` : 'Ready'}
            </div>
            <div className="text-xs text-text-tertiary mt-1">
              {formatDate(nextUnlockTimestamp)}
            </div>
          </div>
          <div>
            <div className="text-sm font-medium text-text-secondary mb-1">
              Interval
            </div>
            <div className="text-xl font-display font-bold text-text-primary">
              {intervalDays}d
            </div>
          </div>
        </div>

        {/* Timeline Preview */}
        <div className="pt-4 border-t border-stroke">
          <div className="text-sm font-medium text-text-secondary mb-3">
            Upcoming Unlocks
          </div>
          <div className="space-y-2">
            {[0, 1, 2].map((offset) => {
              const unlockTimestamp = nextUnlockTimestamp + (intervalSeconds * BigInt(offset));
              const isNext = offset === 0;

              return (
                <div
                  key={offset}
                  className={`flex items-center justify-between p-2 rounded ${
                    isNext ? 'bg-brand-50' : 'bg-surface-elevated'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        isNext ? 'bg-brand-500' : 'bg-stroke'
                      }`}
                    />
                    <span className="text-sm text-text-primary">
                      {formatDate(unlockTimestamp)}
                    </span>
                    {isNext && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-brand-500 text-white rounded">
                        Next
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-medium text-text-secondary">
                    {formatBCH(amountPerInterval)} BCH
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
};

export default VestingChart;
