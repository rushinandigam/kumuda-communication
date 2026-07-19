"use client";

import { Users } from "lucide-react";

export default function ContactsPage() {
  return (
    <div className="min-h-screen font-sans">
      <div className="border-b border-brand-border bg-brand-soft">
        <div className="mx-auto max-w-[1280px] px-6 py-5">
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight">Contacts</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your contact lists and segments</p>
        </div>
      </div>

      <div className="mx-auto max-w-[1280px] px-6 py-16">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/10 mb-4">
            <Users size={28} className="text-brand" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Coming Soon</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Contact management will be available here. You&apos;ll be able to import, organize, and segment your contacts for campaigns.
          </p>
        </div>
      </div>
    </div>
  );
}
