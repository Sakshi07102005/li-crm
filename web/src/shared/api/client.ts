import axios from 'axios';
import type { AxiosError, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

// Base API URL from env (VITE_API_URL)
const apiBase = import.meta.env.VITE_API_URL as string;

// Helper type for normalized error
export interface NormalizedError {
  status: number;
  code: string;
  message: string;
  details?: Record<string, any>;
}

// Single-flight refresh lock name
const REFRESH_LOCK = 'licrm-refresh';

// Helper to get stored tokens
function getAccessToken(): string | null {
  const token = localStorage.getItem('accessToken');
  return token && token !== 'undefined' && token !== 'null' ? token : null;
}
function getRefreshToken(): string | null {
  const token = localStorage.getItem('refreshToken');
  return token && token !== 'undefined' && token !== 'null' ? token : null;
}
function setTokens(access: string, refresh: string) {
  if (access && access !== 'undefined') localStorage.setItem('accessToken', access);
  if (refresh && refresh !== 'undefined') localStorage.setItem('refreshToken', refresh);
}
function clearTokens() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

// Create axios instance
const client: AxiosInstance = axios.create({
  baseURL: apiBase,
  withCredentials: true,
});

// Request interceptor – attach access token
client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) {
    config.headers = config.headers ?? {} as typeof config.headers;
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

// Response interceptor – handle errors / token refresh
client.interceptors.response.use(
  (response: AxiosResponse) => {
    // Successful – backend wraps data in {data: ...}
    return response;
  },
  async (error: AxiosError) => {
    const originalConfig = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (!originalConfig) return Promise.reject(error);

    // Normalise error shape
    const norm: NormalizedError = {
      status: error.response?.status ?? 0,
      code: (error.response?.data as any)?.code ?? 'UNKNOWN_ERROR',
      message: (error.response?.data as any)?.message ?? error.message,
      details: (error.response?.data as any)?.details,
    };

    // If 401 with TOKEN_EXPIRED, attempt refresh (once)
    if (norm.status === 401 && norm.code === 'TOKEN_EXPIRED' && !originalConfig._retry) {
      originalConfig._retry = true;
      try {
        await navigator.locks.request(REFRESH_LOCK, async () => {
          const freshAccess = getAccessToken();
          if (freshAccess && freshAccess !== (originalConfig.headers as any)['Authorization']?.split(' ')[1]) {
            return;
          }
          const refreshToken = getRefreshToken();
          if (!refreshToken) throw new Error('No refresh token');
          const resp = await axios.post(
            `${apiBase}/auth/refresh`,
            { refreshToken },
            { withCredentials: true },
          );
          const { accessToken: newAccess, refreshToken: newRefresh } = resp.data.data;
          setTokens(newAccess, newRefresh);
        });
        return client(originalConfig);
      } catch (e) {
        clearTokens();
        return Promise.reject(norm);
      }
    }

    // For other errors just reject with normalised shape
    return Promise.reject(norm);
  },
);

export default client;
export { getAccessToken, getRefreshToken, setTokens, clearTokens };
