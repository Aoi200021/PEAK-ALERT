"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { ALERT_META, ALERT_TYPES, type AlertType } from "@/lib/alerts/types";
import { api, ApiError } from "@/lib/client/api";
import type { MeResponse, RuleDTO } from "@/lib/client/types";
import { formatUsdCompact } from "@/lib/format";
import { DEFAULT_COOLDOWN_MINUTES } from "@/lib/plans";
import { Button, ErrorNote, Field, InfoNote, Input, Select, cn } from "./ui";

type Values = Record<string, string>;

const DEFAULTS: Record<AlertType, Values> = {
  drawdown_from_peak: { drop_pct: "15", min_peak_market_cap: "" },
  price_spike: { window: "m5", direction: "both", change_pct: "10" },
  volume_drop: { drop_pct: "60", min_avg_hourly_volume_usd: "1000" },
  momentum_loss: { min_gain_h6_pct: "30", drop_h1_pct: "8", min_sell_buy_ratio: "1.2" },
  market_cap_cross: { direction: "above", value_usd: "1000000" },
};

function toValues(type: AlertType, params?: Record<string, unknown>): Values {
  if (!params) return { ...DEFAULTS[type] };
  const v: Values = { ...DEFAULTS[type] };
  for (const [k, val] of Object.entries(params)) v[k] = val == null ? "" : String(val);
  return v;
}

function toParams(type: AlertType, v: Values): Record<string, unknown> {
  const n = (s: string) => (s.trim() === "" ? undefined : Number(s));
  switch (type) {
    case "drawdown_from_peak":
      return { drop_pct: n(v.drop_pct), min_peak_market_cap: n(v.min_peak_market_cap) };
    case "price_spike":
      return { window: v.window, direction: v.direction, change_pct: n(v.change_pct) };
    case "volume_drop":
      return { drop_pct: n(v.drop_pct), min_avg_hourly_volume_usd: n(v.min_avg_hourly_volume_usd) };
    case "momentum_loss":
      return {
        min_gain_h6_pct: n(v.min_gain_h6_pct),
        drop_h1_pct: n(v.drop_h1_pct),
        min_sell_buy_ratio: n(v.min_sell_buy_ratio),
      };
    case "market_cap_cross":
      return { direction: v.direction, value_usd: n(v.value_usd) };
  }
}

export function AlertRuleForm({
  tokenId,
  me,
  existing,
  onSaved,
}: {
  tokenId: string;
  me: MeResponse | undefined;
  existing?: RuleDTO;
  onSaved: () => void;
}) {
  const [type, setType] = useState<AlertType>(existing?.type ?? "drawdown_from_peak");
  const [values, setValues] = useState<Values>(toValues(existing?.type ?? "drawdown_from_peak", existing?.params));
  const [cooldown, setCooldown] = useState(String(existing?.cooldown_minutes ?? DEFAULT_COOLDOWN_MINUTES));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowed = (t: AlertType) =>
    me ? me.plan.alertTypes.includes(t) : t === "drawdown_from_peak" || t === "price_spike";
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const params = toParams(type, values);
      if (existing) {
        await api(`/api/alerts/rules/${existing.id}`, {
          method: "PATCH",
          json: { params, ...(me?.plan.customCooldown ? { cooldownMinutes: Number(cooldown) } : {}) },
        });
      } else {
        await api("/api/alerts/rules", {
          method: "POST",
          json: { tokenId, type, params, ...(me?.plan.customCooldown ? { cooldownMinutes: Number(cooldown) } : {}) },
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la alerta.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {!existing && (
        <div className="grid gap-1.5">
          <span className="text-xs font-medium text-muted">Tipo de alerta</span>
          <div className="grid gap-1.5">
            {ALERT_TYPES.map((t) => {
              const ok = allowed(t);
              return (
                <button
                  type="button"
                  key={t}
                  disabled={!ok}
                  onClick={() => {
                    setType(t);
                    setValues(toValues(t));
                  }}
                  className={cn(
                    "flex items-start gap-3 rounded-md border px-3 py-2 text-left transition-colors",
                    type === t ? "border-text/40 bg-panel-2" : "border-line hover:border-line-strong",
                    !ok && "cursor-not-allowed opacity-50 hover:border-line",
                  )}
                >
                  <span className={cn("mt-1 h-3 w-3 shrink-0 rounded-full border", type === t ? "border-text bg-text" : "border-line-strong")} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm">
                      {ALERT_META[t].label}
                      {!ok && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-warn">
                          <Lock size={10} /> Pro
                        </span>
                      )}
                    </span>
                    <span className="block text-[11px] leading-snug text-faint">{ALERT_META[t].description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {type === "drawdown_from_peak" && (
          <>
            <Field label="Caída desde el máximo (%)">
              <Input type="number" inputMode="decimal" min={1} max={95} step="any" required value={values.drop_pct} onChange={set("drop_pct")} />
            </Field>
            <Field label="Mín. market cap del máximo (USD)" hint={values.min_peak_market_cap ? `≈ ${formatUsdCompact(Number(values.min_peak_market_cap))}` : "Opcional. Ej: 1000000"}>
              <Input type="number" inputMode="decimal" min={0} step="any" value={values.min_peak_market_cap} onChange={set("min_peak_market_cap")} placeholder="Opcional" />
            </Field>
          </>
        )}
        {type === "price_spike" && (
          <>
            <Field label="Ventana">
              <Select value={values.window} onChange={set("window")}>
                <option value="m5">5 minutos</option>
                <option value="h1">1 hora</option>
              </Select>
            </Field>
            <Field label="Dirección">
              <Select value={values.direction} onChange={set("direction")}>
                <option value="both">Subida o caída</option>
                <option value="up">Solo subida</option>
                <option value="down">Solo caída</option>
              </Select>
            </Field>
            <Field label="Variación mínima (%)">
              <Input type="number" inputMode="decimal" min={1} max={1000} step="any" required value={values.change_pct} onChange={set("change_pct")} />
            </Field>
          </>
        )}
        {type === "volume_drop" && (
          <>
            <Field label="Caída del volumen (%)" hint="Última hora vs. promedio horario de las 5 h anteriores">
              <Input type="number" inputMode="decimal" min={10} max={99} step="any" required value={values.drop_pct} onChange={set("drop_pct")} />
            </Field>
            <Field label="Volumen horario mínimo (USD)" hint="Ignora tokens con muy poco volumen">
              <Input type="number" inputMode="decimal" min={0} step="any" value={values.min_avg_hourly_volume_usd} onChange={set("min_avg_hourly_volume_usd")} />
            </Field>
          </>
        )}
        {type === "momentum_loss" && (
          <>
            <Field label="Subida previa en 6 h (%) ≥">
              <Input type="number" inputMode="decimal" min={5} step="any" required value={values.min_gain_h6_pct} onChange={set("min_gain_h6_pct")} />
            </Field>
            <Field label="Caída en 1 h (%) ≥">
              <Input type="number" inputMode="decimal" min={1} max={95} step="any" required value={values.drop_h1_pct} onChange={set("drop_h1_pct")} />
            </Field>
            <Field label="Ratio ventas/compras 1 h ≥" hint="1 = más ventas que compras">
              <Input type="number" inputMode="decimal" min={0.5} max={10} step="any" value={values.min_sell_buy_ratio} onChange={set("min_sell_buy_ratio")} />
            </Field>
          </>
        )}
        {type === "market_cap_cross" && (
          <>
            <Field label="Cuando el market cap">
              <Select value={values.direction} onChange={set("direction")}>
                <option value="above">Supere</option>
                <option value="below">Caiga por debajo de</option>
              </Select>
            </Field>
            <Field label="Valor (USD)" hint={values.value_usd ? `≈ ${formatUsdCompact(Number(values.value_usd))}` : undefined}>
              <Input type="number" inputMode="decimal" min={1} step="any" required value={values.value_usd} onChange={set("value_usd")} />
            </Field>
          </>
        )}
      </div>

      {me?.plan.customCooldown ? (
        <Field label="Cooldown (minutos)" hint="Tiempo mínimo entre dos disparos de esta alerta (5–1440)">
          <Input type="number" min={5} max={1440} step={1} value={cooldown} onChange={(e) => setCooldown(e.target.value)} />
        </Field>
      ) : (
        <p className="text-[11px] text-faint">
          Cada alerta se dispara una vez y se rearma cuando la condición desaparece (o, en caídas desde máximo, cuando hay un nuevo máximo),
          con un mínimo de {DEFAULT_COOLDOWN_MINUTES} min entre avisos.
        </p>
      )}

      {type === "momentum_loss" && (
        <InfoNote>Esta alerta es una heurística sobre datos de DexScreener (variación y número de transacciones). No predice el máximo.</InfoNote>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button type="submit" variant="primary" loading={saving} className="w-full">
        {existing ? "Guardar cambios" : "Crear alerta"}
      </Button>
    </form>
  );
}

export function describeRule(r: Pick<RuleDTO, "type" | "params">): string {
  const p = r.params as Record<string, number | string | undefined>;
  switch (r.type) {
    case "drawdown_from_peak":
      return `Caída ≥ ${p.drop_pct}% desde el máximo${p.min_peak_market_cap ? ` (si máx. MC ≥ ${formatUsdCompact(Number(p.min_peak_market_cap))})` : ""}`;
    case "price_spike":
      return `${p.direction === "up" ? "Subida" : p.direction === "down" ? "Caída" : "Movimiento"} ≥ ${p.change_pct}% en ${p.window === "m5" ? "5 min" : "1 h"}`;
    case "volume_drop":
      return `Volumen 1 h ${p.drop_pct}% bajo su promedio`;
    case "momentum_loss":
      return `+${p.min_gain_h6_pct}% en 6 h, luego −${p.drop_h1_pct}% en 1 h con ventas ≥ ${p.min_sell_buy_ratio}× compras`;
    case "market_cap_cross":
      return `Market cap ${p.direction === "above" ? "supera" : "cae bajo"} ${formatUsdCompact(Number(p.value_usd))}`;
  }
}
