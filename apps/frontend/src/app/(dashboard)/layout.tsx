'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useAppStore } from '@/store/useAppStore';
import { Navbar } from '@/components/layout/Navbar';
import { Sidebar } from '@/components/layout/Sidebar';
import { Spinner } from '@/components/ui/Spinner';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();
  const { sidebarCollapsed } = useAppStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [mounted, isLoading, isAuthenticated, router]);

  if (!mounted || isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#0a0a0f] text-white">
        <div className="text-center space-y-4">
          <Spinner size="lg" />
          <p className="text-sm text-gray-400 animate-pulse font-medium">Entering PixelVault...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // will redirect in useEffect
  }

  return (
    <div className="min-h-dvh bg-[#0a0a0f] text-gray-100 selection:bg-indigo-500/30">
      <Navbar />
      <Sidebar />
      <main
        className="pt-16 min-h-dvh transition-all duration-200"
        style={{
          paddingLeft: sidebarCollapsed ? '68px' : '240px',
        }}
      >
        <div className="container mx-auto p-4 md:p-8 max-w-7xl">
          {children}
        </div>
      </main>
    </div>
  );
}
