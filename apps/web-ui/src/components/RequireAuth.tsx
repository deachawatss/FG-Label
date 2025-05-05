import { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/router';

interface Props {
  children: ReactNode;
}

export default function RequireAuth({ children }: Props) {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!isAuthenticated) {
    if (typeof window !== 'undefined') {
      router.replace('/login');
    }
    return null;
  }

  return <>{children}</>;
} 