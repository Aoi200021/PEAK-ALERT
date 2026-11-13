/** Formatting helpers. All return "—" for missing data instead of inventing a value. */

const DASH = "—";

const SUBSCRIPT = ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"];

/** Prices of memecoins can be 0.00000002 — render as $0.0₇2 like trading terminals do. */
export function formatPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return DASH;
  if (value === 0) return "$0";
  const abs = Math.abs(value);
  if (abs >= 1000) return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (abs >= 1) return `$${value.toFixed(abs >= 100 ? 2 : 4)}`;
  if (abs >= 0.0001) return `$${value.toPrecision(4).replace(/0+$/, "")}`;
  // Count leading zeros after the decimal point
  const exp = Math.floor(Math.log10(abs));
  const zeros = -exp - 1;
  const digits = (abs / Math.pow(10, exp)).toPrecision(4).replace(".", "").replace(/0+$/, "");
  const sub = String(zeros)
    .split("")
    .map((d) => SUBSCRIPT[Number(d)])
    .join("");
  return `${value < 0 ? "-" : ""}$0.0${sub}${digits}`;
}

export function formatUsdCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return DASH;
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

export function formatUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return DASH;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Math.abs(value) < 1 ? 4 : 2,
  });
}

export function formatPct(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return DASH;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return DASH;
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function timeAgo(date: string | Date | null | undefined, now: number = Date.now(), locale: "en" | "es" = "en"): string {
  const es = locale === "es";
  if (!date) return es ? "nunca" : "never";
  const t = typeof date === "string" ? Date.parse(date) : date.getTime();
  if (!Number.isFinite(t)) return DASH;
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 5) return es ? "ahora" : "just now";
  const ago = (v: string) => (es ? `hace ${v}` : `${v} ago`);
  if (s < 60) return ago(`${s}s`);
  const m = Math.floor(s / 60);
  if (m < 60) return ago(`${m} min`);
  const h = Math.floor(m / 60);
  if (h < 48) return ago(`${h} h`);
  return ago(`${Math.floor(h / 24)} d`);
}

export function formatDateTime(date: string | Date | null | undefined, locale: "en" | "es" = "en"): string {
  if (!date) return DASH;
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString(locale === "es" ? "es" : "en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 5)}…${address.slice(-4)}` : address;
}

export function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
