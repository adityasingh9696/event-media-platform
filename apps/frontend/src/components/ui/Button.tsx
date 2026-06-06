'use client';

import React, { forwardRef, ButtonHTMLAttributes } from 'react';
import { motion } from 'framer-motion';
import { cva, type VariantProps } from 'class-variance-authority';

// We'll implement cva-like logic directly since we're not installing that package
const buttonStyles = {
  base: 'inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:pointer-events-none select-none',
  variants: {
    primary: 'bg-accent-gradient text-white shadow-glow hover:shadow-glow-lg hover:scale-[1.02] active:scale-[0.98]',
    secondary: 'bg-surface-2 text-foreground border border-border hover:border-accent/50 hover:bg-surface-3',
    ghost: 'text-muted-foreground hover:text-foreground hover:bg-surface-2',
    danger: 'bg-danger text-white hover:bg-red-600 shadow-md',
    outline: 'border border-accent/50 text-accent hover:bg-accent/10',
    glass: 'glass text-foreground hover:bg-white/10',
  },
  sizes: {
    sm: 'h-8 px-3 text-xs rounded-lg',
    md: 'h-10 px-4 text-sm rounded-xl',
    lg: 'h-12 px-6 text-base rounded-xl',
    xl: 'h-14 px-8 text-lg rounded-2xl',
    icon: 'h-10 w-10 rounded-xl',
    'icon-sm': 'h-8 w-8 rounded-lg',
    'icon-lg': 'h-12 w-12 rounded-xl',
  },
};

type ButtonVariant = keyof typeof buttonStyles.variants;
type ButtonSize = keyof typeof buttonStyles.sizes;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  animate?: boolean;
}

const Spinner = ({ size = 16 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className="animate-spin"
  >
    <circle
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeDasharray="30 60"
    />
  </svg>
);

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      animate = true,
      children,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const classes = [
      buttonStyles.base,
      buttonStyles.variants[variant],
      buttonStyles.sizes[size],
      className,
    ].join(' ');

    const content = (
      <>
        {isLoading ? <Spinner size={14} /> : leftIcon}
        {children}
        {!isLoading && rightIcon}
      </>
    );

    if (animate) {
      return (
        <motion.button
          ref={ref as React.Ref<HTMLButtonElement>}
          className={classes}
          disabled={disabled || isLoading}
          whileTap={{ scale: 0.97 }}
          {...(props as React.ComponentProps<typeof motion.button>)}
        >
          {content}
        </motion.button>
      );
    }

    return (
      <button
        ref={ref}
        className={classes}
        disabled={disabled || isLoading}
        {...props}
      >
        {content}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
