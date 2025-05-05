export interface User {
  username: string;
  role?: string;
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
  user: User | null;
} 