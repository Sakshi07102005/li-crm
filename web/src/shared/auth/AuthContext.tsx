import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import client, { getAccessToken, getRefreshToken, setTokens, clearTokens } from '@/shared/api/client';
import { useNavigate } from 'react-router-dom';

interface AuthContextProps {
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  user: any | null; // replace with proper User type later
}

const AuthContext = createContext<AuthContextProps | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<any | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Bootstrap – attempt single-flight refresh on load
  useEffect(() => {
    const bootstrap = async () => {
      const refresh = getRefreshToken();
      if (!refresh) return;
      try {
        const resp = await client.post('/auth/refresh', { refreshToken: refresh });
        const { accessToken, refreshToken } = resp.data.data;
        setTokens(accessToken, refreshToken);
        const meResp = await client.get('/auth/me');
        setUser(meResp.data.data);
      } catch (e) {
        clearTokens();
        setUser(null);
      }
    };
    bootstrap();
  }, []);

  const login = async (email: string, password: string) => {
    const resp = await client.post('/auth/login', { email, password });
    const { accessToken, refreshToken, user: loggedUser } = resp.data.data;
    setTokens(accessToken, refreshToken);
    setUser(loggedUser);
    queryClient.invalidateQueries(); // clear any stale data
    navigate('/dashboard');
  };

  const logout = async () => {
    const refresh = getRefreshToken();
    if (refresh) {
      try {
        await client.post('/auth/logout', { refreshToken: refresh });
      } catch (_) {}
    }
    clearTokens();
    setUser(null);
    queryClient.clear();
    navigate('/login');
  };

  const value: AuthContextProps = {
    isAuthenticated: !!user,
    login,
    logout,
    user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

