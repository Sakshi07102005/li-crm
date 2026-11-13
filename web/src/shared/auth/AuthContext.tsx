import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import client, { getRefreshToken, setTokens, clearTokens } from '@/shared/api/client';
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
        const tokens = resp.data.data?.tokens || resp.data.data;
        const accessToken = tokens?.accessToken;
        const newRefreshToken = tokens?.refreshToken || refresh;
        if (accessToken) {
          setTokens(accessToken, newRefreshToken);
        }
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
    const data = resp.data.data;
    const tokens = data?.tokens || data;
    const loggedUser = data?.user;
    if (tokens?.accessToken && tokens?.refreshToken) {
      setTokens(tokens.accessToken, tokens.refreshToken);
    }
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

