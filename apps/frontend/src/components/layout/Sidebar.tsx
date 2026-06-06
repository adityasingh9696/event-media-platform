'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Calendar, Image, Upload, Search,
  Shield, ChevronLeft, ChevronRight, Bell, User,
  Camera, Film, Star, Users, ChevronDown,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useAppStore } from '@/store/useAppStore';
import { Avatar } from '@/components/ui/Avatar';
import { useQuery } from '@tanstack/react-query';
import { clubsApi } from '@/lib/api';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: number;
  roles?: string[];
}

const navItems: NavItem[] = [
  { label: 'Gallery', href: '/', icon: <LayoutDashboard size={18} /> },
  { label: 'Events', href: '/events', icon: <Calendar size={18} /> },
  { label: 'Albums', href: '/albums', icon: <Film size={18} /> },
  { label: 'My Photos', href: '/my-photos', icon: <Camera size={18} /> },
  { label: 'Favorites', href: '/favorites', icon: <Star size={18} /> },
  { label: 'Upload', href: '/upload', icon: <Upload size={18} /> },
  { label: 'Search', href: '/search', icon: <Search size={18} /> },
  { label: 'Notifications', href: '/notifications', icon: <Bell size={18} /> },
  { label: 'Profile', href: '/profile', icon: <User size={18} /> },
];

const adminItems: NavItem[] = [
  { label: 'Admin', href: '/admin', icon: <Shield size={18} />, roles: ['admin'] },
  { label: 'Users', href: '/admin/users', icon: <Users size={18} />, roles: ['admin'] },
];

const sidebarVariants = {
  expanded: { width: 240 },
  collapsed: { width: 68 },
};

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { sidebarCollapsed, setSidebarCollapsed, selectedClubId, setSelectedClubId } = useAppStore();
  const [clubDropdownOpen, setClubDropdownOpen] = useState(false);

  const { data: clubs } = useQuery({
    queryKey: ['clubs'],
    queryFn: () => clubsApi.list().then((r) => r.data),
    enabled: !!user,
  });

  const isAdmin = user?.role === 'admin';
  const visibleNavItems = navItems.filter(
    (item) => !item.roles || item.roles.includes(user?.role || '')
  );

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <motion.aside
      initial={false}
      animate={sidebarCollapsed ? 'collapsed' : 'expanded'}
      variants={sidebarVariants}
      transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
      className="fixed left-0 top-16 bottom-0 z-30 flex flex-col bg-surface border-r border-border overflow-hidden"
    >
      {/* Collapse toggle */}
      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="absolute -right-3 top-6 w-6 h-6 rounded-full bg-surface-3 border border-border flex items-center justify-center text-muted hover:text-foreground hover:border-accent transition-all z-10 shadow-card hidden lg:flex"
        aria-label="Toggle sidebar"
      >
        {sidebarCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {/* Club selector */}
      <div className="p-3 border-b border-border/50">
        <AnimatePresence>
          {!sidebarCollapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative"
            >
              <button
                onClick={() => setClubDropdownOpen(!clubDropdownOpen)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-surface-2 border border-border hover:border-border-light transition-all text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-lg gradient-bg flex items-center justify-center shrink-0">
                    <Camera size={12} className="text-white" />
                  </div>
                  <span className="text-foreground font-medium truncate">
                    {clubs?.find((c: { id: string; name: string }) => c.id === selectedClubId)?.name || 'All Clubs'}
                  </span>
                </div>
                <ChevronDown
                  size={14}
                  className={`text-muted shrink-0 transition-transform ${clubDropdownOpen ? 'rotate-180' : ''}`}
                />
              </button>

              <AnimatePresence>
                {clubDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="absolute top-full left-0 right-0 mt-1 bg-surface-2 border border-border rounded-xl overflow-hidden z-20 shadow-card"
                  >
                    <button
                      onClick={() => { setSelectedClubId(null); setClubDropdownOpen(false); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-surface-3 transition-colors text-foreground"
                    >
                      All Clubs
                    </button>
                    {clubs?.map((club: { id: string; name: string }) => (
                      <button
                        key={club.id}
                        onClick={() => { setSelectedClubId(club.id); setClubDropdownOpen(false); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-surface-3 transition-colors text-foreground"
                      >
                        {club.name}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {sidebarCollapsed && (
          <div className="flex justify-center">
            <div className="w-8 h-8 rounded-xl gradient-bg flex items-center justify-center">
              <Camera size={14} className="text-white" />
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {visibleNavItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link key={item.href} href={item.href}>
              <motion.div
                whileHover={{ x: sidebarCollapsed ? 0 : 2 }}
                className={`
                  relative flex items-center gap-3 px-3 py-2.5 rounded-xl
                  transition-all duration-150 group cursor-pointer
                  ${active
                    ? 'bg-accent/15 text-accent-light'
                    : 'text-muted hover:text-foreground hover:bg-surface-2'
                  }
                `}
              >
                {/* Active indicator */}
                {active && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full gradient-bg"
                    transition={{ duration: 0.2 }}
                  />
                )}

                <span className={`shrink-0 ${active ? 'text-accent' : ''}`}>
                  {item.icon}
                </span>

                <AnimatePresence>
                  {!sidebarCollapsed && (
                    <motion.span
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.15 }}
                      className="text-sm font-medium whitespace-nowrap"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>

                {item.badge && !sidebarCollapsed && (
                  <span className="ml-auto text-xs bg-danger text-white px-1.5 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                )}

                {/* Tooltip for collapsed state */}
                {sidebarCollapsed && (
                  <div className="
                    absolute left-full ml-3 px-2.5 py-1.5 bg-surface-3 border border-border
                    rounded-lg text-xs text-foreground whitespace-nowrap
                    opacity-0 pointer-events-none group-hover:opacity-100
                    transition-opacity shadow-card z-50
                  ">
                    {item.label}
                  </div>
                )}
              </motion.div>
            </Link>
          );
        })}

        {/* Admin section */}
        {isAdmin && (
          <>
            <div className="pt-2 pb-1">
              {!sidebarCollapsed && (
                <p className="text-[10px] uppercase tracking-widest text-muted px-3 font-semibold">
                  Administration
                </p>
              )}
              {sidebarCollapsed && <div className="h-px bg-border mx-2" />}
            </div>
            {adminItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={`
                      relative flex items-center gap-3 px-3 py-2.5 rounded-xl
                      transition-all duration-150 group cursor-pointer
                      ${active ? 'bg-violet/15 text-violet-light' : 'text-muted hover:text-violet-light hover:bg-violet/10'}
                    `}
                  >
                    {active && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-violet" />
                    )}
                    <span className="shrink-0">{item.icon}</span>
                    <AnimatePresence>
                      {!sidebarCollapsed && (
                        <motion.span
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="text-sm font-medium whitespace-nowrap"
                        >
                          {item.label}
                        </motion.span>
                      )}
                    </AnimatePresence>
                    {sidebarCollapsed && (
                      <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-surface-3 border border-border rounded-lg text-xs text-foreground whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity shadow-card z-50">
                        {item.label}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* User info at bottom */}
      <div className="p-3 border-t border-border/50">
        <Link href={`/profile/${user?.id}`}>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-2 transition-all cursor-pointer">
            <Avatar
              src={user?.avatarUrl}
              name={user?.displayName || 'User'}
              size="sm"
              online={true}
            />
            <AnimatePresence>
              {!sidebarCollapsed && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="min-w-0"
                >
                  <p className="text-sm font-medium text-foreground truncate">
                    {user?.displayName}
                  </p>
                  <p className="text-xs text-muted truncate">@{user?.username}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Link>
      </div>
    </motion.aside>
  );
}

export default Sidebar;
