import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Navbar } from "@/components/navigation/navbar";
import { getLogtoContext } from "@logto/next/server-actions";
import { logtoConfig } from "./logto";
import { redirect } from "next/navigation";
import { SocketProviderWithAuth } from "@/components/SocketProvider";
import { AdminUserProvider } from "@/components/AdminUserProvider";
import { QueryProvider } from "@/components/QueryProvider";
import { getAdminUserId } from "@/lib/getAdminUserId";

const openSans = localFont({
  src: [
    {
      path: "../../public/fonts/OpenSans-Variable.ttf",
      style: "normal",
    },
    {
      path: "../../public/fonts/OpenSans-Italic-Variable.ttf",
      style: "italic",
    },
  ],
  variable: "--font-open-sans",
  display: "swap",
});

const gilanMedium = localFont({
  src: "../../public/fonts/gilan-medium.ttf",
  variable: "--font-gilan",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Stella - Crypto Trading Platform",
  description: "Trade, swap, and manage your crypto assets with Stella",
  icons: {
    icon: '/icon.png',
    apple: '/apple-icon.png',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { isAuthenticated, claims } = await getLogtoContext(logtoConfig, {
    fetchUserInfo: true,
  });

  if (!isAuthenticated) {
    redirect('/sign-in');
  }

  const user = {
    name: claims?.name || claims?.username || 'Admin User',
    email: claims?.email || '',
    avatar: claims?.picture || '',
  };

  const adminUserId = await getAdminUserId();

  return (
    <html lang="en" className="dark">
      <body
        className={`${openSans.variable} ${gilanMedium.variable} antialiased font-sans`}
      >
        <QueryProvider>
          <AdminUserProvider adminUserId={adminUserId}>
            <Navbar user={user} />
            <SocketProviderWithAuth>
              <main className="min-h-[calc(100vh-56px)] sm:min-h-[calc(100vh-64px)]">{children}</main>
            </SocketProviderWithAuth>
          </AdminUserProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
