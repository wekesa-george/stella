import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Navbar } from "@/components/navigation/navbar";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${openSans.variable} ${gilanMedium.variable} antialiased font-sans`}
      >
        <Navbar />
        <main className="min-h-[calc(100vh-56px)] sm:min-h-[calc(100vh-64px)]">{children}</main>
      </body>
    </html>
  );
}
