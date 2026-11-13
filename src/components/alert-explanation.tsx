"use client";

import { AlertTriangle, Eye, Info, Lightbulb, ShieldAlert } from "lucide-react";
import type { AlertExplanation, Severity } from "@/lib/alerts/types";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "./ui";

export const SEVERITY: Record<Severity, { label: { en: string; es: string }; cls: string; dot: string }> = {
  info: { label: { en: "Informational", es: "Informativa" }, cls: "bg-panel-2 text-muted ring-line-strong", dot: "bg-muted" },
  warning: { label: { en: "Caution", es: "Precaución" }, cls: "bg-warn/10 text-warn ring-warn/25", dot: "bg-warn" },
  high: { label: { en: "High risk", es: "Riesgo alto" }, cls: "bg-orange/10 text-orange ring-orange/25", dot: "bg-orange" },
  critical: { label: { en: "Very high risk", es: "Riesgo muy alto" }, cls: "bg-down/10 text-down ring-down/25", dot: "bg-down" },
};

export function SeverityBadge({ severity }: { severity: Severity | null | undefined }) {
  const { p } = useI18n();
  if (!severity) return null;
  const s = SEVERITY[severity];
  return <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ring-1", s.cls)}>{p(s.label)}</span>;
}

const TONE: Record<string, string> = { up: "text-up", down: "text-down", warn: "text-warn", neutral: "text-text" };

/** The 5-part explanation every alert carries (already written in the user's language). */
export function AlertExplanationCard({ e }: { e: AlertExplanation }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-4 rounded-lg border border-line bg-bg/60 p-4 text-[13px] md:grid-cols-2">
      <Section icon={<Info size={14} />} title={t("What's happening", "Qué está pasando")}>{e.what}</Section>
      <Section icon={<AlertTriangle size={14} />} title={t("Why it fired", "Por qué se generó")}>{e.why}</Section>
      {e.indicators.length > 0 && (
        <div className="md:col-span-2">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">
            <Eye size={13} /> {t("Indicators that changed", "Indicadores que cambiaron")}
          </p>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
            {e.indicators.map((i) => (
              <div key={i.label} className="bg-panel px-3 py-2">
                <dt className="truncate text-[11px] text-faint">{i.label}</dt>
                <dd className={cn("num mt-0.5 text-[13px]", TONE[i.tone ?? "neutral"])}>{i.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <Section icon={<ShieldAlert size={14} />} title={t("What risk it represents", "Qué riesgo representa")}>{e.risk}</Section>
      {e.watch.length > 0 && (
        <Section icon={<Lightbulb size={14} />} title={t("What you could watch", "Qué podrías vigilar")}>
          <ul className="list-disc space-y-1 pl-4">
            {e.watch.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Section>
      )}
      <p className="text-[11px] text-faint md:col-span-2">
        {t(
          "PeakAlert doesn't give financial advice or execute trades. Whether to sell or hold is always your decision.",
          "PeakAlert no da asesoramiento financiero ni ejecuta operaciones. La decisión de vender o mantener es siempre tuya.",
        )}
      </p>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">
        {icon} {title}
      </p>
      <div className="leading-relaxed text-muted">{children}</div>
    </div>
  );
}
