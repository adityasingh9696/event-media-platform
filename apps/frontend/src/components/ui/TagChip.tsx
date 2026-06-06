'use client';

import React from 'react';
import { X } from 'lucide-react';
import { motion } from 'framer-motion';

interface TagChipProps {
  label: string;
  onRemove?: () => void;
  onClick?: () => void;
  color?: 'default' | 'accent' | 'violet' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md';
  active?: boolean;
  count?: number;
}

const colorMap = {
  default: {
    base: 'bg-surface-3 text-muted-foreground border-border hover:border-border-light',
    active: 'bg-accent/20 text-accent-light border-accent/40',
  },
  accent: {
    base: 'bg-accent/10 text-accent-light border-accent/25 hover:bg-accent/20',
    active: 'bg-accent/25 text-accent border-accent/50',
  },
  violet: {
    base: 'bg-violet/10 text-violet-light border-violet/25 hover:bg-violet/20',
    active: 'bg-violet/25 text-violet border-violet/50',
  },
  success: {
    base: 'bg-success/10 text-success border-success/25 hover:bg-success/20',
    active: 'bg-success/25 text-success border-success/50',
  },
  warning: {
    base: 'bg-warning/10 text-warning border-warning/25 hover:bg-warning/20',
    active: 'bg-warning/25 text-warning border-warning/50',
  },
  danger: {
    base: 'bg-danger/10 text-danger border-danger/25 hover:bg-danger/20',
    active: 'bg-danger/25 text-danger border-danger/50',
  },
  info: {
    base: 'bg-info/10 text-info border-info/25 hover:bg-info/20',
    active: 'bg-info/25 text-info border-info/50',
  },
};

const sizeMap = {
  sm: 'px-2 py-0.5 text-[10px] gap-1',
  md: 'px-2.5 py-1 text-xs gap-1.5',
};

export function TagChip({
  label,
  onRemove,
  onClick,
  color = 'default',
  size = 'md',
  active = false,
  count,
}: TagChipProps) {
  const colorClass = active ? colorMap[color].active : colorMap[color].base;

  return (
    <motion.span
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      className={`
        inline-flex items-center border rounded-full font-medium
        transition-all duration-150 cursor-pointer
        ${sizeMap[size]} ${colorClass}
      `}
      onClick={onClick}
    >
      <span className="truncate max-w-[120px]">#{label}</span>
      {count !== undefined && (
        <span className="opacity-60 text-[9px]">({count})</span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="hover:opacity-70 transition-opacity ml-0.5"
          aria-label={`Remove tag ${label}`}
        >
          <X size={10} />
        </button>
      )}
    </motion.span>
  );
}

// Tag input component
interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  maxTags?: number;
}

export function TagInput({
  tags,
  onChange,
  placeholder = 'Add tag...',
  maxTags = 10,
}: TagInputProps) {
  const [inputValue, setInputValue] = React.useState('');

  const addTag = (tag: string) => {
    const trimmed = tag.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (trimmed && !tags.includes(trimmed) && tags.length < maxTags) {
      onChange([...tags, trimmed]);
    }
    setInputValue('');
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <div className="flex flex-wrap gap-1.5 p-3 bg-surface-2 border border-border rounded-xl focus-within:border-accent transition-colors min-h-[44px]">
      {tags.map((tag) => (
        <TagChip
          key={tag}
          label={tag}
          color="accent"
          size="sm"
          onRemove={() => removeTag(tag)}
        />
      ))}
      {tags.length < maxTags && (
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => inputValue && addTag(inputValue)}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[100px] bg-transparent text-foreground text-xs placeholder-muted outline-none"
        />
      )}
    </div>
  );
}

export default TagChip;
