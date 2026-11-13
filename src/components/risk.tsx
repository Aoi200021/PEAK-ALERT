"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { LEVELS, levelFor, type RiskFactor, type RiskLevel } from "@/lib/risk/score";
import { cn } from "./ui";

export const LEVEL_COLOR: Record<RiskLevel, string> = {
  healthy: "var(--up)",
  caution: "var(--warn)",
  elevated: "var(--orange)",
  very_high: "var(--down)",
};

const LEVEL_TEXT: Record<RiskLevel, string> = {
  healthy: "text-up",
  caution: "text-warn",
  elevated: "text-orange",
  very_high: "text-down",
};

const LEVEL_BG: Record<RiskLevel, string> = {
  healthy: "bg-up/10 ring-up/25",
  caution: "bg-warn/10 ring-warn/25",
  elevated: "bg-orange/10 ring-orange/25",
  very_high: "bg-down/10 ring-down/25",
};

export function riskLevel(score: number | null | undefined): RiskLevel | null {
  return score == null ? null : levelFor(score);
}

/** Compact score pill used in tables. */
export function RiskBadge({ score, coverage, size = "md" }: { score: number | null | undefined; coverage?: number | null; size?: "sm" | "md" }) {
  const level = riskLevel(score);
  if (level == null) {
    return <span className="text-xs text-faint" title="Se calcula tras la primera actualización">—</span>;
  }
  const low = coverage != null && coverage < 0.6;
  return (
    <span
      title={`${LEVELS[level].label}${low ? " · datos parciales (historial aún corto)" : ""}`}
      className={cn("num inline-flex items-center gap-1.5 rounded-md ring-1", LEVEL_BG[level], LEVEL_TEXT[level], size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs")}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: LEVEL_COLOR[level] }} />
      {score}
      {low && <span className="text-faint">*</span>}
    </span>
  );
}

/** Semicircle gauge 0–100 with the four bands. */
export function RiskGauge({ score, coverage, size = 180 }: { score: number | null; coverage?: number | null; size?: number }) {
  const r = 70;
  const cx = 90;
  const cy = 86;
  const arc = (from: number, to: number) => {
    const a0 = Math.PI * (1 - from / 100);
    const a1 = Math.PI * (1 - to / 100);
    return `M ${cx + r * Math.cos(a0)} ${cy - r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(a1)} ${cy - r * Math.sin(a1)}`;
  };
  const level = riskLevel(score);
  const angle = Math.PI * (1 - (score ?? 0) / 100);
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.6} viewBox="0 0 180 104" aria-label={score == null ? "Sin puntuación" : `Riesgo ${score} de 100`}>
        {([[0, 30, "healthy"], [30, 60, "caution"], [60, 80, "elevated"], [80, 100, "very_high"]] as const).map(([a, b, l]) => (
          <path key={l} d={arc(a + 0.8, b - 0.8)} fill="none" stroke={LEVEL_COLOR[l]} strokeOpacity={level === l ? 0.95 : 0.22} strokeWidth="10" strokeLinecap="round" />
        ))}
        {score != null && (
          <g style={{ transition: "transform 0.6s ease" }}>
            <line x1={cx} y1={cy} x2={cx + (r - 18) * Math.cos(angle)} y2={cy - (r - 18) * Math.sin(angle)} stroke="var(--text)" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx={cx} cy={cy} r="4.5" fill="var(--text)" />
          </g>
        )}
      </svg>
      <p className={cn("num -mt-1 text-3xl font-medium tracking-tight", level ? LEVEL_TEXT[level] : "text-faint")}>{score ?? "—"}</p>
      <p className="mt-0.5 text-xs text-muted">{level ? LEVELS[level].label : "Calculando…"}</p>
      {coverage != null && coverage < 0.6 && <p className="mt-1 text-[10px] text-faint">Datos parciales: el historial aún es corto</p>}
    </div>
  );
}

export function RiskFactors({ factors, locked }: { factors: RiskFactor[] | null | undefined; locked?: boolean }) {
  if (locked) {
    return (
      <div className="rounded-md border border-line bg-bg/50 p-4 text-center">
        <Lock size={16} className="mx-auto text-faint" />
        <p className="mt-2 text-sm">Desglose de los 8 factores</p>
        <p className="mt-1 text-xs text-muted">Peak Detection avanzado está disponible en Pro y Premium.</p>
        <Link href="/pricing" className="mt-3 inline-block text-xs text-text underline underline-offset-2">Ver planes</Link>
      </div>
    );
  }
  if (!factors?.length) return <p className="text-xs text-muted">Los factores aparecerán tras la próxima actualización.</p>;
  return (
    <ul className="space-y-3">
      {[...factors]
        .sort((a, b) => Number(b.available) - Number(a.available) || b.score - a.score)
        .map((f) => {
          const level = levelFor(f.score);
          return (
            <li key={f.key} className={cn(!f.available && "opacity-55")}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-medium text-text">{f.label}</span>
                <span className="num text-faint">{f.available ? `${f.value ?? ""} · ${f.score}` : "sin datos"}</span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-panel-2">
                <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${f.available ? Math.max(f.score, 2) : 0}%`, background: LEVEL_COLOR[level] }} />
              </div>
              <p className="mt-1 text-[11px] leading-snug text-muted">{f.detail}</p>
            </li>
          );
        })}
    </ul>
  );
}

export const RISK_DISCLAIMER =
  "La puntuación resume señales de mercado con reglas transparentes. No es una probabilidad ni una predicción: el precio puede seguir subiendo con una puntuación alta.";
