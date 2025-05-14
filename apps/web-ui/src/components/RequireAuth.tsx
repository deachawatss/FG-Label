import { useEffect, ReactNode } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import { Spin } from 'antd';

interface RequireAuthProps {
  children: ReactNode;
}

const RequireAuth = ({ children }: RequireAuthProps) => {
  const { isAuthenticated, isAuthenticating, error } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticating && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isAuthenticating, router]);

  if (isAuthenticating) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin>
          <div style={{ padding: '30px', textAlign: 'center' }}>
            กำลังตรวจสอบการเข้าสู่ระบบ...
          </div>
        </Spin>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
        <h2>เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์</h2>
        <p>{error}</p>
        <button onClick={() => router.push('/login')}>กลับไปหน้าเข้าสู่ระบบ</button>
      </div>
    );
  }

  return isAuthenticated ? <>{children}</> : null;
};

export default RequireAuth; 