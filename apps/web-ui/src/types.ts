export interface User {
  username: string;
  fullName?: string;
  email?: string;
  department?: string;
  position?: string;
  role?: string;
  lastLogin?: string;
}

export interface AuthContextType {
  token: string | null;
  username: string | null;
  setAuth: (token: string, username: string) => void;
  clearAuth: () => void;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
  isAuthenticated: boolean;
  loading: boolean;
  isAuthenticating: boolean;
  error: string | null;
  user: User | null;
} 