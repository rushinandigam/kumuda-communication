"use client";

import { Clock, Loader2, Mail, Send, Settings } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type EmailHistoryEntry = {
  to: string[];
  cc: string[] | null;
  subject: string;
  body: string;
  sent_at: string;
  status: string;
};

type EmailConfigState = {
  configured: boolean;
  sender_email?: string;
  sender_name?: string;
} | null;

export default function EmailPage() {
  const { getAccessToken } = useAuth();
  const [config, setConfig] = useState<EmailConfigState>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<EmailHistoryEntry[]>([]);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const fetchHistory = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/v1/email/history", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch {
      // ignore
    }
  }, [getAccessToken]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchConfig(), fetchHistory()]);
      setLoading(false);
    };
    load();
  }, [fetchConfig, fetchHistory]);

  const handleSend = async () => {
    if (!to || !subject || !body) return;

    setSending(true);
    setError(null);
    setSuccess(null);

    try {
      const recipients = to.split(",").map((e) => e.trim()).filter(Boolean);
      const ccList = cc ? cc.split(",").map((e) => e.trim()).filter(Boolean) : undefined;

      const token = await getAccessToken();
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
        fetchHistory();
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Email</h2>
          <p className="text-muted-foreground text-sm">Send emails directly from your browser</p>
        </div>
        <Card className="max-w-lg mx-auto">
          <CardContent className="py-12 text-center">
            <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Email not configured</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Set up your Gmail SMTP credentials to start sending emails.
            </p>
            <Button asChild>
              <Link href="/email/settings">
                <Settings className="h-4 w-4 mr-2" />
                Configure Email
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Email</h2>
          <p className="text-muted-foreground text-sm">
            Sending as {config.sender_name || config.sender_email}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/email/settings">
            <Settings className="h-4 w-4 mr-1" />
            Settings
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        {/* Compose */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="h-4 w-4" />
              Compose
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="to">To</Label>
              <Input
                id="to"
                placeholder="recipient@example.com (comma-separated for multiple)"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cc">Cc (optional)</Label>
              <Input
                id="cc"
                placeholder="cc@example.com"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                placeholder="Email subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="body">Message</Label>
              <Textarea
                id="body"
                placeholder="Write your message..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                className="resize-y"
              />
            </div>

            {error && (
              <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950/20 rounded-md px-3 py-2">
                {error}
              </div>
            )}
            {success && (
              <div className="text-sm text-green-600 bg-green-50 dark:bg-green-950/20 rounded-md px-3 py-2">
                {success}
              </div>
            )}

            <Button
              onClick={handleSend}
              disabled={sending || !to || !subject || !body}
              className="w-full"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send Email
            </Button>
          </CardContent>
        </Card>

        {/* History */}
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" />
            Recent Sent
          </h3>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No emails sent yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map((entry, i) => (
                <Card key={i} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{entry.subject}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        To: {entry.to.join(", ")}
                      </p>
                    </div>
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0",
                      entry.status === "sent"
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-red-100 text-red-700"
                    )}>
                      {entry.status}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {new Date(entry.sent_at).toLocaleString()}
                  </p>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
