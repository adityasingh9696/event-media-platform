'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { authApi } from './api';
import toast from 'react-hot-toast';

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  role: 'user' | 'club_member' | 'club_admin' | 'admin';
  clubId?: string;
  createdAt: string;
  uploadCount?: number;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (data: {
    displayName: string;
    username: string;
    email: string;
    password: string;
  }) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        setUser(null);
        return;
      }
      const { data } = await authApi.me();
      setUser(data);
      localStorage.setItem('user', JSON.stringify(data));
    } catch {
      setUser(null);
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      try {
        // Extract query parameters for OAuth redirection
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          const urlToken = params.get('token');
          const urlRefresh = params.get('refreshToken');
          if (urlToken && urlRefresh) {
            localStorage.setItem('access_token', urlToken);
            localStorage.setItem('refresh_token', urlRefresh);
            
            // Clear query parameters from address bar silently
            const url = new URL(window.location.href);
            url.searchParams.delete('token');
            url.searchParams.delete('refreshToken');
            window.history.replaceState({}, document.title, url.pathname + url.search);
            
            try {
              const { data } = await authApi.me();
              setUser(data);
              localStorage.setItem('user', JSON.stringify(data));
              toast.success(`Welcome back, ${data.displayName}! 👋`);
              setIsLoading(false);
              return;
            } catch (err) {
              console.error('Failed to fetch user during OAuth callback:', err);
            }
          }
        }

        const cached = localStorage.getItem('user');
        const token = localStorage.getItem('access_token');
        if (cached && token) {
          setUser(JSON.parse(cached));
          // Verify token is still valid
          await refreshUser();
        }
      } catch {
        // Ignore init errors
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await authApi.login(email, password);
    const { accessToken, refreshToken, user: userData } = data;
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
    toast.success(`Welcome back, ${userData.displayName}! 👋`);
  }, []);

  const register = useCallback(
    async (registerData: {
      displayName: string;
      username: string;
      email: string;
      password: string;
    }) => {
      const { data } = await authApi.register(registerData);
      const { accessToken, refreshToken, user: userData } = data;
      localStorage.setItem('access_token', accessToken);
      localStorage.setItem('refresh_token', refreshToken);
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
      toast.success('Account created! Welcome to MediaHub! 🎉');
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore logout API errors
    } finally {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
      setUser(null);
      toast.success('Logged out successfully');
    }
  }, []);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    register,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
