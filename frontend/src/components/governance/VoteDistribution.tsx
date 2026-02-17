/**
 * VoteDistribution Component
 *
 * Displays vote distribution visualization
 * - FOR / AGAINST / ABSTAIN vote counts
 * - Visual bar chart
 * - Percentage breakdown
 */

import React from 'react';

interface VoteDistributionProps {
  votesFor: bigint;
  votesAgainst: bigint;
  votesAbstain: bigint;
}

const VoteDistribution: React.FC<VoteDistributionProps> = ({
  votesFor,
  votesAgainst,
  votesAbstain,
}) => {
  const total = votesFor + votesAgainst + votesAbstain;
  const forPercent = total > 0n ? Number((votesFor * 100n) / total) : 0;
  const againstPercent = total > 0n ? Number((votesAgainst * 100n) / total) : 0;
  const abstainPercent = total > 0n ? Number((votesAbstain * 100n) / total) : 0;

  const formatNumber = (value: bigint): string => {
    const num = Number(value);
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-text-secondary">Vote Distribution</span>
        <span className="text-text-tertiary">{formatNumber(total)} total votes</span>
      </div>

      {/* Visual Bar */}
      <div className="flex h-3 rounded-full overflow-hidden bg-surface-elevated">
        {forPercent > 0 && (
          <div
            className="bg-success"
            style={{ width: `${forPercent}%` }}
            title={`FOR: ${forPercent}%`}
          />
        )}
        {againstPercent > 0 && (
          <div
            className="bg-error"
            style={{ width: `${againstPercent}%` }}
            title={`AGAINST: ${againstPercent}%`}
          />
        )}
        {abstainPercent > 0 && (
          <div
            className="bg-warning"
            style={{ width: `${abstainPercent}%` }}
            title={`ABSTAIN: ${abstainPercent}%`}
          />
        )}
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-success" />
          <div>
            <div className="font-medium text-success">{forPercent}%</div>
            <div className="text-text-tertiary">{formatNumber(votesFor)} FOR</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-error" />
          <div>
            <div className="font-medium text-error">{againstPercent}%</div>
            <div className="text-text-tertiary">{formatNumber(votesAgainst)} AGAINST</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-warning" />
          <div>
            <div className="font-medium text-warning">{abstainPercent}%</div>
            <div className="text-text-tertiary">{formatNumber(votesAbstain)} ABSTAIN</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoteDistribution;
