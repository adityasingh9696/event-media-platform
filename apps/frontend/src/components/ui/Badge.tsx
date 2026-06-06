'use client';

import React from 'react';

type BadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'accent'
  | 'violet'
  | 'ghost'
  | 'outline';

type BadgeCategory =
  | 'sports'
  | 'music'
  | 'tech'
  | 'art'
  | 'academic'
  | 'cultural'
  | 'social'
  | 'other';

const categoryColors: Record<BadgeCategory, string> = {
  sports: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  music: 'bg-pink-500/15 text-pink-400 border-pink-500/25',
  tech: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  art: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
  academic: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  cultural: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
  social: 'bg-teal-500/15 text-teal-400 border-teal-500/25',
  other: 'bg-gray-500/15 text-gray-400 border-gray-500/25',
};

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-surface-2 text-muted-foreground border-border',
  success: 'bg-success/15 text-success border-success/25',
  warning: 'bg-warning/15 text-warning border-warning/25',
  danger: 'bg-danger/15 text-danger border-danger/25',
  info: 'bg-info/15 text-info border-info/25',
  accent: 'bg-accent/15 text-accent-light border-accent/25',
  violet: 'bg-violet/15 text-violet-light border-violet/25',
  ghost: 'bg-transparent text-muted-foreground border-transparent',
  outline: 'bg-transparent text-foreground border-border',
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  category?: BadgeCategory;
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
  className?: string;
}

const sizeStyles = {
  sm: 'px-1.5 py-0.5 text-[10px] rounded-md',
  md: 'px-2.5 py-1 text-xs rounded-lg',
  lg: 'px-3 py-1.5 text-sm rounded-lg',
};

export function Badge({
  children,
  variant = 'default',
  category,
  size = 'md',
  dot = false,
  className = '',
}: BadgeProps) {
  const colorClass = category
    ? categoryColors[category]
    : variantStyles[variant];

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 font-medium border
        ${sizeStyles[size]}
        ${colorClass}
        ${className}
      `}
    >
      {dot && (
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      )}
      {children}
    </span>
  );
}

export default Badge;
