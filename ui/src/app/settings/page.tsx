"use client";

import {
  Brain,
  ChevronRight,
  Key,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ServiceConfig = {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  status: "active" | "configured" | "not_configured";
  configLinks: { label: string; href: string }[];
};

const SERVICES: ServiceConfig[] = [
  {
    id: "telephony",
    title: "Telephony",
    description: "Configure SIP trunks, phone numbers, and voice providers",
    icon: <Phone size={24} />,
    color: "#6B1029",
    status: "configured",
    configLinks: [
      { label: "Telephony Providers", href: "/telephony-configurations" },
      { label: "Model Configurations", href: "/model-configurations" },
    ],
  },
  {
    id: "whatsapp",
    title: "WhatsApp",
    description: "WhatsApp Business API settings and templates",
    icon: <MessageCircle size={24} />,
    color: "#25D366",
    status: "active",
    configLinks: [
      { label: "WhatsApp Settings", href: "/whatsapp" },
    ],
  },
  {
    id: "sms",
    title: "SMS",
    description: "SMS gateway configuration and messaging templates",
    icon: <MessageSquare size={24} />,
    color: "#3B82F6",
    status: "not_configured",
    configLinks: [],
  },
  {
    id: "email",
    title: "Email",
    description: "SMTP configuration and email templates",
    icon: <Mail size={24} />,
    color: "#7C3AED",
    status: "not_configured",
    configLinks: [],
  },
  {
    id: "ai-models",
    title: "AI Models",
    description: "LLM, TTS, and STT provider configurations",
    icon: <Brain size={24} />,
    color: "#D97706",
    status: "configured",
    configLinks: [
      { label: "Model Configurations", href: "/model-configurations" },
      { label: "Tools", href: "/tools" },
      { label: "Files & Knowledge", href: "/files" },
    ],
  },
  {
    id: "api-keys",
    title: "API Keys",
    description: "Manage developer API keys and webhooks",
    icon: <Key size={24} />,
    color: "#059669",
    status: "configured",
    configLinks: [
      { label: "API Keys", href: "/api-keys" },
    ],
  },
];

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-green-50 text-green-700 border-green-200" },
  configured: { label: "Configured", className: "bg-blue-50 text-blue-700 border-blue-200" },
  not_configured: { label: "Coming Soon", className: "bg-gray-50 text-gray-500 border-gray-200" },
};

export default function SettingsPage() {
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const activeService = SERVICES.find((s) => s.id === selectedService);

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

      {/* Content */}
      <div className="mx-auto max-w-[1280px] px-6 py-8">
        <div className="flex gap-6">
          {/* Service Cards Grid */}
          <div className={cn("flex-1 transition-all", selectedService && "max-w-[60%]")}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {SERVICES.map((service) => {
                const status = STATUS_LABELS[service.status];
                const isSelected = selectedService === service.id;
                return (
                  <button
                    key={service.id}
                    onClick={() => setSelectedService(isSelected ? null : service.id)}
                    className={cn(
                      "group relative rounded-xl border bg-white p-5 text-left shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-all hover:shadow-[0_6px_20px_rgba(0,0,0,0.1)] hover:-translate-y-0.5 cursor-pointer",
                      isSelected
                        ? "border-brand ring-2 ring-brand/20"
                        : "border-brand-border"
                    )}
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
                    <div className="mt-3 flex items-center text-xs font-semibold" style={{ color: service.color }}>
                      Configure <ChevronRight size={14} className="ml-0.5" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Config Sidebar Panel */}
          {activeService && (
            <div className="w-[40%] min-w-[320px] shrink-0 animate-in slide-in-from-right-4 duration-200">
              <div className="sticky top-20 rounded-xl border border-brand-border bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.08)]">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-9 w-9 items-center justify-center rounded-lg"
                      style={{ background: `${activeService.color}12`, color: activeService.color }}
                    >
                      {activeService.icon}
                    </div>
                    <h3 className="text-lg font-bold text-foreground">{activeService.title}</h3>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-full"
                    onClick={() => setSelectedService(null)}
                  >
                    <X size={16} />
                  </Button>
                </div>

                <p className="text-sm text-muted-foreground mb-6">{activeService.description}</p>

                {activeService.configLinks.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                      Configuration
                    </p>
                    {activeService.configLinks.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="flex items-center justify-between rounded-lg border border-brand-border bg-brand-soft px-4 py-3 transition-colors hover:bg-brand/5"
                      >
                        <span className="text-sm font-medium text-foreground">{link.label}</span>
                        <ChevronRight size={16} className="text-muted-foreground" />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-brand-border bg-brand-soft/50 p-6 text-center">
                    <p className="text-sm text-muted-foreground">
                      This service is not yet available. Configuration will be added soon.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
