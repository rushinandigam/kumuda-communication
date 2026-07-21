import "./globals.css";

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";

import AppLayout from "@/components/layout/AppLayout";
import SpinLoader from "@/components/SpinLoader";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";
import { AppConfigProvider } from "@/context/AppConfigContext";
import { OrgConfigProvider } from "@/context/OrgConfigContext";
import { TelephonyConfigWarningsProvider } from "@/context/TelephonyConfigWarningsContext";
import { AuthProvider } from "@/lib/auth";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KK Connect",
  description: "Communication Platform",
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode
}) {

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme');
                  if (theme === 'dark') {
                    document.documentElement.classList.add('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          <AuthProvider>
            <AppConfigProvider>
              <Suspense fallback={<SpinLoader />}>
                <OrgConfigProvider>
                  <TelephonyConfigWarningsProvider>
                    <AppLayout>
                      {children}
                    </AppLayout>
                    <Toaster />
                  </TelephonyConfigWarningsProvider>
                </OrgConfigProvider>
              </Suspense>
            </AppConfigProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
