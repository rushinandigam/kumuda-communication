"use client";

import { ChevronLeft, Mail } from "lucide-react";
import Link from "next/link";

export default function EmailSettingsPage() {
  return (
    <div className="min-h-screen font-sans">
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
          <h1 className="text-lg font-bold text-foreground">Email</h1>
        </div>
      </div>

      <div className="mx-auto max-w-[1280px] px-6 py-16">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-purple-50 mb-4">
            <Mail size={28} className="text-purple-500" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Coming Soon</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Email configuration will be available here soon.
            You&apos;ll be able to set up SMTP providers, design email templates, and manage campaigns.
          </p>
        </div>
      </div>
    </div>
  );
}
