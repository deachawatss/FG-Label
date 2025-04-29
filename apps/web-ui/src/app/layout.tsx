import "@/styles/globals.css";
import ClientProviders from "@/app/ClientProviders";

export const metadata = {
  title: "FG Label",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
} 