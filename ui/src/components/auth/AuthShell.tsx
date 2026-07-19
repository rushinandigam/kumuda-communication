import type { ReactNode } from "react";

import { BrandLogo } from "@/components/BrandLogo";

const HIGHLIGHTS = [
  "WhatsApp Business",
  "Voice AI Agents",
  "Campaign Management",
];

export function AuthShell({
  children,
  enterpriseSlot,
}: {
  children: ReactNode;
  enterpriseSlot?: ReactNode;
}) {
  return (
    <div className="grid min-h-screen w-full bg-brand-soft lg:grid-cols-[55%_45%]">
      {/* Form column */}
      <main className="flex min-h-screen flex-col overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-md space-y-6 rounded-2xl border border-brand-border bg-white p-6 shadow-lg sm:p-8">
            <div className="lg:hidden flex justify-center">
              <BrandLogo mark className="h-10" />
            </div>
            {children}
          </div>
        </div>
      </main>

      {/* Brand panel */}
      <aside className="relative hidden flex-col justify-between overflow-hidden border-l border-brand-border bg-brand p-10 lg:flex xl:p-14">
        <div className="relative">
          <div className="flex items-center gap-3">
            <BrandLogo mark className="h-10 brightness-0 invert" />
            <span className="text-2xl font-bold tracking-tight" style={{ color: "var(--brand-gold)" }}>
              KK Connect
            </span>
          </div>
        </div>

        <div className="relative max-w-md space-y-5">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-white xl:text-4xl">
            Your unified communication platform
          </h1>
          <ul className="flex flex-wrap gap-2">
            {HIGHLIGHTS.map((point) => (
              <li
                key={point}
                className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white/90"
              >
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mb-12 max-w-md space-y-3 rounded-xl border border-white/15 bg-white/5 p-5 xl:mb-16">
          <h2 className="text-sm font-semibold text-white">
            Enterprise ready
          </h2>
          <p className="text-sm text-white/70">
            On-prem deployment, data residency, and white-label options available for teams at scale.
          </p>
          {enterpriseSlot}
        </div>
      </aside>
    </div>
  );
}
