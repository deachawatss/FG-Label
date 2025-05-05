import "@/styles/globals.css";
import { AppProps } from "next/app";
import { useAuth } from "@/contexts/AuthContext";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";
import { HubConnectionBuilder, HttpTransportType } from "@microsoft/signalr";
import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AuthProvider } from "@/contexts/AuthContext";
import type { HubConnection } from "@microsoft/signalr";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

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
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      if (connectionRef.current) {
        connectionRef.current.stop();
        connectionRef.current = null;
      }
      return;
    }

    const startConnection = async () => {
      if (isConnecting) return;
      setIsConnecting(true);

      try {
        if (connectionRef.current) {
          await connectionRef.current.stop();
          connectionRef.current = null;
        }

        const connection = new HubConnectionBuilder()
          .withUrl(`${process.env.NEXT_PUBLIC_API_URL}/hubs/jobs`, {
            accessTokenFactory: () => token,
            skipNegotiation: true,
            transport: HttpTransportType.WebSockets
          })
          .withAutomaticReconnect([0, 2000, 5000, 10000, 20000])
          .configureLogging("debug")
          .build();

        connection.onclose((error) => {
          if (error) {
            console.error('SignalR Connection Error: ', error);
          }
        });

        connectionRef.current = connection;

        await connection.start();
        console.log('SignalR Connected');

        connection.on("job:update", (job: unknown) => {
          window.dispatchEvent(new CustomEvent<unknown>("job:update", { detail: job }));
        });

      } catch (err) {
        console.error('Error starting SignalR connection:', err);
      } finally {
        setIsConnecting(false);
      }
    };

    startConnection();

    return () => {
      if (connectionRef.current) {
        connectionRef.current.stop();
        connectionRef.current = null;
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