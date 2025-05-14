import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../lib/api';
import { AuthContextType, User } from '../types';

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setLoading(false);
      return;
    }
    
    const storedToken = localStorage.getItem('token');
    const storedUsername = localStorage.getItem('username');
    
    if (storedToken && storedUsername) {
      setToken(storedToken);
      setUsername(storedUsername);
      setIsAuthenticating(true);
      api.get('/me')
        .then((response) => {
          setUser(response.data);
          setError(null);
        })
        .catch((err) => {
          clearAuth();
          setError('ไม่สามารถยืนยันตัวตนได้: ' + (err.response?.data?.message || err.message));
        })
        .finally(() => {
          setLoading(false);
          setIsAuthenticating(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  const setAuth = (newToken: string, newUsername: string) => {
    setToken(newToken);
    setUsername(newUsername);
    localStorage.setItem('token', newToken);
    localStorage.setItem('username', newUsername);
  };

  const clearAuth = () => {
    setToken(null);
    setUsername(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('username');
  };

  const login = async (username: string, password: string) => {
    try {
      setLoading(true);
      setIsAuthenticating(true);
      setError(null);
      const response = await api.post('/auth/login', { username, password });
      const { token, user } = response.data;
      
      setAuth(token, username);
      setUser(user);
    } catch (error: any) {
      console.error('Login failed:', error);
      setError('การเข้าสู่ระบบล้มเหลว: ' + (error.response?.data?.message || error.message));
      throw error;
    } finally {
      setLoading(false);
      setIsAuthenticating(false);
    }
  };

  const logout = () => {
    clearAuth();
  };

  const refreshToken = async () => {
    try {
      setLoading(true);
      setIsAuthenticating(true);
      setError(null);
      const response = await api.post('/auth/refresh');
      const { token, user } = response.data;
      
      setAuth(token, username || '');
      setUser(user);
    } catch (error: any) {
      console.error('Token refresh failed:', error);
      setError('การรีเฟรชโทเค็นล้มเหลว: ' + (error.response?.data?.message || error.message));
      clearAuth();
    } finally {
      setLoading(false);
      setIsAuthenticating(false);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      token, 
      username, 
      setAuth, 
      clearAuth, 
      login, 
      logout, 
      refreshToken, 
      isAuthenticated: !!token, 
      loading, 
      isAuthenticating,
      error,
      user 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 