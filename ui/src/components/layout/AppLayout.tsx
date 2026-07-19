"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { ReactNode } from "react";

import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider, useSidebar } from "@/components/ui/sidebar";

import { AppSidebar } from "./AppSidebar";

function AppHeader() {
  const { toggleSidebar } = useSidebar();

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between border-b border-brand-border bg-brand px-6 py-0 h-[64px] shadow-sm">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          aria-label="Open menu"
          className="md:hidden text-white hover:bg-white/10"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <Link href="/" className="flex items-center gap-2.5">
          <BrandLogo mark className="h-8" />
          <span
            className="text-[20px] font-bold tracking-tight leading-none"
            style={{ color: "var(--brand-gold)" }}
          >
            KK Connect
          </span>
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-white/70">Communication Platform</span>
      </div>
    </header>
  );
}

interface AppLayoutProps {
  children: ReactNode;
  headerActions?: ReactNode;
  stickyTabs?: ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const pathname = usePathname();

  const shouldShowSidebar = pathname !== "/" && !pathname.startsWith("/handler") && !pathname.startsWith("/auth");

  return (
    <SidebarProvider defaultOpen>
      {shouldShowSidebar ? (
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <SidebarInset className="flex-1">
            <AppHeader />
            <main className="flex-1 bg-background">
              {children}
            </main>
          </SidebarInset>
        </div>
      ) : (
        <div className="w-full flex-1">
          {children}
        </div>
      )}
    </SidebarProvider>
  );
};

export default AppLayout;
