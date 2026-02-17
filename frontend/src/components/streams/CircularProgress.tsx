/**
 * Circular Progress Ring
 * Sablier-style progress indicator for stream vesting
 */

interface CircularProgressProps {
  percentage: number; // 0-100
  size?: number; // Diameter in pixels
  strokeWidth?: number;
  showLabel?: boolean;
  label?: string;
  className?: string;
}

export const CircularProgress = ({
  percentage,
  size = 200,
  strokeWidth = 12,
  showLabel = true,
  label,
  className = '',
}: CircularProgressProps) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  // Clamp percentage between 0 and 100
  const safePercentage = Math.min(100, Math.max(0, percentage));

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-surfaceAlt"
        />

        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-primary transition-all duration-500 ease-out"
        />
      </svg>

      {/* Center label */}
      {showLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold text-textPrimary">
            {safePercentage.toFixed(1)}%
          </span>
          {label && (
            <span className="text-sm text-textMuted mt-1">
              {label}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Mini Circular Progress (for cards)
 */
interface MiniCircularProgressProps {
  percentage: number;
  size?: number;
}

export const MiniCircularProgress = ({
  percentage,
  size = 60,
}: MiniCircularProgressProps) => {
  return (
    <CircularProgress
      percentage={percentage}
      size={size}
      strokeWidth={6}
      showLabel={true}
      className="flex-shrink-0"
    />
  );
};
