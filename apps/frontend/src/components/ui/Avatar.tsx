'use client';

import React from 'react';
import Image from 'next/image';

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function stringToColor(str: string): string {
  const colors = [
    '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
    '#10b981', '#3b82f6', '#ef4444', '#14b8a6',
    '#f97316', '#84cc16',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

interface AvatarProps {
  src?: string | null;
  alt?: string;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  ring?: boolean;
  online?: boolean;
}

const sizeMap = {
  xs: { container: 'w-6 h-6', text: 'text-[9px]', online: 'w-2 h-2' },
  sm: { container: 'w-8 h-8', text: 'text-[10px]', online: 'w-2 h-2' },
  md: { container: 'w-10 h-10', text: 'text-xs', online: 'w-2.5 h-2.5' },
  lg: { container: 'w-12 h-12', text: 'text-sm', online: 'w-3 h-3' },
  xl: { container: 'w-16 h-16', text: 'text-lg', online: 'w-3.5 h-3.5' },
  '2xl': { container: 'w-24 h-24', text: 'text-2xl', online: 'w-4 h-4' },
};

export function Avatar({
  src,
  alt = 'Avatar',
  name = 'User',
  size = 'md',
  className = '',
  ring = false,
  online,
}: AvatarProps) {
  const { container, text, online: onlineSize } = sizeMap[size];
  const bgColor = stringToColor(name);

  return (
    <div className={`relative inline-flex shrink-0 ${className}`}>
      <div
        className={`
          ${container} rounded-full overflow-hidden
          ${ring ? 'ring-2 ring-accent ring-offset-2 ring-offset-background' : ''}
        `}
      >
        {src ? (
          <Image
            src={src}
            alt={alt}
            width={96}
            height={96}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className={`w-full h-full flex items-center justify-center font-bold ${text}`}
            style={{ background: bgColor }}
          >
            <span className="text-white">{getInitials(name)}</span>
          </div>
        )}
      </div>

      {/* Online indicator */}
      {online !== undefined && (
        <span
          className={`
            absolute bottom-0 right-0 ${onlineSize} rounded-full border-2 border-background
            ${online ? 'bg-success' : 'bg-muted'}
          `}
        />
      )}
    </div>
  );
}

// Avatar group
interface AvatarGroupProps {
  users: Array<{ id: string; name: string; avatarUrl?: string }>;
  max?: number;
  size?: AvatarProps['size'];
}

export function AvatarGroup({ users, max = 3, size = 'sm' }: AvatarGroupProps) {
  const visible = users.slice(0, max);
  const overflow = users.length - max;

  return (
    <div className="flex -space-x-2">
      {visible.map((user) => (
        <Avatar
          key={user.id}
          src={user.avatarUrl}
          name={user.name}
          alt={user.name}
          size={size}
          className="ring-2 ring-background"
        />
      ))}
      {overflow > 0 && (
        <div
          className={`
            ${sizeMap[size].container} rounded-full
            bg-surface-3 border-2 border-background
            flex items-center justify-center
            text-muted-foreground font-semibold ${sizeMap[size].text}
          `}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}

export default Avatar;
