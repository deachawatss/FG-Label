import "@/styles/globals.css";
import { AppProps } from "next/app";
import { useAuth } from "@/hooks/useAuth";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";
import { HubConnectionBuilder } from "@microsoft/signalr";
import { useEffect, useRef } from "react";
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
  const { isAuthenticated } = useAuth();
  const connectionRef = useRef<HubConnection | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      if (connectionRef.current) {
        connectionRef.current.stop();
        connectionRef.current = null;
      }
      return;
    }

    const getToken = () => localStorage.getItem("jwt") || "";
    const connection = new HubConnectionBuilder()
      .withUrl(`${process.env.NEXT_PUBLIC_API_URL}/hubs/jobs`, {
        accessTokenFactory: getToken
      })
      .withAutomaticReconnect()
      .build();

    connectionRef.current = connection;

    const startConnection = async () => {
      try {
        await connection.start();
        console.log("SignalR Connected");
      } catch (err) {
        console.error("SignalR Connection Error: ", err);
      }
    };

    startConnection();

    connection.on("job:update", (job: unknown) => {
      window.dispatchEvent(new CustomEvent<unknown>("job:update", { detail: job }));
    });

    return () => {
      if (connectionRef.current) {
        connectionRef.current.stop();
        connectionRef.current = null;
      }
    };
  }, [isAuthenticated]);

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