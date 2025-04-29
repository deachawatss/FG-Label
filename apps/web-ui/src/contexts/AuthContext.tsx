import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import api from '@/lib/api';
import type { AxiosError } from "axios";

interface User {
  id: number;
  username: string;
  email: string;
  role: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("jwt");
    if (token) {
      setIsAuthenticated(true);
      // โหลดข้อมูล user
      api.get("/api/me")
        .then(response => {
          setUser(response.data);
        })
        .catch(() => {
          localStorage.removeItem("jwt");
          setIsAuthenticated(false);
          setUser(null);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (username: string, password: string) => {
    try {
      const response = await api.post("/api/auth/login", {
        username,
        password,
      });

      const { token, user } = response.data;
      localStorage.setItem("jwt", token);
      setIsAuthenticated(true);
      setUser(user);
      router.push("/batch-search");
    } catch (error: unknown) {
      console.error("Login error:", error);
      if (typeof error === 'object' && error !== null && 'response' in error && typeof (error as AxiosError).response === 'object') {
        const axiosErr = error as AxiosError;
        const msg = (axiosErr.response?.data as { message?: string })?.message;
        throw new Error(msg || "เกิดข้อผิดพลาดในการเข้าสู่ระบบ");
      }
      throw new Error("เกิดข้อผิดพลาดในการเข้าสู่ระบบ");
    }
  };

  const logout = () => {
    localStorage.removeItem("jwt");
    setIsAuthenticated(false);
    setUser(null);
    router.push("/login");
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        user,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
} 