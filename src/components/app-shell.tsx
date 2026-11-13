"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import useSWR from "swr";
import { Bell, ChartNoAxesColumn, LayoutGrid, LogOut, Settings, ShieldCheck, Siren, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { LogoMark } from "./brand";
import { InstallPrompt } from "./install-prompt";
import { cn } from "./ui";
import { fetcher } from "@/lib/client/api";
import type { MeResponse } from "@/lib/client/types";
import { createClient } from "@/lib/supabase/client";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/alerts", label: "Alertas", icon: Siren },
  { href: "/portfolio", label: "Protección", icon: ShieldCheck },
  { href: "/analytics", label: "Analíticas", icon: ChartNoAxesColumn },
  { href: "/settings", label: "Ajustes", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: me } = useSWR<MeResponse>("/api/me", fetcher, { revalidateOnFocus: false });
  const { data: unread } = useSWR<{ unread: number }>("/api/alerts/events?unread=1&limit=1", fetcher, {
    refreshInterval: 30_000,
  });

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-line bg-bg md:flex">
        <div className="flex h-14 items-center gap-2 px-4">
          <LogoMark />
          <span className="text-[15px] font-semibold tracking-tight">PeakAlert</span>
        </div>
        <nav className="flex-1 space-y-0.5 px-2 py-2">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                active(href) ? "bg-panel-2 text-text" : "text-muted hover:bg-panel hover:text-text",
              )}
            >
              <Icon size={15} strokeWidth={1.8} />
              {label}
              {href === "/alerts" && (unread?.unread ?? 0) > 0 && (
                <span className="num ml-auto rounded bg-down/15 px-1.5 text-[11px] text-down">{unread!.unread}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          {me && (
            <div className="mb-2 px-1">
              <p className="truncate text-xs text-muted">{me.email}</p>
              <p className="mt-0.5 text-[11px] text-faint">
                Plan <span className="text-text">{me.plan.name}</span> · {me.usage.tokens}/{me.plan.maxTokens} tokens
              </p>
              {me.plan.id !== "premium" && (
                <Link href="/pricing" className="mt-2 flex items-center gap-1.5 rounded-md border border-line-strong bg-panel px-2 py-1.5 text-xs text-text hover:bg-panel-2">
                  <Sparkles size={12} className="text-warn" /> Mejorar plan
                </Link>
              )}
            </div>
          )}
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted hover:bg-panel hover:text-text"
          >
            <LogOut size={13} /> Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar (mobile) */}
        <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-line bg-bg/90 px-4 backdrop-blur md:hidden">
          <Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold">
            <LogoMark size={20} /> PeakAlert
          </Link>
          <Link href="/alerts" className="relative rounded p-1.5 text-muted" aria-label="Alertas">
            <Bell size={18} />
            {(unread?.unread ?? 0) > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-down" />}
          </Link>
        </header>

        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pb-24 pt-5 md:px-8 md:pb-10 md:pt-8">
          <InstallPrompt />
          {children}
        </main>

        {/* Bottom nav (mobile) */}
        <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn("flex flex-col items-center gap-0.5 py-2 text-[10px]", active(href) ? "text-text" : "text-faint")}
            >
              <Icon size={18} strokeWidth={1.8} />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {sub && <div className="mt-1 text-sm text-muted">{sub}</div>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
