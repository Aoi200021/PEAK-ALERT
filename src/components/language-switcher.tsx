"use client";

import { Languages } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n";
import { cn } from "./ui";

/** EN / ES toggle. Saves a cookie, syncs the account language and refreshes server-rendered text. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className={cn("inline-flex items-center gap-1.5", className)} title={t("Language", "Idioma")}>
      <Languages size={13} className="text-faint" aria-hidden />
      <div className="inline-flex rounded-md border border-line bg-bg p-0.5" role="group" aria-label={t("Language", "Idioma")}>
        {(["en", "es"] as Locale[]).map((l) => (
          <button
            key={l}
            onClick={() => l !== locale && setLocale(l)}
            aria-pressed={l === locale}
            className={cn(
              "rounded px-2 py-0.5 text-[11px] font-medium uppercase transition-colors",
              l === locale ? "bg-panel-2 text-text ring-1 ring-line-strong" : "text-muted hover:text-text",
            )}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}
