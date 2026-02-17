import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  hover?: boolean;
}

/**
 * Card component following FlowGuard Sage palette design system
 *
 * DESIGN RULES:
 * - Uses ONLY Sage palette via Tailwind tokens
 * - Background: surface (brand50 #F1F3E0)
 * - Border: border (brand300 #A1BC98)
 * - Hover: shadow increase + border darkens to borderHover (brand700 #778873)
 * - NO hardcoded colors, NO card-base class (deleted with design-system.css)
 */
export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  padding = 'md',
  hover = false,
}) => {
  const baseStyles =
    'bg-surface border border-border rounded-lg shadow-sm ' +
    'transition-all duration-200';

  const paddings = {
    none: 'p-0',
    sm: 'p-3 md:p-4',
    md: 'p-4 md:p-6',
    lg: 'p-5 md:p-8',
    xl: 'p-6 md:p-10',
  };

  const hoverStyles = hover
    ? 'hover:shadow-md hover:border-borderHover hover:-translate-y-0.5'
    : '';

  return (
    <div className={`${baseStyles} ${paddings[padding]} ${hoverStyles} ${className}`}>
      {children}
    </div>
  );
};
