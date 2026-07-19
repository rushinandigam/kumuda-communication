"use client";

import {
  ChevronLeft,
  ChevronRight,
  Home,
  LogOut,
  type LucideIcon,
  MessageCircle,
  Phone,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React from "react";

import { BrandLogo } from "@/components/BrandLogo";
import ThemeToggle from "@/components/ThemeSwitcher";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { LocalUser } from "@/lib/auth";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type SidebarNavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
};

type SidebarNavSection = {
  label?: string;
  items: SidebarNavItem[];
};

const NAV_SECTIONS: SidebarNavSection[] = [
  {
    items: [
      {
        title: "Dashboard",
        url: "/overview",
        icon: Home,
      },
    ],
  },
  {
    label: "SERVICES",
    items: [
      {
        title: "WhatsApp",
        url: "/whatsapp",
        icon: MessageCircle,
      },
      {
        title: "Voice",
        url: "/workflow",
        icon: Phone,
      },
    ],
  },
  {
    label: "MANAGE",
    items: [
      {
        title: "Contacts",
        url: "/contacts",
        icon: Users,
      },
      {
        title: "Settings",
        url: "/settings",
        icon: Settings,
      },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const { logout, user } = useAuth();
  const isCollapsed = !isMobile && state === "collapsed";

  const isActive = (path: string) => pathname.startsWith(path);

  const handleMobileNavClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const SidebarLink = ({ item }: { item: SidebarNavItem }) => {
    const isItemActive = isActive(item.url);
    const Icon = item.icon;

    return (
      <SidebarMenuButton
        asChild
        tooltip={{ children: <p>{item.title}</p> }}
        className={cn(
          "rounded-xl transition-colors hover:bg-accent hover:text-accent-foreground",
          isItemActive &&
            "bg-brand/10 font-semibold text-brand hover:bg-brand/15 hover:text-brand"
        )}
      >
        <Link
          href={item.url}
          onClick={handleMobileNavClick}
          className={cn("relative", isCollapsed && "justify-center")}
        >
          {isItemActive && !isCollapsed && (
            <span
              className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-brand"
              aria-hidden
            />
          )}
          <Icon
            className={cn(
              "h-4 w-4 shrink-0",
              isItemActive && "text-brand"
            )}
          />
          <span
            className={cn("min-w-0 flex-1 truncate", isCollapsed && "sr-only")}
          >
            {item.title}
          </span>
        </Link>
      </SidebarMenuButton>
    );
  };

  const displayIdentity =
    user?.displayName ||
    (user as { primaryEmail?: string } | undefined)?.primaryEmail ||
    (user as LocalUser | undefined)?.email ||
    "";
  const userInitials =
    displayIdentity
      .split(/[\s@]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s: string) => s[0]?.toUpperCase())
      .join("") || "U";

  return (
    <Sidebar collapsible="icon" variant="floating" className="py-4">
      <SidebarHeader className="px-2 py-3">
        <div className="flex items-center justify-between">
          <div className={cn("flex items-center gap-2", isCollapsed && "hidden")}>
            <Link href="/" className="flex items-center gap-2 px-1">
              <BrandLogo mark className="h-7" />
              <span
                className="text-lg font-bold tracking-tight"
                style={{ color: "var(--brand-gold)" }}
              >
                KK Connect
              </span>
            </Link>
          </div>

          <SidebarTrigger className={cn("hover:bg-accent", isCollapsed && "mx-auto")}>
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </SidebarTrigger>
        </div>
      </SidebarHeader>

      <SidebarContent className={cn(isCollapsed && "px-0")}>
        {NAV_SECTIONS.map((section, index) => (
          <SidebarGroup
            key={section.label ?? "overview"}
            className={index === 0 ? "mt-2" : "mt-6"}
          >
            {section.label && (
              <SidebarGroupLabel
                className={cn(
                  "text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                  isCollapsed && "hidden"
                )}
              >
                {section.label}
              </SidebarGroupLabel>
            )}
            <SidebarMenu>
              {section.items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarLink item={item} />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className={cn("p-3", isCollapsed && "p-2")}>
        <div className="space-y-2">
          <div
            className={cn(
              "flex items-center justify-between gap-1 rounded-full border border-border/60 bg-muted/30 p-1",
              isCollapsed && "flex-col"
            )}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 cursor-pointer rounded-full border border-border/80 bg-brand text-white hover:bg-brand-dark hover:text-white"
                >
                  <span className="text-xs font-medium">{userInitials}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    {(user as LocalUser | undefined)?.email && (
                      <p className="text-xs text-muted-foreground">{(user as LocalUser).email}</p>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/settings")} className="cursor-pointer">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => logout()} className="cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="mt-1 flex justify-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <ThemeToggle
                    showLabel={false}
                    className="rounded-full hover:bg-accent hover:text-accent-foreground"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side={isCollapsed ? "right" : "top"}>
                <p>Toggle theme</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
