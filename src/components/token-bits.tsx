"use client";

import { CHAIN_LABEL } from "@/lib/validation";
import { timeAgo } from "@/lib/format";
import { cn } from "./ui";
import { useEffect, useState } from "react";

export function TokenAvatar({ src, symbol, size = 28 }: { src?: string | null; symbol?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote token logos from many hosts
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className="shrink-0 rounded-full bg-panel-2 object-cover ring-1 ring-line"
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-panel-2 text-[10px] font-semibold text-muted ring-1 ring-line"
      style={{ width: size, height: size }}
    >
      {(symbol ?? "?").slice(0, 3).toUpperCase()}
    </span>
  );
}

export function ChainTag({ chain }: { chain: string }) {
  return (
    <span className="rounded bg-panel-2 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-faint ring-1 ring-line">
      {CHAIN_LABEL[chain] ?? chain}
    </span>
  );
}

export function Sparkline({ data, width = 96, height = 28 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) {
    return <span className="text-[10px] text-faint">recopilando…</span>;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * width, height - 2 - ((v - min) / span) * (height - 4)]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const up = data[data.length - 1] >= data[0];
  const color = up ? "var(--up)" : "var(--down)";
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="overflow-visible">
      <path d={`${d} L${width},${height} L0,${height} Z`} fill={color} opacity={0.08} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  );
}

/** "Datos actualizados hace Xs" — ticks every second so users always know data age. */
export function DataAge({ at, className, staleAfterSec = 120 }: { at: string | null | undefined; className?: string; staleAfterSec?: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return <span className={cn("text-xs text-faint", className)}>&nbsp;</span>;
  const age = at ? (now - Date.parse(at)) / 1000 : Infinity;
  const stale = age > staleAfterSec;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", stale ? "text-warn" : "text-faint", className)} title={at ?? undefined}>
      <span className={cn("h-1.5 w-1.5 rounded-full", stale ? "bg-warn" : "bg-up pulse-dot")} />
      {at ? `Actualizado ${timeAgo(at, now)}` : "Sin datos"}
    </span>
  );
}
