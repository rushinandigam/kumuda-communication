"use client";

import {
  ChevronRight,
  Home,
  type LucideIcon,
  Mail,
  Megaphone,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Phone,
  PhoneCall,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type SidebarNavItem = {
  title: string;
  subtitle?: string;
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
        subtitle: "Overview & analytics",
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
        subtitle: "Chat messaging",
        url: "/whatsapp",
        icon: MessageCircle,
      },
      {
        title: "Voice",
        subtitle: "AI voice agents",
        url: "/workflow",
        icon: Phone,
      },
      {
        title: "Dial Pad",
        subtitle: "Manual calls",
        url: "/dial-pad",
        icon: PhoneCall,
      },
      {
        title: "Email",
        subtitle: "Shared inbox",
        url: "/email",
        icon: Mail,
      },
      {
        title: "Campaigns",
        subtitle: "Bulk outreach",
        url: "/campaigns",
        icon: Megaphone,
      },
      {
        title: "Contacts",
        subtitle: "Address book",
        url: "/contacts",
        icon: Users,
      },
    ],
  },
  {
    label: "MANAGE",
    items: [
      {
        title: "Settings",
        subtitle: "Configuration",
        url: "/settings",
        icon: Settings,
      },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { state, toggleSidebar, isMobile, setOpenMobile } = useSidebar();
  const isCollapsed = !isMobile && state === "collapsed";

  const isActive = (path: string) => pathname.startsWith(path);

  const handleNavClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  if (isCollapsed) {
    return (
      <aside className="w-14 shrink-0 bg-white dark:bg-gray-950 border-r border-border h-full z-30">
        <div className="flex flex-col items-center pt-3 gap-1 overflow-y-auto h-full border-r border-border">
          <button
            onClick={toggleSidebar}
            title="Expand sidebar"
            className="w-9 h-9 rounded-[10px] bg-brand/5 border border-brand/10 flex items-center justify-center cursor-pointer transition-all duration-150 hover:bg-brand/10"
          >
            <PanelLeftOpen size={16} className="text-brand" />
          </button>

          <div className="mt-4 flex flex-col items-center gap-1 w-full px-1.5">
            {NAV_SECTIONS.flatMap((s) => s.items).map((item) => {
              const active = isActive(item.url);
              const Icon = item.icon;
              return (
                <Link
                  key={item.url}
                  href={item.url}
                  onClick={handleNavClick}
                  title={item.title}
                  className={cn(
                    "w-9 h-9 rounded-[10px] flex items-center justify-center transition-all duration-150",
                    active
                      ? "bg-brand/10 text-brand"
                      : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                  )}
                >
                  <Icon size={18} />
                </Link>
              );
            })}
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-[260px] shrink-0 bg-white dark:bg-gray-950 border-r border-border h-full z-30">
      <div className="flex flex-col overflow-y-auto h-full border-r border-border">
        {/* Collapse toggle */}
        <div className="px-3 py-3 border-b border-border shrink-0 flex justify-end">
          <button
            onClick={toggleSidebar}
            title="Collapse sidebar"
            className="w-7 h-7 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center cursor-pointer shrink-0 transition-all duration-150 hover:bg-brand/5 hover:border-brand/25"
          >
            <PanelLeftClose size={14} className="text-gray-500" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2.5 pb-4 flex flex-col gap-0.5">
          {NAV_SECTIONS.map((section, sectionIdx) => (
            <div key={section.label ?? "overview"} className={sectionIdx > 0 ? "mt-5" : ""}>
              {section.label && (
                <div className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {section.label}
                </div>
              )}
              <div className="flex flex-col gap-0.5">
                {section.items.map((item) => {
                  const active = isActive(item.url);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.url}
                      href={item.url}
                      onClick={handleNavClick}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-[10px] w-full relative transition-all duration-150 no-underline",
                        active
                          ? "bg-brand/5"
                          : "bg-transparent hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      )}
                    >
                      {/* Active indicator */}
                      <div
                        className={cn(
                          "absolute left-0 top-[15%] bottom-[15%] w-1 rounded-r transition-opacity duration-150 bg-brand",
                          active ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {/* Icon */}
                      <div
                        className={cn(
                          "w-9 h-9 rounded-[9px] flex items-center justify-center shrink-0 transition-all duration-150",
                          active ? "bg-brand/[0.08]" : "bg-transparent"
                        )}
                      >
                        <Icon
                          size={18}
                          className={cn(
                            "transition-colors duration-150",
                            active ? "text-brand" : "text-gray-500"
                          )}
                        />
                      </div>
                      {/* Label */}
                      <div className="flex-1 min-w-0">
                        <div
                          className={cn(
                            "text-sm font-semibold leading-tight transition-colors duration-150",
                            active ? "text-foreground" : "text-gray-700 dark:text-gray-300"
                          )}
                        >
                          {item.title}
                        </div>
                        {item.subtitle && (
                          <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                            {item.subtitle}
                          </div>
                        )}
                      </div>
                      {/* Active chevron */}
                      {active && <ChevronRight size={16} className="text-brand shrink-0" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}
