"use client";

import {
  BarChart3,
  MessageCircle,
  Phone,
  Send,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";

import { useAuth } from "@/lib/auth";

export default function OverviewPage() {
  const { user } = useAuth();
  const userName = user?.displayName || "User";

  return (
    <div className="min-h-screen font-sans">
      {/* Welcome Strip */}
      <div className="border-b border-brand-border bg-brand-soft">
        <div className="mx-auto max-w-[1280px] px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground tracking-tight">
              Welcome back, {userName.split(" ")[0]}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              KK Connect Communication Platform
            </p>
          </div>
        </div>
      </div>

      {/* Stats Section */}
      <section className="bg-white">
        <div className="mx-auto max-w-[1280px] px-6 py-10">
          <div className="mb-8">
            <h2 className="text-[22px] font-extrabold text-foreground tracking-tight">Overview</h2>
            <p className="text-sm text-muted-foreground mt-1">Your communication services at a glance</p>
          </div>
          <div className="flex flex-wrap gap-4">
            <StatCard value="—" label="Messages Sent" color="#3B82F6" icon={<Send size={22} />} />
            <StatCard value="—" label="Active Contacts" color="#10B981" icon={<Users size={22} />} />
            <StatCard value="—" label="Campaigns" color="#7C3AED" icon={<BarChart3 size={22} />} />
            <StatCard value="—" label="Delivery Rate" color="var(--brand)" icon={<TrendingUp size={22} />} />
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="bg-brand-soft">
        <div className="mx-auto max-w-[1280px] px-6 py-10">
          <div className="mb-8">
            <h2 className="text-[22px] font-extrabold text-foreground tracking-tight">Services</h2>
            <p className="text-sm text-muted-foreground mt-1">Manage your communication channels</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <ServiceCard
              icon={<MessageCircle size={28} />}
              title="WhatsApp"
              description="Send messages, templates, and manage conversations"
              href="/whatsapp"
              color="#25D366"
            />
            <ServiceCard
              icon={<Phone size={28} />}
              title="Voice"
              description="AI-powered voice agents and call management"
              href="/workflow"
              color="var(--brand)"
            />
            <ServiceCard
              icon={<Users size={28} />}
              title="Contacts"
              description="Manage your contact lists and segments"
              href="/contacts"
              color="#3B82F6"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({
  value,
  label,
  color,
  icon,
}: {
  value: string;
  label: string;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      className="flex-1 min-w-[180px] rounded-xl bg-white p-5 shadow-[0_2px_16px_rgba(0,0,0,0.07)]"
      style={{ borderTop: `3px solid ${color}` }}
    >
      <div className="flex items-start justify-between">
        <div style={{ color, opacity: 0.8 }}>{icon}</div>
      </div>
      <div className="mt-3 text-3xl font-black text-foreground tracking-tight leading-none">
        {value}
      </div>
      <div className="mt-2 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

function ServiceCard({
  icon,
  title,
  description,
  href,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  color: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-brand-border bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-all hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] hover:-translate-y-0.5"
    >
      <div
        className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg"
        style={{ background: `${color}15`, color }}
      >
        {icon}
      </div>
      <h3 className="text-base font-bold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <span
        className="mt-3 inline-block text-sm font-semibold transition-colors"
        style={{ color }}
      >
        Open →
      </span>
    </Link>
  );
}
