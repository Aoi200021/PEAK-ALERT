import type { ReactNode } from "react";
import { Logo, DISCLAIMER } from "./brand";

export function AuthLayout({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Logo />
        <h1 className="mt-10 text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted">{sub}</p>
        <div className="mt-6">{children}</div>
      </div>
      <p className="mt-auto max-w-md pt-12 text-center text-[11px] leading-relaxed text-faint">{DISCLAIMER}</p>
    </div>
  );
}
