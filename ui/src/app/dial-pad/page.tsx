"use client";

import { SidebarDialPad } from "@/components/telephony/SidebarDialPad";

export default function DialPadPage() {
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Dial Pad</h2>
        <p className="text-muted-foreground text-sm">
          Make outbound calls directly from your browser
        </p>
      </div>

      <div className="flex justify-center">
        <div className="w-full max-w-[340px]">
          <SidebarDialPad />
        </div>
      </div>
    </div>
  );
}
