/**
 * QuorumProgress Component
 *
 * Displays quorum progress visualization
 * - Current votes vs quorum threshold
 * - Progress bar
 * - Status indicator
 */

import React from 'react';

interface QuorumProgressProps {
  currentVotes: bigint;
  quorumThreshold: bigint;
}

const QuorumProgress: React.FC<QuorumProgressProps> = ({
  currentVotes,
  quorumThreshold,
}) => {
  const progress = quorumThreshold > 0n
    ? Math.min(Number((currentVotes * 100n) / quorumThreshold), 100)
    : 0;
  const quorumMet = currentVotes >= quorumThreshold;

  const formatNumber = (value: bigint): string => {
    const num = Number(value);
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium text-text-secondary">Quorum</span>
          {quorumMet ? (
            <span className="px-2 py-0.5 text-xs font-medium bg-success/10 text-success rounded-full">
              Met
            </span>
          ) : (
            <span className="px-2 py-0.5 text-xs font-medium bg-warning/10 text-warning rounded-full">
              Not Met
            </span>
          )}
        </div>
        <span className="text-text-tertiary">
          {formatNumber(currentVotes)} / {formatNumber(quorumThreshold)}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="relative h-2 bg-surface-elevated rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            quorumMet ? 'bg-success' : 'bg-brand-500'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="text-xs text-text-tertiary">
        {quorumMet
          ? 'Quorum threshold reached'
          : `${(100 - progress).toFixed(1)}% more votes needed for quorum`}
      </div>
    </div>
  );
};

export default QuorumProgress;
