"use client";

import { ArrowLeft, Eye, EyeOff, Loader2, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

export default function EmailSettingsPage() {
  const { getAccessToken } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [smtpHost, setSmtpHost] = useState("smtp.gmail.com");
  const [smtpPort, setSmtpPort] = useState("587");
  const [senderEmail, setSenderEmail] = useState("");
  const [senderName, setSenderName] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch("/api/v1/email/config", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data) {
            setSmtpHost(data.smtp_host || "smtp.gmail.com");
            setSmtpPort(String(data.smtp_port || 587));
            setSenderEmail(data.sender_email || "");
            setSenderName(data.sender_name || "");
            setIsConfigured(true);
          }
        }
      } catch {
        // not configured
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, [getAccessToken]);

  const handleSave = async () => {
    if (!senderEmail || !appPassword) {
      setError("Email and app password are required");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const token = await getAccessToken();
      const res = await fetch("/api/v1/email/config", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          smtp_host: smtpHost,
          smtp_port: Number(smtpPort),
          sender_email: senderEmail,
          sender_name: senderName || null,
          app_password: appPassword,
        }),
      });

      if (res.ok) {
        setSuccess("Configuration saved! SMTP credentials verified.");
        setIsConfigured(true);
        setAppPassword("");
      } else {
        const err = await res.json().catch(() => ({ detail: "Failed to save" }));
        setError(err.detail || "Failed to save configuration");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const token = await getAccessToken();
      await fetch("/api/v1/email/config", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      setIsConfigured(false);
      setSenderEmail("");
      setSenderName("");
      setAppPassword("");
      setSuccess("Configuration removed.");
    } catch {
      setError("Failed to remove configuration");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link href="/email">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Email
          </Link>
        </Button>
        <h2 className="text-2xl font-bold">Email Settings</h2>
        <p className="text-muted-foreground text-sm">
          Configure Gmail SMTP to send emails from your account
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Gmail SMTP Configuration</CardTitle>
          <CardDescription>
            Use a Gmail App Password to authenticate. Go to{" "}
            <a
              href="https://myaccount.google.com/apppasswords"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand underline"
            >
              Google App Passwords
            </a>{" "}
            to generate one (requires 2FA enabled).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="smtp_host">SMTP Host</Label>
              <Input
                id="smtp_host"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="smtp.gmail.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp_port">SMTP Port</Label>
              <Input
                id="smtp_port"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
                placeholder="587"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sender_email">Gmail Address</Label>
            <Input
              id="sender_email"
              type="email"
              value={senderEmail}
              onChange={(e) => setSenderEmail(e.target.value)}
              placeholder="your-email@gmail.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sender_name">Display Name (optional)</Label>
            <Input
              id="sender_name"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder="KK Connect"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="app_password">
              App Password {isConfigured && <span className="text-xs text-muted-foreground">(enter new to update)</span>}
            </Label>
            <div className="relative">
              <Input
                id="app_password"
                type={showPassword ? "text" : "password"}
                value={appPassword}
                onChange={(e) => setAppPassword(e.target.value)}
                placeholder={isConfigured ? "••••••••••••••••" : "16-character app password"}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
            </div>
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

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving || !senderEmail || !appPassword}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              {isConfigured ? "Update" : "Save & Verify"}
            </Button>

            {isConfigured && (
              <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Remove
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
