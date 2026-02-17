/**
 * VotingWidget Component
 *
 * Displays voting interface for casting votes
 * - Vote choice buttons (FOR / AGAINST / ABSTAIN)
 * - Token amount input
 * - Submit vote transaction
 */

import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface VotingWidgetProps {
  proposalId: string;
  onVote: (choice: 'for' | 'against' | 'abstain', amount?: bigint) => void;
}

// @ts-ignore - proposalId reserved for future use
const VotingWidget: React.FC<VotingWidgetProps> = ({ proposalId, onVote }) => {
  const [selectedChoice, setSelectedChoice] = useState<'for' | 'against' | 'abstain' | null>(null);
  const [amount, setAmount] = useState<string>('');

  const handleVote = () => {
    if (!selectedChoice) return;

    const amountBigInt = amount ? BigInt(parseFloat(amount) * 100000000) : undefined;
    onVote(selectedChoice, amountBigInt);
  };

  return (
    <div className="border-t border-stroke pt-4 space-y-4">
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Cast Your Vote
        </label>
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => setSelectedChoice('for')}
            className={`p-4 rounded-lg border-2 transition-all ${selectedChoice === 'for'
              ? 'border-success bg-success/10 text-success'
              : 'border-stroke hover:border-brand-200 text-text-secondary'
              }`}
          >
            <div className="text-2xl mb-1">👍</div>
            <div className="text-sm font-medium">FOR</div>
          </button>
          <button
            onClick={() => setSelectedChoice('against')}
            className={`p-4 rounded-lg border-2 transition-all ${selectedChoice === 'against'
              ? 'border-error bg-error/10 text-error'
              : 'border-stroke hover:border-brand-200 text-text-secondary'
              }`}
          >
            <div className="text-2xl mb-1">👎</div>
            <div className="text-sm font-medium">AGAINST</div>
          </button>
          <button
            onClick={() => setSelectedChoice('abstain')}
            className={`p-4 rounded-lg border-2 transition-all ${selectedChoice === 'abstain'
              ? 'border-warning bg-warning/10 text-warning'
              : 'border-stroke hover:border-brand-200 text-text-secondary'
              }`}
          >
            <div className="text-2xl mb-1">🤷</div>
            <div className="text-sm font-medium">ABSTAIN</div>
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Voting Power (Optional)
        </label>
        <Input
          type="number"
          placeholder="Enter token amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full"
        />
        <p className="mt-1 text-xs text-text-tertiary">
          Leave empty to use all available tokens
        </p>
      </div>

      <Button
        variant="primary"
        size="md"
        onClick={handleVote}
        disabled={!selectedChoice}
        className="w-full"
      >
        Submit Vote
      </Button>
    </div>
  );
};

export default VotingWidget;
