"use client";

import {
  AudioLines,
  Brain,
  ChevronLeft,
  Database,
  Key,
  Megaphone,
  Phone,
  TrendingUp,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TELEPHONY_NAV = [
  { title: "Telephony Providers", href: "/settings/telephony/providers", icon: Phone },
  { title: "Model Configurations", href: "/settings/telephony/models", icon: Brain },
  { title: "Voice Agents", href: "/settings/telephony/voice-agents", icon: Phone },
  { title: "Campaigns", href: "/settings/telephony/campaigns", icon: Megaphone },
  { title: "Tools", href: "/settings/telephony/tools", icon: Wrench },
  { title: "Files", href: "/settings/telephony/files", icon: Database },
  { title: "Recordings", href: "/settings/telephony/recordings", icon: AudioLines },
  { title: "API Keys", href: "/settings/telephony/api-keys", icon: Key },
  { title: "Agent Runs", href: "/settings/telephony/agent-runs", icon: TrendingUp },
];

export default function TelephonySettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen font-sans">
      {/* Header */}
      <div className="border-b border-brand-border bg-brand-soft">
        <div className="mx-auto max-w-[1440px] px-6 py-4 flex items-center gap-3">
          <Link
            href="/settings"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft size={16} />
            Settings
          </Link>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-lg font-bold text-foreground">Telephony Configuration</h1>
        </div>
      </div>

      {/* Content with inner sidebar */}
      <div className="mx-auto max-w-[1440px] flex">
        {/* Inner navigation sidebar */}
        <aside className="w-[240px] shrink-0 border-r border-brand-border bg-white p-4">
          <nav className="space-y-1">
            {TELEPHONY_NAV.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-brand/10 font-semibold text-brand"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 h-5 w-0.5 rounded-full bg-brand" />
                  )}
                  <Icon size={16} className={cn(isActive && "text-brand")} />
                  {item.title}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-h-[calc(100vh-130px)]">
          {children}
        </main>
      </div>
    </div>
  );
}
