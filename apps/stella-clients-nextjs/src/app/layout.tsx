import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/contexts/ThemeContext";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const gilanMedium = localFont({
  src: "../../public/fonts/gilan-medium.ttf",
  variable: "--font-gilan",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Stella Clients - Crypto Trading Platform",
  description: "Manage clients and KYC for Stella crypto trading platform",
  icons: {
    icon: '/icon.png',
    apple: '/apple-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${jetbrainsMono.variable} ${gilanMedium.variable} antialiased`}
        style={{ fontFamily: 'var(--font-jetbrains-mono), "Fira Code", monospace' }}
      >
        <ThemeProvider>
          <main className="min-h-screen">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
