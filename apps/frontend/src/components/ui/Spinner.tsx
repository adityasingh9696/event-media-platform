'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface SpinnerProps {
  size?: number;
  color?: string;
  className?: string;
}

export function Spinner({ size = 24, color = '#6366f1', className = '' }: SpinnerProps) {
  return (
    <motion.div
      className={`inline-block ${className}`}
      animate={{ rotate: 360 }}
      transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="16 48"
          opacity="0.2"
        />
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="16 48"
          strokeDashoffset="-12"
        />
      </svg>
    </motion.div>
  );
}

// Full-page loading state
export function PageLoader() {
  return (
    <div className="fixed inset-0 bg-background flex flex-col items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-4"
      >
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl gradient-bg flex items-center justify-center shadow-glow-lg">
            <span className="text-white font-bold text-2xl">M</span>
          </div>
          <motion.div
            className="absolute inset-0 rounded-2xl border-2 border-accent"
            animate={{ opacity: [0.3, 1, 0.3], scale: [1, 1.15, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </div>
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full bg-accent"
              animate={{ opacity: [0.3, 1, 0.3], y: [0, -6, 0] }}
              transition={{
                duration: 0.8,
                repeat: Infinity,
                delay: i * 0.15,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
        <p className="text-muted text-sm">Loading MediaHub…</p>
      </motion.div>
    </div>
  );
}

// Skeleton block
export function Skeleton({ className = '', animate = true }: { className?: string; animate?: boolean }) {
  return (
    <div
      className={`skeleton rounded-lg ${className}`}
      style={animate ? {} : { animation: 'none', background: 'var(--surface-2)' }}
    />
  );
}

// Card skeleton
export function CardSkeleton() {
  return (
    <div className="glass-card rounded-2xl overflow-hidden p-4 space-y-3">
      <Skeleton className="w-full h-48" />
      <Skeleton className="w-3/4 h-4" />
      <Skeleton className="w-1/2 h-3" />
      <div className="flex gap-2">
        <Skeleton className="w-16 h-6 rounded-full" />
        <Skeleton className="w-20 h-6 rounded-full" />
      </div>
    </div>
  );
}

export default Spinner;
