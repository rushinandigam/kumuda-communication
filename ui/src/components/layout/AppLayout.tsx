"use client";

import { LogOut, Menu, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { ReactNode, useEffect, useRef, useState } from "react";

import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import type { LocalUser } from "@/lib/auth";
import { useAuth } from "@/lib/auth";

import { AppSidebar } from "./AppSidebar";

function AppHeader() {
  const { toggleSidebar } = useSidebar();
  const { user, logout } = useAuth();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    if (profileOpen) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [profileOpen]);

  const displayName =
    user?.displayName ||
    user?.name ||
    (user as LocalUser | undefined)?.email ||
    "User";
  const userInitials = displayName
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s: string) => s[0]?.toUpperCase())
    .join("") || "U";

  return (
    <header
      className="sticky top-0 z-50 border-b border-black/10"
      style={{
        background: "var(--brand)",
        boxShadow: scrolled ? "0 4px 20px rgba(0,0,0,0.18)" : "0 2px 8px rgba(0,0,0,0.08)",
        transition: "box-shadow 0.25s",
      }}
    >
      <div className="mx-auto flex h-[76px] max-w-[1440px] items-center px-7">
        {/* Left: Hamburger + Logo */}
        <div className="flex items-center gap-2.5 shrink-0">
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
            <BrandLogo mark className="h-9" />
            <div className="flex flex-col leading-none">
              <span className="text-[16px] font-bold text-white tracking-[0.5px]">
                KK Connect
              </span>
              <span className="text-[9px] font-medium text-white/65 tracking-[1.5px] mt-0.5">
                COMMUNICATION
              </span>
            </div>
          </Link>
        </div>

        {/* Divider */}
        <div className="mx-5 h-8 w-px bg-white/25 shrink-0 hidden sm:block" />

        {/* Center: Welcome */}
        <div className="flex-1 min-w-0 hidden sm:flex flex-col justify-center">
          <span className="text-[13px] font-bold text-white truncate">
            Welcome back, {displayName}
          </span>
          <span className="text-[10px] text-white/70 mt-0.5">
            Communication Platform
          </span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3.5 shrink-0 ml-5">
          {/* Profile avatar + dropdown */}
          <div ref={profileRef} className="relative">
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="h-9 w-9 rounded-full border-2 border-white/50 bg-white/20 flex items-center justify-center cursor-pointer transition-all hover:scale-105 hover:bg-white/30 hover:border-white/80"
            >
              <span className="text-[11px] font-extrabold text-white">{userInitials}</span>
            </button>

            {profileOpen && (
              <div className="absolute top-[calc(100%+10px)] right-0 w-60 bg-white rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.16)] border border-gray-200 p-3 z-[2000]">
                <div className="px-1 pb-3 border-b border-gray-100">
                  <div className="text-sm font-bold text-gray-900">{displayName}</div>
                  {(user as LocalUser | undefined)?.email && (
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      {(user as LocalUser).email}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => { setProfileOpen(false); router.push("/settings"); }}
                  className="w-full flex items-center gap-2 px-2 py-2.5 mt-1 rounded-lg text-[13px] font-semibold text-gray-500 hover:bg-brand-soft hover:text-brand transition-all cursor-pointer"
                >
                  <Settings size={14} /> Settings
                </button>

                <button
                  onClick={() => { setProfileOpen(false); void logout(); }}
                  className="w-full flex items-center gap-2 px-2 py-2.5 rounded-lg text-[13px] font-semibold text-gray-500 hover:bg-brand-soft hover:text-brand transition-all cursor-pointer"
                >
                  <LogOut size={14} /> Logout
                </button>
              </div>
            )}
          </div>
        </div>
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
