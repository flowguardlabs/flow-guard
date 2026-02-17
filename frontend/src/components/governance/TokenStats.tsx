/**
 * TokenStats Component
 *
 * Displays governance token statistics
 * - Total supply
 * - Circulating supply
 * - Locked in voting
 * - User balance and voting power
 */

import React from 'react';
import { Card } from '../ui/Card';

interface TokenStatsProps {
  totalSupply: bigint;
  circulatingSupply: bigint;
  lockedInVoting: bigint;
  userBalance: bigint;
  userVotingPower: bigint;
}

const TokenStats: React.FC<TokenStatsProps> = ({
  totalSupply,
  circulatingSupply,
  lockedInVoting,
  userBalance,
  userVotingPower,
}) => {
  const formatNumber = (value: bigint): string => {
    const num = Number(value);
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
    return num.toString();
  };

  const percentLockedInVoting = totalSupply > 0n
    ? Number((lockedInVoting * 100n) / totalSupply)
    : 0;

  const stats = [
    {
      label: 'Total Supply',
      value: formatNumber(totalSupply),
      color: 'text-text-primary',
    },
    {
      label: 'Circulating',
      value: formatNumber(circulatingSupply),
      color: 'text-brand-500',
    },
    {
      label: 'Locked in Voting',
      value: formatNumber(lockedInVoting),
      subtext: `${percentLockedInVoting.toFixed(1)}% of supply`,
      color: 'text-success',
    },
    {
      label: 'Your Balance',
      value: formatNumber(userBalance),
      color: 'text-text-primary',
    },
    {
      label: 'Your Voting Power',
      value: formatNumber(userVotingPower),
      color: 'text-brand-500',
    },
  ];

  return (
    <Card>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        {stats.map((stat, index) => (
          <div key={index} className="text-center md:text-left">
            <div className="text-sm font-medium text-text-secondary mb-1">
              {stat.label}
            </div>
            <div className={`text-2xl font-display font-bold ${stat.color}`}>
              {stat.value}
            </div>
            {stat.subtext && (
              <div className="text-xs text-text-tertiary mt-1">
                {stat.subtext}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
};

export default TokenStats;
