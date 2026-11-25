import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Providers } from "@/components/providers";
import { AlertBanner, Sidebar, TopBar } from "@/components/shell";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "FiberGuard · Φ-OTDR intrusion detection", template: "%s · FiberGuard" },
  description: "AI-based intrusion and threat detection for underground optical fiber cables using Φ-OTDR.",
};

export const viewport: Viewport = { themeColor: "#070B12" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>
          <Sidebar />
          <div className="md:pl-56">
            <TopBar />
            <AlertBanner />
            <main className="mx-auto max-w-[1400px] px-4 pt-5 pb-24 md:px-6 md:pb-10">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
