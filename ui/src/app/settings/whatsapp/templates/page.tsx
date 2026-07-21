"use client";

import { ChevronLeft, FileText, Loader2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppConfig } from "@/context/AppConfigContext";
import { resolveBrowserBackendUrl } from "@/lib/apiClient";
import { useAuth } from "@/lib/auth";

interface Template {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components: Array<{
    type: string;
    text?: string;
    format?: string;
  }>;
}

const CATEGORIES = ["MARKETING", "UTILITY", "AUTHENTICATION"] as const;
const LANGUAGES = [
  { code: "en_US", label: "English (US)" },
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "kn", label: "Kannada" },
  { code: "ml", label: "Malayalam" },
];

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    APPROVED: "bg-green-100 text-green-700",
    PENDING: "bg-yellow-100 text-yellow-700",
    REJECTED: "bg-red-100 text-red-700",
    PAUSED: "bg-orange-100 text-orange-700",
    DISABLED: "bg-gray-100 text-gray-500",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        colors[status] || "bg-gray-100 text-gray-600"
      }`}
    >
      {status}
    </span>
  );
}

export default function WhatsAppTemplatesPage() {
  const { user, getAccessToken, redirectToLogin, loading: authLoading } = useAuth();
  const { config } = useAppConfig();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("MARKETING");
  const [language, setLanguage] = useState("en_US");
  const [headerText, setHeaderText] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [footerText, setFooterText] = useState("");

  const baseUrl = resolveBrowserBackendUrl(config?.backendApiEndpoint ?? null);

  useEffect(() => {
    if (!authLoading && !user) redirectToLogin();
  }, [authLoading, user, redirectToLogin]);

  const fetchTemplates = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const res = await fetch(`${baseUrl}/api/v1/integrations/whatsapp/templates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      } else {
        const err = await res.json();
        setError(err.detail || "Failed to fetch templates");
      }
    } catch (err) {
      setError("Failed to connect to server");
    } finally {
      setIsLoading(false);
    }
  }, [baseUrl, getAccessToken]);

  useEffect(() => {
    if (!authLoading && user) fetchTemplates();
  }, [authLoading, user, fetchTemplates]);

  const handleCreate = async () => {
    if (!name.trim() || !bodyText.trim()) return;
    setIsSubmitting(true);
    setError(null);

    const components: Array<Record<string, unknown>> = [];
    if (headerText.trim()) {
      components.push({ type: "HEADER", format: "TEXT", text: headerText.trim() });
    }
    components.push({ type: "BODY", text: bodyText.trim() });
    if (footerText.trim()) {
      components.push({ type: "FOOTER", text: footerText.trim() });
    }

    try {
      const token = await getAccessToken();
      const res = await fetch(`${baseUrl}/api/v1/integrations/whatsapp/templates`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: name.trim(), category, language, components }),
      });
      if (res.ok) {
        setShowCreate(false);
        setName("");
        setHeaderText("");
        setBodyText("");
        setFooterText("");
        fetchTemplates();
      } else {
        const err = await res.json();
        setError(err.detail || "Failed to create template");
      }
    } catch {
      setError("Failed to create template");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (templateName: string) => {
    if (!confirm(`Delete template "${templateName}"? This cannot be undone.`)) return;
    try {
      const token = await getAccessToken();
      const res = await fetch(`${baseUrl}/api/v1/integrations/whatsapp/templates`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: templateName }),
      });
      if (res.ok) {
        fetchTemplates();
      } else {
        const err = await res.json();
        setError(err.detail || "Failed to delete template");
      }
    } catch {
      setError("Failed to delete template");
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen font-sans">
      {/* Breadcrumb header */}
      <div className="border-b border-brand-border bg-brand-soft">
        <div className="mx-auto max-w-[1280px] px-6 py-4 flex items-center gap-3">
          <Link
            href="/settings"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft size={16} />
            Settings
          </Link>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-lg font-bold text-foreground">WhatsApp Templates</h1>
        </div>
      </div>

      <div className="mx-auto max-w-[1280px] px-6 py-6">
        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-2 font-medium underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Actions bar */}
        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Manage message templates for your WhatsApp Business account.
            Templates must be approved by Meta before they can be sent.
          </p>
          <Button onClick={() => setShowCreate(!showCreate)}>
            <Plus className="mr-2 h-4 w-4" />
            New Template
          </Button>
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="mb-6 rounded-lg border bg-background p-6">
            <h3 className="mb-4 text-base font-semibold">Create Template</h3>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Template Name
                </label>
                <Input
                  placeholder="e.g. order_update"
                  value={name}
                  onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Lowercase letters, numbers, underscores only
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Category</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Language</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Header (optional)
                </label>
                <Input
                  placeholder="Header text (supports {{1}} variables)"
                  value={headerText}
                  onChange={(e) => setHeaderText(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Body <span className="text-red-500">*</span>
                </label>
                <textarea
                  className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Message body text. Use {{1}}, {{2}} etc. for variables."
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Footer (optional)
                </label>
                <Input
                  placeholder="Footer text (e.g. Reply STOP to unsubscribe)"
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Button
                onClick={handleCreate}
                disabled={isSubmitting || !name.trim() || !bodyText.trim()}
              >
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Submit for Approval
              </Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Templates list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="mb-3 h-12 w-12 text-muted-foreground opacity-30" />
            <p className="text-sm text-muted-foreground">
              No templates found. Create one to get started.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Category</th>
                  <th className="px-4 py-3 text-left font-medium">Language</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Body</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {templates.map((t) => {
                  const bodyComponent = t.components?.find((c) => c.type === "BODY");
                  return (
                    <tr key={t.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs">{t.name}</td>
                      <td className="px-4 py-3">{t.category}</td>
                      <td className="px-4 py-3">{t.language}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="max-w-[300px] truncate px-4 py-3 text-muted-foreground">
                        {bodyComponent?.text || "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-red-500 hover:text-red-700"
                          onClick={() => handleDelete(t.name)}
                          title="Delete template"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
