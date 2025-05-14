import "@/styles/globals.css";
import { AppProps } from "next/app";
import { useAuth } from "@/contexts/AuthContext";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";
import { HubConnectionBuilder, HttpTransportType, LogLevel, HubConnectionState } from "@microsoft/signalr";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { AuthProvider } from "@/contexts/AuthContext";
import type { HubConnection } from "@microsoft/signalr";
import { notification } from "antd";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const pathname = router.pathname;

  useEffect(() => {
    if (!isAuthenticated && pathname !== "/login") {
      router.replace("/login");
    } else if (isAuthenticated && pathname === "/login") {
      router.replace("/batch-search");
    }
  }, [isAuthenticated, router, pathname]);

  return <>{children}</>;
}

function SignalRConnection() {
  const { isAuthenticated, token } = useAuth();
  const connectionRef = useRef<HubConnection | null>(null);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const maxRetryAttempts = 5;
  const [retryCount, setRetryCount] = useState(0);

  const connectToSignalR = async () => {
    if (!isAuthenticated || !token) return;

    const signalrUrl = process.env.NEXT_PUBLIC_SIGNALR_URL;
    
    if (!signalrUrl) {
      console.warn('SignalR URL ไม่ได้กำหนดค่า ข้ามการเชื่อมต่อ');
      return;
    }

    // ถ้ามีการเชื่อมต่ออยู่แล้ว ไม่ต้องเชื่อมต่อใหม่
    if (connectionRef.current && connectionRef.current.state === HubConnectionState.Connected) {
      return;
    }
    
    // สร้างการเชื่อมต่อใหม่
    const connection = new HubConnectionBuilder()
      .withUrl(`${signalrUrl}?access_token=${token}`, {
        skipNegotiation: true,
        transport: HttpTransportType.WebSockets
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 15000, 30000]) // ลองเชื่อมต่อใหม่ตามช่วงเวลาที่กำหนด
      .configureLogging(LogLevel.Information)
      .build();

    connectionRef.current = connection;

    try {
      await connection.start();
      console.log('เชื่อมต่อ SignalR สำเร็จ');
      setConnectionFailed(false);
      setRetryCount(0);
      
      // กำหนดฟังก์ชันที่จะรับการเรียกจาก server
      connection.on('connection:status', (data) => {
        console.log('SignalR connection status:', data);
      });
      
      connection.on('job:update', (data) => {
        window.dispatchEvent(new CustomEvent<unknown>("job:update", { detail: data }));
      });

      connection.on('pong', (data) => {
        console.log('SignalR pong response:', data);
      });

      // ขอสถานะการเชื่อมต่อทันทีที่เชื่อมต่อสำเร็จ
      try {
        await connection.invoke('GetHubStatus');
        console.log('GetHubStatus ถูกเรียกใช้สำเร็จ');
      } catch (error) {
        console.error('ไม่สามารถเรียกเมธอด GetHubStatus:', error);
      }

      // ทดสอบการเชื่อมต่อด้วยฟังก์ชัน Ping
      try {
        await connection.invoke('Ping');
        console.log('Ping ถูกเรียกใช้สำเร็จ');
      } catch (error) {
        console.error('ไม่สามารถเรียกเมธอด Ping:', error);
      }
      
      // ตรวจสอบสถานะการเชื่อมต่อเมื่อมีการเปลี่ยนแปลง
      connection.onclose((error) => {
        console.error('การเชื่อมต่อ SignalR ถูกปิด:', error);
        
        if (retryCount < maxRetryAttempts) {
          setRetryCount(prev => prev + 1);
          
          // พยายามเชื่อมต่อใหม่หลังจาก 5 วินาที
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connectToSignalR();
          }, 5000);
        } else {
          setConnectionFailed(true);
          notification.error({
            message: 'ไม่สามารถเชื่อมต่อกับระบบแจ้งเตือนแบบเรียลไทม์',
            description: 'ระบบจะทำงานต่อไปแต่คุณอาจไม่ได้รับการแจ้งเตือนแบบเรียลไทม์ โปรดรีเฟรชหน้าจอหากต้องการลองใหม่',
            duration: 0
          });
        }
      });
    } catch (err) {
      console.error('เกิดข้อผิดพลาดในการเริ่มการเชื่อมต่อ SignalR:', err);
      
      if (retryCount < maxRetryAttempts) {
        setRetryCount(prev => prev + 1);
        
        // พยายามเชื่อมต่อใหม่หลังจาก 5 วินาที
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        
        reconnectTimeoutRef.current = setTimeout(() => {
          connectToSignalR();
        }, 5000);
      } else {
        setConnectionFailed(true);
        console.warn('ไม่สามารถเชื่อมต่อกับ SignalR hub หลังจากพยายามหลายครั้ง แอปจะทำงานต่อไปโดยไม่มีการอัปเดตแบบเรียลไทม์');
      }
    }
  };

  useEffect(() => {
    if (isAuthenticated && token) {
      connectToSignalR();
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      if (connectionRef.current) {
        connectionRef.current.stop().catch(() => {
          console.warn('การตัดการเชื่อมต่อ SignalR ล้มเหลว');
        });
      }
    };
  }, [isAuthenticated, token]);

  return null;
}

function AppContent({ Component, pageProps }: AppProps) {
  return (
    <AuthGuard>
      <SignalRConnection />
      <I18nextProvider i18n={i18n}>
        <Component {...pageProps} />
      </I18nextProvider>
    </AuthGuard>
  );
}

export default function App(props: AppProps) {
  return (
    <AuthProvider>
      <AppContent {...props} />
    </AuthProvider>
  );
} 