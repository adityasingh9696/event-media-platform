'use client';

import React, { forwardRef, InputHTMLAttributes, useState, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  onRightIconClick?: () => void;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      hint,
      leftIcon,
      rightIcon,
      onRightIconClick,
      className = '',
      id,
      value,
      defaultValue,
      placeholder,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const [isFocused, setIsFocused] = useState(false);
    const [hasValue, setHasValue] = useState(!!(value || defaultValue));

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setHasValue(!!e.target.value);
      props.onChange?.(e);
    };

    const isFloating = isFocused || hasValue || !!value;

    return (
      <div className={`relative flex flex-col gap-1 ${className}`}>
        <div className="relative">
          {/* Left icon */}
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted z-10">
              {leftIcon}
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            value={value}
            defaultValue={defaultValue}
            placeholder={label ? ' ' : placeholder}
            className={`
              peer w-full
              ${leftIcon ? 'pl-10' : 'pl-4'}
              ${rightIcon ? 'pr-10' : 'pr-4'}
              ${label ? 'pt-5 pb-2' : 'py-3'}
              bg-surface-2
              border ${error ? 'border-danger' : 'border-border'}
              hover:border-border-light
              focus:border-accent focus:ring-1 focus:ring-accent/30
              text-foreground placeholder-muted text-sm
              rounded-xl transition-all duration-200 outline-none
              ${error ? 'focus:border-danger focus:ring-danger/30' : ''}
            `}
            onFocus={(e) => {
              setIsFocused(true);
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              props.onBlur?.(e);
            }}
            onChange={handleChange}
            {...props}
          />

          {/* Floating label */}
          {label && (
            <label
              htmlFor={inputId}
              className={`
                absolute left-${leftIcon ? '10' : '4'} transition-all duration-200 pointer-events-none
                ${isFloating
                  ? 'top-2 text-[10px] font-semibold tracking-wider uppercase text-accent'
                  : 'top-1/2 -translate-y-1/2 text-sm text-muted'
                }
              `}
              style={{ left: leftIcon ? '2.5rem' : '1rem' }}
            >
              {label}
            </label>
          )}

          {/* Right icon */}
          {rightIcon && (
            <button
              type="button"
              onClick={onRightIconClick}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors z-10"
            >
              {rightIcon}
            </button>
          )}
        </div>

        {/* Error / Hint */}
        <AnimatePresence mode="wait">
          {error ? (
            <motion.p
              key="error"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="text-danger text-xs font-medium"
            >
              {error}
            </motion.p>
          ) : hint ? (
            <motion.p
              key="hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-muted text-xs"
            >
              {hint}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    );
  }
);

Input.displayName = 'Input';

// Textarea variant
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className = '', id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;

    return (
      <div className={`flex flex-col gap-1 ${className}`}>
        {label && (
          <label htmlFor={inputId} className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={`
            w-full px-4 py-3
            bg-surface-2 border ${error ? 'border-danger' : 'border-border'}
            hover:border-border-light focus:border-accent focus:ring-1 focus:ring-accent/30
            text-foreground placeholder-muted text-sm
            rounded-xl transition-all duration-200 outline-none resize-none
            min-h-[100px]
          `}
          {...props}
        />
        {error && <p className="text-danger text-xs font-medium">{error}</p>}
        {hint && !error && <p className="text-muted text-xs">{hint}</p>}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

// Select variant
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, className = '', id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;

    return (
      <div className={`flex flex-col gap-1 ${className}`}>
        {label && (
          <label htmlFor={inputId} className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={inputId}
          className={`
            w-full px-4 py-3
            bg-surface-2 border ${error ? 'border-danger' : 'border-border'}
            hover:border-border-light focus:border-accent focus:ring-1 focus:ring-accent/30
            text-foreground text-sm rounded-xl transition-all duration-200 outline-none
            cursor-pointer appearance-none
          `}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-surface-2">
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="text-danger text-xs font-medium">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';

export default Input;
