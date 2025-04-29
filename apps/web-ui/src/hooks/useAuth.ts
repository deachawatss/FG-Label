import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import api from "@/lib/api";

interface User {
  id: string;
  username: string;
  role: string;
}

export interface BatchDto {
  batchNo: string;
  productKey: string | null;
  customerKey: string | null;
  productionDate?: string | null;
}

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const logout = useCallback(() => {
    localStorage.removeItem('jwt');
    setUser(null);
    setIsAuthenticated(false);
    router.replace('/login');
  }, [router]);

  useEffect(() => {
    const checkAuth = async () => {
      setLoading(true);
      const jwt = localStorage.getItem('jwt');
      if (jwt) {
        api.defaults.headers.common.Authorization = `Bearer ${jwt}`;
        try {
          const response = await api.get('/api/me');
          setUser(response.data);
          setIsAuthenticated(true);
        } catch (error) {
          console.error('Auth check failed:', error);
          logout();
        }
      } else {
        setIsAuthenticated(false);
        setUser(null);
      }
      setLoading(false);
    };
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = (token: string, userData: User) => {
    localStorage.setItem('jwt', token);
    setUser(userData);
    setIsAuthenticated(true);
    router.replace('/batch-search');
  };

  const refreshToken = async () => {
    try {
      const token = localStorage.getItem('jwt');
      if (!token) {
        throw new Error('No token found');
      }

      const response = await api.post('/api/auth/refresh');
      localStorage.setItem('jwt', response.data.token);
      return response.data.token;
    } catch (error) {
      console.error('Error refreshing token:', error);
      logout();
      throw error;
    }
  };

  return {
    isAuthenticated,
    user,
    loading,
    login,
    logout,
    refreshToken
  };
} 