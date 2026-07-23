"use client";

import {
  Clock,
  Inbox,
  Loader2,
  Mail,
  Pencil,
  Send,
  Settings,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type EmailEntry = {
  id?: string;
  to: string[];
  cc?: string[] | null;
  from?: string;
  subject: string;
  body: string;
  sent_at: string;
  status: string;
  direction?: "sent" | "received";
};

type EmailConfigState = {
  configured: boolean;
  sender_email?: string;
  sender_name?: string;
} | null;

type Tab = "inbox" | "sent" | "compose";

export default function EmailPage() {
  const { getAccessToken } = useAuth();
  const [config, setConfig] = useState<EmailConfigState>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [emails, setEmails] = useState<EmailEntry[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<EmailEntry | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("inbox");
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Compose state
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const fetchConfig = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/v1/email/config", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      } else {
        setConfig(null);
      }
    } catch {
      setConfig(null);
    }
  }, [getAccessToken]);

  const fetchEmails = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/v1/email/history", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setEmails(data);
      }
    } catch {
      // ignore
    }
  }, [getAccessToken]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchConfig(), fetchEmails()]);
      setLoading(false);
    };
    load();
  }, [fetchConfig, fetchEmails]);

  const handleSend = async () => {
    if (!to || !subject || !body) return;

    setSending(true);
    setError(null);
    setSuccess(null);

    try {
      const token = await getAccessToken();
      const recipients = to.split(",").map((e) => e.trim()).filter(Boolean);
      const ccList = cc ? cc.split(",").map((e) => e.trim()).filter(Boolean) : undefined;

      const res = await fetch("/api/v1/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          to: recipients,
          cc: ccList?.length ? ccList : undefined,
          subject,
          body,
          is_html: false,
        }),
      });

      if (res.ok) {
        setSuccess("Email sent successfully!");
        setTo("");
        setCc("");
        setSubject("");
        setBody("");
        setActiveTab("sent");
        fetchEmails();
      } else {
        const err = await res.json().catch(() => ({ detail: "Failed to send" }));
        setError(err.detail || "Failed to send email");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const filteredEmails = emails.filter((e) => {
    if (activeTab === "sent") return e.direction !== "received";
    if (activeTab === "inbox") return true;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-brand/5 border border-brand/10 flex items-center justify-center mx-auto mb-4">
            <Mail className="h-8 w-8 text-brand" />
          </div>
          <h3 className="text-lg font-bold mb-2">Email not configured</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Set up your Gmail SMTP credentials to start sending and receiving emails.
          </p>
          <Button asChild>
            <Link href="/email/settings">
              <Settings className="h-4 w-4 mr-2" />
              Configure Email
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[calc(100vh-76px)]">
      {/* Left sidebar - mail navigation */}
      <div className="w-[240px] border-r border-border bg-gray-50/50 dark:bg-gray-900/50 flex flex-col shrink-0">
        {/* Account info */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center">
              <Mail className="h-4 w-4 text-brand" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold truncate">{config.sender_name || "Email"}</div>
              <div className="text-[10px] text-muted-foreground truncate">{config.sender_email}</div>
            </div>
          </div>
        </div>

        {/* Compose button */}
        <div className="p-3">
          <Button
            onClick={() => { setActiveTab("compose"); setSelectedEmail(null); }}
            className="w-full justify-start gap-2"
            variant={activeTab === "compose" ? "default" : "outline"}
            size="sm"
          >
            <Pencil className="h-3.5 w-3.5" />
            Compose
          </Button>
        </div>

        {/* Nav tabs */}
        <nav className="flex-1 px-2 space-y-0.5">
          <button
            onClick={() => { setActiveTab("inbox"); setSelectedEmail(null); }}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left",
              activeTab === "inbox"
                ? "bg-brand/10 text-brand"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            <Inbox className="h-4 w-4" />
            All Messages
            {emails.length > 0 && (
              <span className="ml-auto text-[10px] bg-muted rounded-full px-1.5 py-0.5 font-semibold">
                {emails.length}
              </span>
            )}
          </button>

          <button
            onClick={() => { setActiveTab("sent"); setSelectedEmail(null); }}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left",
              activeTab === "sent"
                ? "bg-brand/10 text-brand"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            <Send className="h-4 w-4" />
            Sent
          </button>
        </nav>

        {/* Settings link */}
        <div className="p-3 border-t border-border">
          <Link
            href="/email/settings"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </div>
      </div>

      {/* Middle panel - email list or compose */}
      {activeTab === "compose" ? (
        <div className="flex-1 flex flex-col">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold">New Message</h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setActiveTab("inbox")}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 p-4 space-y-3 overflow-auto">
            <div className="space-y-1.5">
              <Label htmlFor="to" className="text-xs">To</Label>
              <Input
                id="to"
                placeholder="recipient@example.com (comma-separated)"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cc" className="text-xs">Cc</Label>
              <Input
                id="cc"
                placeholder="cc@example.com"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="subject" className="text-xs">Subject</Label>
              <Input
                id="subject"
                placeholder="Email subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5 flex-1">
              <Label htmlFor="body" className="text-xs">Message</Label>
              <Textarea
                id="body"
                placeholder="Write your message..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={12}
                className="resize-y text-sm"
              />
            </div>

            {error && (
              <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 rounded-md px-3 py-2">
                {error}
              </div>
            )}
            {success && (
              <div className="text-xs text-green-600 bg-green-50 dark:bg-green-950/20 rounded-md px-3 py-2">
                {success}
              </div>
            )}

            <Button
              onClick={handleSend}
              disabled={sending || !to || !subject || !body}
              size="sm"
            >
              {sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
              ) : (
                <Send className="h-3.5 w-3.5 mr-2" />
              )}
              Send Email
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Email list */}
          <div className={cn(
            "border-r border-border flex flex-col",
            selectedEmail ? "w-[350px]" : "flex-1"
          )}>
            <div className="p-3 border-b border-border">
              <h2 className="text-sm font-semibold">
                {activeTab === "inbox" ? "All Messages" : "Sent"}
              </h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {filteredEmails.length} message{filteredEmails.length !== 1 ? "s" : ""}
              </p>
            </div>

            <div className="flex-1 overflow-auto">
              {filteredEmails.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                  <div className="text-center">
                    <Mail className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                    <p>No messages yet</p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredEmails.map((email, idx) => (
                    <button
                      key={email.id || idx}
                      onClick={() => setSelectedEmail(email)}
                      className={cn(
                        "w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors",
                        selectedEmail === email && "bg-brand/5 border-l-2 border-l-brand"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {email.direction === "received" ? (
                              <span className="text-[9px] font-bold uppercase text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                                IN
                              </span>
                            ) : (
                              <span className="text-[9px] font-bold uppercase text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                                OUT
                              </span>
                            )}
                            <span className="text-xs font-semibold truncate text-foreground">
                              {email.to.join(", ")}
                            </span>
                          </div>
                          <p className="text-xs font-medium text-foreground mt-1 truncate">
                            {email.subject}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                            {email.body.substring(0, 80)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(email.sent_at).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <span className={cn(
                          "text-[9px] px-1.5 py-0.5 rounded-full font-semibold ml-auto",
                          email.status === "sent"
                            ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-red-50 text-red-700"
                        )}>
                          {email.status}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Email detail panel */}
          {selectedEmail && (
            <div className="flex-1 flex flex-col overflow-auto">
              <div className="p-4 border-b border-border">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-semibold">{selectedEmail.subject}</h3>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs text-muted-foreground">
                        To: {selectedEmail.to.join(", ")}
                      </span>
                      {selectedEmail.cc && selectedEmail.cc.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          Cc: {selectedEmail.cc.join(", ")}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {new Date(selectedEmail.sent_at).toLocaleString()}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => setSelectedEmail(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex-1 p-4">
                <div className="text-sm whitespace-pre-wrap text-foreground leading-relaxed">
                  {selectedEmail.body}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
