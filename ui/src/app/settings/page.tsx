"use client";

import {
  Brain,
  ChevronRight,
  Key,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
} from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

type ServiceConfig = {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  status: "active" | "configured" | "coming_soon";
  href: string;
};

const SERVICES: ServiceConfig[] = [
  {
    id: "telephony",
    title: "Telephony",
    description: "SIP trunks, phone numbers, voice agents, campaigns, and AI models",
    icon: <Phone size={24} />,
    color: "#6B1029",
    status: "configured",
    href: "/settings/telephony",
  },
  {
    id: "whatsapp",
    title: "WhatsApp",
    description: "WhatsApp Business API, messaging, and templates",
    icon: <MessageCircle size={24} />,
    color: "#25D366",
    status: "active",
    href: "/settings/whatsapp/templates",
  },
  {
    id: "sms",
    title: "SMS",
    description: "SMS gateway configuration and messaging templates",
    icon: <MessageSquare size={24} />,
    color: "#3B82F6",
    status: "coming_soon",
    href: "/settings/sms",
  },
  {
    id: "email",
    title: "Email",
    description: "SMTP configuration and email templates",
    icon: <Mail size={24} />,
    color: "#7C3AED",
    status: "coming_soon",
    href: "/settings/email",
  },
  {
    id: "ai-models",
    title: "AI Models",
    description: "LLM, TTS, and STT provider configurations",
    icon: <Brain size={24} />,
    color: "#D97706",
    status: "configured",
    href: "/settings/telephony/models",
  },
  {
    id: "api-keys",
    title: "API & Developer",
    description: "Manage developer API keys and webhooks",
    icon: <Key size={24} />,
    color: "#059669",
    status: "configured",
    href: "/settings/telephony/api-keys",
  },
];

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-green-50 text-green-700 border-green-200" },
  configured: { label: "Configured", className: "bg-blue-50 text-blue-700 border-blue-200" },
  coming_soon: { label: "Coming Soon", className: "bg-gray-50 text-gray-500 border-gray-200" },
};

export default function SettingsPage() {
  return (
    <div className="min-h-screen font-sans">
      {/* Header */}
      <div className="border-b border-brand-border bg-brand-soft">
        <div className="mx-auto max-w-[1280px] px-6 py-5">
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure your communication services and integrations
          </p>
        </div>
      </div>

      {/* Service Cards */}
      <div className="mx-auto max-w-[1280px] px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {SERVICES.map((service) => {
            const status = STATUS_LABELS[service.status];
            return (
              <Link
                key={service.id}
                href={service.href}
                className="group rounded-xl border border-brand-border bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-all hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between">
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-lg"
                    style={{ background: `${service.color}12`, color: service.color }}
                  >
                    {service.icon}
                  </div>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] font-bold",
                      status.className
                    )}
                  >
                    {status.label}
                  </span>
                </div>
                <h3 className="mt-3 text-[15px] font-bold text-foreground">{service.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  {service.description}
                </p>
                <div
                  className="mt-3 flex items-center text-xs font-semibold"
                  style={{ color: service.color }}
                >
                  {service.status === "coming_soon" ? "Coming Soon" : "Configure"}
                  <ChevronRight size={14} className="ml-0.5" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
