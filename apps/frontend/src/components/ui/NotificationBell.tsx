'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Heart, MessageCircle, Tag, Upload, Info, Check, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { useAppStore, Notification } from '@/store/useAppStore';
import { Avatar } from './Avatar';

const notifIcons: Record<Notification['type'], React.ReactNode> = {
  like: <Heart size={14} className="text-pink-400" />,
  comment: <MessageCircle size={14} className="text-blue-400" />,
  tag: <Tag size={14} className="text-violet-400" />,
  upload: <Upload size={14} className="text-green-400" />,
  system: <Info size={14} className="text-yellow-400" />,
};

const notifIconBg: Record<Notification['type'], string> = {
  like: 'bg-pink-500/15',
  comment: 'bg-blue-500/15',
  tag: 'bg-violet-500/15',
  upload: 'bg-green-500/15',
  system: 'bg-yellow-500/15',
};

interface NotificationBellProps {
  className?: string;
}

export function NotificationBell({ className = '' }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { unreadCount, notifications, markNotificationRead, markAllRead } = useAppStore();

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Bell button */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl text-muted hover:text-foreground hover:bg-surface-2 transition-all"
        aria-label={`Notifications (${unreadCount} unread)`}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-danger text-white text-[10px] font-bold rounded-full border-2 border-background px-1"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </motion.span>
        )}
      </motion.button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -8 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 top-12 w-80 glass-card rounded-2xl overflow-hidden border border-white/8 shadow-[0_20px_60px_rgba(0,0,0,0.6)] z-50"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <h3 className="font-semibold text-sm">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-accent hover:text-accent-light flex items-center gap-1 transition-colors"
                >
                  <Check size={12} />
                  Mark all read
                </button>
              )}
            </div>

            {/* Notification list */}
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                  <Bell size={32} className="text-muted mb-3 opacity-50" />
                  <p className="text-sm text-muted">No notifications yet</p>
                  <p className="text-xs text-muted mt-1">We'll notify you when something happens</p>
                </div>
              ) : (
                notifications.slice(0, 8).map((notif) => (
                  <NotifItem
                    key={notif.id}
                    notification={notif}
                    onRead={() => {
                      markNotificationRead(notif.id);
                    }}
                    onClose={() => setIsOpen(false)}
                  />
                ))
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="border-t border-border/50 p-2">
                <Link
                  href="/notifications"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-center gap-1 text-xs text-accent hover:text-accent-light py-2 rounded-xl hover:bg-accent/10 transition-all"
                >
                  View all notifications
                  <ChevronRight size={12} />
                </Link>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NotifItem({
  notification,
  onRead,
  onClose,
}: {
  notification: Notification;
  onRead: () => void;
  onClose: () => void;
}) {
  const content = (
    <div
      onClick={() => {
        onRead();
        if (notification.link) onClose();
      }}
      className={`
        flex items-start gap-3 px-4 py-3 cursor-pointer
        hover:bg-white/4 transition-colors
        ${!notification.isRead ? 'bg-accent/5' : ''}
      `}
    >
      <div className="flex-shrink-0 flex items-center gap-2">
        {notification.actorAvatar ? (
          <Avatar
            src={notification.actorAvatar}
            name={notification.actorName || 'User'}
            size="sm"
          />
        ) : (
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${notifIconBg[notification.type]}`}>
            {notifIcons[notification.type]}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground leading-relaxed">
          {notification.title}
        </p>
        <p className="text-xs text-muted mt-0.5 truncate">{notification.message}</p>
        <p className="text-[10px] text-muted mt-1">
          {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
        </p>
      </div>

      {!notification.isRead && (
        <span className="flex-shrink-0 w-2 h-2 rounded-full bg-accent mt-1" />
      )}
    </div>
  );

  if (notification.link) {
    return (
      <Link href={notification.link} className="block" onClick={onClose}>
        {content}
      </Link>
    );
  }

  return content;
}

export default NotificationBell;
