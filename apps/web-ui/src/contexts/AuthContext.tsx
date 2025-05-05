import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../lib/api';
import { AuthContextType, User } from '../types';

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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
      api.get('/api/me')
        .then((response) => {
          setUser(response.data);
          setLoading(false);
        })
        .catch(() => {
          clearAuth();
          setLoading(false);
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
      const response = await api.post('/api/auth/login', { username, password });
      const { token, user } = response.data;
      
      setAuth(token, username);
      setUser(user);
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    clearAuth();
  };

  const refreshToken = async () => {
    try {
      setLoading(true);
      const response = await api.post('/api/auth/refresh');
      const { token, user } = response.data;
      
      setAuth(token, username || '');
      setUser(user);
    } catch (error) {
      console.error('Token refresh failed:', error);
      clearAuth();
    } finally {
      setLoading(false);
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