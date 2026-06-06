'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Moon, Sun, Menu, X, LogOut, User, Settings,
  ChevronDown, Upload, Zap, Command,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAuth } from '@/lib/auth-context';
import { useAppStore } from '@/store/useAppStore';
import { Avatar } from '@/components/ui/Avatar';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { Button } from '@/components/ui/Button';

const Logo = () => (
  <Link href="/" className="flex items-center gap-2 shrink-0">
    <div className="w-8 h-8 rounded-xl gradient-bg flex items-center justify-center shadow-glow">
      <Zap size={16} className="text-white" />
    </div>
    <span className="gradient-text font-bold text-xl tracking-tight hidden sm:block">
      MediaHub
    </span>
  </Link>
);

export function Navbar({ onMobileMenuToggle }: { onMobileMenuToggle?: () => void }) {
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { sidebarCollapsed, setSidebarCollapsed } = useAppStore();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle scroll for glass effect
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Ctrl+K shortcut for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchRef.current?.focus(), 100);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close user menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
      setSearchQuery('');
    }
  };

  return (
    <header
      className={`
        fixed top-0 left-0 right-0 z-40 h-16
        transition-all duration-300
        ${isScrolled ? 'glass-nav shadow-[0_4px_24px_rgba(0,0,0,0.4)]' : 'bg-background/90 border-b border-border/50'}
      `}
    >
      <div className="h-full flex items-center justify-between px-4 lg:px-6 gap-4">
        {/* Left: Hamburger + Logo */}
        <div className="flex items-center gap-3">
          {isAuthenticated && (
            <button
              onClick={() => {
                setSidebarCollapsed(!sidebarCollapsed);
                onMobileMenuToggle?.();
              }}
              className="p-2 rounded-xl text-muted hover:text-foreground hover:bg-surface-2 transition-all lg:hidden"
              aria-label="Toggle menu"
            >
              <Menu size={20} />
            </button>
          )}
          <Logo />
        </div>

        {/* Center: Search bar */}
        <div className="flex-1 max-w-lg hidden md:block">
          {isAuthenticated && (
            <form onSubmit={handleSearch}>
              <div
                className={`
                  relative flex items-center gap-2
                  bg-surface-2 border rounded-xl px-3 h-10
                  transition-all duration-200
                  ${searchOpen ? 'border-accent ring-1 ring-accent/30' : 'border-border hover:border-border-light'}
                `}
              >
                <Search size={15} className="text-muted shrink-0" />
                <input
                  ref={searchRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setSearchOpen(true)}
                  onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
                  placeholder="Search photos, events, albums…"
                  className="flex-1 bg-transparent text-sm text-foreground placeholder-muted outline-none"
                />
                <div className="hidden lg:flex items-center gap-1 shrink-0">
                  <kbd className="flex items-center gap-0.5 px-1.5 py-0.5 bg-surface-3 border border-border rounded text-[10px] text-muted font-mono">
                    <Command size={9} />K
                  </kbd>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1">
          {/* Mobile search */}
          {isAuthenticated && (
            <button
              className="md:hidden p-2 rounded-xl text-muted hover:text-foreground hover:bg-surface-2 transition-all"
              onClick={() => router.push('/search')}
              aria-label="Search"
            >
              <Search size={20} />
            </button>
          )}

          {/* Theme toggle */}
          {mounted && (
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-xl text-muted hover:text-foreground hover:bg-surface-2 transition-all"
              aria-label="Toggle theme"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={theme}
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                </motion.div>
              </AnimatePresence>
            </button>
          )}

          {isAuthenticated ? (
            <>
              {/* Notifications */}
              <NotificationBell />

              {/* Upload shortcut */}
              <Link href="/upload">
                <Button variant="primary" size="icon-sm" className="hidden sm:flex">
                  <Upload size={15} />
                </Button>
              </Link>

              {/* User menu */}
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-xl hover:bg-surface-2 transition-all"
                  aria-label="User menu"
                >
                  <Avatar
                    src={user?.avatarUrl}
                    name={user?.displayName || 'User'}
                    size="sm"
                  />
                  <ChevronDown
                    size={14}
                    className={`text-muted transition-transform hidden sm:block ${userMenuOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                <AnimatePresence>
                  {userMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -8 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-12 w-56 glass-card rounded-2xl border border-white/8 shadow-[0_20px_60px_rgba(0,0,0,0.6)] z-50 overflow-hidden"
                    >
                      {/* User info */}
                      <div className="px-4 py-3 border-b border-border/50">
                        <p className="font-semibold text-sm text-foreground">{user?.displayName}</p>
                        <p className="text-xs text-muted">@{user?.username}</p>
                        {user?.role !== 'user' && (
                          <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-accent/15 text-accent-light text-[10px] font-medium rounded-full border border-accent/25">
                            {user?.role.replace('_', ' ')}
                          </span>
                        )}
                      </div>

                      {/* Menu items */}
                      <div className="p-1.5">
                        {[
                          { icon: <User size={14} />, label: 'Profile', href: `/profile/${user?.id}` },
                          { icon: <Settings size={14} />, label: 'Settings', href: '/settings' },
                          { icon: <Upload size={14} />, label: 'Upload Media', href: '/upload' },
                        ].map((item) => (
                          <Link
                            key={item.label}
                            href={item.href}
                            onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-all"
                          >
                            {item.icon}
                            {item.label}
                          </Link>
                        ))}

                        {user?.role === 'admin' && (
                          <Link
                            href="/admin"
                            onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-accent-light hover:bg-accent/10 transition-all"
                          >
                            <Zap size={14} />
                            Admin Panel
                          </Link>
                        )}
                      </div>

                      <div className="p-1.5 border-t border-border/50">
                        <button
                          onClick={() => {
                            setUserMenuOpen(false);
                            logout();
                          }}
                          className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-danger hover:bg-danger/10 transition-all w-full"
                        >
                          <LogOut size={14} />
                          Sign out
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login">
                <Button variant="ghost" size="sm">Sign in</Button>
              </Link>
              <Link href="/register">
                <Button variant="primary" size="sm">Get started</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Navbar;
