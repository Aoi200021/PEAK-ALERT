"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { ALERT_META, ALERT_TYPES, POSITION_ALERT_TYPES, type AlertType } from "@/lib/alerts/types";
import { api, ApiError } from "@/lib/client/api";
import type { MeResponse, RuleDTO } from "@/lib/client/types";
import { formatUsdCompact } from "@/lib/format";
import { DEFAULT_COOLDOWN_MINUTES } from "@/lib/plans";
import { Button, ErrorNote, Field, InfoNote, Input, Select, cn } from "./ui";
import { useI18n } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n";

type Values = Record<string, string>;

const DEFAULTS: Record<AlertType, Values> = {
  drawdown_from_peak: { drop_pct: "15", min_peak_market_cap: "" },
  price_spike: { window: "m5", direction: "both", change_pct: "10" },
  volume_drop: { drop_pct: "60", min_avg_hourly_volume_usd: "1000" },
  momentum_loss: { min_gain_h6_pct: "30", drop_h1_pct: "8", min_sell_buy_ratio: "1.2" },
  market_cap_cross: { direction: "above", value_usd: "1000000" },
  exhaustion_risk: { min_score: "70", min_coverage: "0.6" },
  liquidity_drop: { window: "1h", drop_pct: "15" },
  trend_break: { below_avg_pct: "5", min_gain_h6_pct: "20" },
  trailing_stop: { trail_pct: "20", only_in_profit: "false" },
  profit_giveback: { giveback_pct: "40", min_profit_pct: "50" },
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
    case "exhaustion_risk":
      return { min_score: n(v.min_score), min_coverage: n(v.min_coverage) };
    case "liquidity_drop":
      return { window: v.window, drop_pct: n(v.drop_pct) };
    case "trend_break":
      return { below_avg_pct: n(v.below_avg_pct), min_gain_h6_pct: n(v.min_gain_h6_pct) };
    case "trailing_stop":
      return { trail_pct: n(v.trail_pct), only_in_profit: v.only_in_profit === "true" };
    case "profit_giveback":
      return { giveback_pct: n(v.giveback_pct), min_profit_pct: n(v.min_profit_pct) };
  }
}

export function AlertRuleForm({
  tokenId,
  me,
  existing,
  onSaved,
  positions = [],
  initialType,
  initialPositionId,
}: {
  tokenId: string;
  me: MeResponse | undefined;
  existing?: RuleDTO;
  onSaved: () => void;
  /** Open positions on this token, for trailing stop / giveback rules. */
  positions?: { id: string; label: string }[];
  initialType?: AlertType;
  initialPositionId?: string;
}) {
  const { t: tr, p: pl } = useI18n();
  const startType = existing?.type ?? initialType ?? "drawdown_from_peak";
  const [type, setType] = useState<AlertType>(startType);
  const [values, setValues] = useState<Values>(toValues(startType, existing?.params));
  const [positionId, setPositionId] = useState(initialPositionId ?? positions[0]?.id ?? "");
  const needsPosition = POSITION_ALERT_TYPES.includes(type);
  const [cooldown, setCooldown] = useState(String(existing?.cooldown_minutes ?? DEFAULT_COOLDOWN_MINUTES));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowed = (t: AlertType) =>
    me ? me.plan.alertTypes.includes(t) : t === "drawdown_from_peak" || t === "price_spike" || t === "volume_drop";
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
          json: { tokenId, type, params, ...(needsPosition ? { positionId } : {}), ...(me?.plan.customCooldown ? { cooldownMinutes: Number(cooldown) } : {}) },
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tr("Couldn't save the alert.", "No se pudo guardar la alerta."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {!existing && (
        <div className="grid gap-1.5">
          <span className="text-xs font-medium text-muted">{tr("Alert type", "Tipo de alerta")}</span>
          <div className="grid gap-1.5">
            {ALERT_TYPES.map((t) => {
              const noPosition = POSITION_ALERT_TYPES.includes(t) && positions.length === 0;
              const ok = allowed(t) && !noPosition;
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
                      {pl(ALERT_META[t].label)}
                      {!allowed(t) && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-warn">
                          <Lock size={10} /> Pro
                        </span>
                      )}
                      {allowed(t) && noPosition && <span className="text-[10px] text-faint">{tr("requires an open position", "requiere una posición abierta")}</span>}
                    </span>
                    <span className="block text-[11px] leading-snug text-faint">{pl(ALERT_META[t].description)}</span>
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
            <Field label={tr("Drop from high (%)", "Caída desde el máximo (%)")}>
              <Input type="number" inputMode="decimal" min={1} max={95} step="any" required value={values.drop_pct} onChange={set("drop_pct")} />
            </Field>
            <Field
              label={tr("Min. peak market cap (USD)", "Mín. market cap del máximo (USD)")}
              hint={values.min_peak_market_cap ? `≈ ${formatUsdCompact(Number(values.min_peak_market_cap))}` : tr("Optional. e.g. 1000000", "Opcional. Ej: 1000000")}
            >
              <Input type="number" inputMode="decimal" min={0} step="any" value={values.min_peak_market_cap} onChange={set("min_peak_market_cap")} placeholder={tr("Optional", "Opcional")} />
            </Field>
          </>
        )}
        {type === "price_spike" && (
          <>
            <Field label={tr("Window", "Ventana")}>
              <Select value={values.window} onChange={set("window")}>
                <option value="m5">{tr("5 minutes", "5 minutos")}</option>
                <option value="h1">{tr("1 hour", "1 hora")}</option>
              </Select>
            </Field>
            <Field label={tr("Direction", "Dirección")}>
              <Select value={values.direction} onChange={set("direction")}>
                <option value="both">{tr("Up or down", "Subida o caída")}</option>
                <option value="up">{tr("Up only", "Solo subida")}</option>
                <option value="down">{tr("Down only", "Solo caída")}</option>
              </Select>
            </Field>
            <Field label={tr("Minimum change (%)", "Variación mínima (%)")}>
              <Input type="number" inputMode="decimal" min={1} max={1000} step="any" required value={values.change_pct} onChange={set("change_pct")} />
            </Field>
          </>
        )}
        {type === "volume_drop" && (
          <>
            <Field label={tr("Volume drop (%)", "Caída del volumen (%)")} hint={tr("Last hour vs. hourly average of the previous 5h", "Última hora vs. promedio horario de las 5 h anteriores")}>
              <Input type="number" inputMode="decimal" min={10} max={99} step="any" required value={values.drop_pct} onChange={set("drop_pct")} />
            </Field>
            <Field label={tr("Minimum hourly volume (USD)", "Volumen horario mínimo (USD)")} hint={tr("Ignores tokens with very little volume", "Ignora tokens con muy poco volumen")}>
              <Input type="number" inputMode="decimal" min={0} step="any" value={values.min_avg_hourly_volume_usd} onChange={set("min_avg_hourly_volume_usd")} />
            </Field>
          </>
        )}
        {type === "momentum_loss" && (
          <>
            <Field label={tr("Prior 6h rise (%) ≥", "Subida previa en 6 h (%) ≥")}>
              <Input type="number" inputMode="decimal" min={5} step="any" required value={values.min_gain_h6_pct} onChange={set("min_gain_h6_pct")} />
            </Field>
            <Field label={tr("1h drop (%) ≥", "Caída en 1 h (%) ≥")}>
              <Input type="number" inputMode="decimal" min={1} max={95} step="any" required value={values.drop_h1_pct} onChange={set("drop_h1_pct")} />
            </Field>
            <Field label={tr("1h sells/buys ratio ≥", "Ratio ventas/compras 1 h ≥")} hint={tr("1 = more sells than buys", "1 = más ventas que compras")}>
              <Input type="number" inputMode="decimal" min={0.5} max={10} step="any" value={values.min_sell_buy_ratio} onChange={set("min_sell_buy_ratio")} />
            </Field>
          </>
        )}
        {type === "market_cap_cross" && (
          <>
            <Field label={tr("When market cap", "Cuando el market cap")}>
              <Select value={values.direction} onChange={set("direction")}>
                <option value="above">{tr("Goes above", "Supere")}</option>
                <option value="below">{tr("Falls below", "Caiga por debajo de")}</option>
              </Select>
            </Field>
            <Field label={tr("Value (USD)", "Valor (USD)")} hint={values.value_usd ? `≈ ${formatUsdCompact(Number(values.value_usd))}` : undefined}>
              <Input type="number" inputMode="decimal" min={1} step="any" required value={values.value_usd} onChange={set("value_usd")} />
            </Field>
          </>
        )}
        {type === "exhaustion_risk" && (
          <>
            <Field label={tr("Minimum score (31–100)", "Puntuación mínima (31–100)")} hint={tr("61–80 elevated risk · 81–100 very high", "61–80 riesgo elevado · 81–100 muy elevado")}>
              <Input type="number" min={31} max={100} step={1} required value={values.min_score} onChange={set("min_score")} />
            </Field>
            <Field label={tr("Minimum data coverage", "Cobertura mínima de datos")} hint={tr("Ignores scores computed with little history", "Ignora puntuaciones calculadas con poco historial")}>
              <Select value={values.min_coverage} onChange={set("min_coverage")}>
                <option value="0.4">{tr("Low (40%)", "Baja (40%)")}</option>
                <option value="0.6">{tr("Medium (60%)", "Media (60%)")}</option>
                <option value="0.8">{tr("High (80%)", "Alta (80%)")}</option>
              </Select>
            </Field>
          </>
        )}
        {type === "liquidity_drop" && (
          <>
            <Field label={tr("Window", "Ventana")}>
              <Select value={values.window} onChange={set("window")}>
                <option value="1h">{tr("1 hour", "1 hora")}</option>
                <option value="6h">{tr("6 hours", "6 horas")}</option>
              </Select>
            </Field>
            <Field label={tr("Liquidity drop (%)", "Caída de liquidez (%)")}>
              <Input type="number" inputMode="decimal" min={3} max={95} step="any" required value={values.drop_pct} onChange={set("drop_pct")} />
            </Field>
          </>
        )}
        {type === "trend_break" && (
          <>
            <Field label={tr("% below the 1h average", "% por debajo de la media de 1 h")}>
              <Input type="number" inputMode="decimal" min={1} max={50} step="any" required value={values.below_avg_pct} onChange={set("below_avg_pct")} />
            </Field>
            <Field label={tr("After rising over 6h at least (%)", "Tras subir en 6 h al menos (%)")} hint={tr("0 = any trend", "0 = cualquier tendencia")}>
              <Input type="number" inputMode="decimal" min={0} step="any" value={values.min_gain_h6_pct} onChange={set("min_gain_h6_pct")} />
            </Field>
          </>
        )}
        {needsPosition && (
          <div className="sm:col-span-2">
            <Field label={tr("Position to protect", "Posición a proteger")}>
              <Select value={positionId} onChange={(e) => setPositionId(e.target.value)} disabled={Boolean(existing)}>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </Select>
            </Field>
          </div>
        )}
        {type === "trailing_stop" && (
          <>
            <Field label={tr("Trailing (% from the high since your entry)", "Trailing (% desde el máximo desde tu entrada)")}>
              <Input type="number" inputMode="decimal" min={1} max={90} step="any" required value={values.trail_pct} onChange={set("trail_pct")} />
            </Field>
            <Field label={tr("Only while the position is in profit", "Solo si la posición está en beneficio")}>
              <Select value={values.only_in_profit} onChange={set("only_in_profit")}>
                <option value="false">{tr("No, always alert", "No, avisar siempre")}</option>
                <option value="true">{tr("Yes", "Sí")}</option>
              </Select>
            </Field>
          </>
        )}
        {type === "profit_giveback" && (
          <>
            <Field label={tr("Alert when giving back (% of max profit)", "Avisar al devolver (% del beneficio máx.)")}>
              <Input type="number" inputMode="decimal" min={5} max={100} step="any" required value={values.giveback_pct} onChange={set("giveback_pct")} />
            </Field>
            <Field label={tr("Once profit has exceeded (%)", "Una vez superado un beneficio de (%)")}>
              <Input type="number" inputMode="decimal" min={1} step="any" value={values.min_profit_pct} onChange={set("min_profit_pct")} />
            </Field>
          </>
        )}
      </div>

      {me?.plan.customCooldown ? (
        <Field label={tr("Cooldown (minutes)", "Cooldown (minutos)")} hint={tr("Minimum time between two firings of this alert (5–1440)", "Tiempo mínimo entre dos disparos de esta alerta (5–1440)")}>
          <Input type="number" min={5} max={1440} step={1} value={cooldown} onChange={(e) => setCooldown(e.target.value)} />
        </Field>
      ) : (
        <p className="text-[11px] text-faint">
          {tr(
            `Each alert fires once and re-arms when the condition clears (or, for drops from the high, when there's a new high), with at least ${DEFAULT_COOLDOWN_MINUTES} min between alerts.`,
            `Cada alerta se dispara una vez y se rearma cuando la condición desaparece (o, en caídas desde máximo, cuando hay un nuevo máximo), con un mínimo de ${DEFAULT_COOLDOWN_MINUTES} min entre avisos.`,
          )}
        </p>
      )}

      {type === "exhaustion_risk" && (
        <InfoNote>
          {tr(
            "The Peak Detection score combines 8 signals (momentum, volume, sell pressure, rejections at the high, liquidity…). It's a heuristic, not a probability.",
            "La puntuación de Peak Detection combina 8 señales (momentum, volumen, presión de venta, rechazos del máximo, liquidez…). Es una heurística, no una probabilidad.",
          )}
        </InfoNote>
      )}
      {needsPosition && (
        <InfoNote>
          {tr(
            "The high is measured with the prices PeakAlert has observed since your entry. PeakAlert only alerts: it doesn't sell for you.",
            "El máximo se mide con los precios que PeakAlert ha observado desde tu entrada. PeakAlert solo avisa: no vende por ti.",
          )}
        </InfoNote>
      )}
      {type === "momentum_loss" && (
        <InfoNote>
          {tr(
            "This alert is a heuristic on DexScreener data (price change and transaction counts). It doesn't predict the top.",
            "Esta alerta es una heurística sobre datos de DexScreener (variación y número de transacciones). No predice el máximo.",
          )}
        </InfoNote>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button type="submit" variant="primary" loading={saving} className="w-full" disabled={needsPosition && !positionId}>
        {existing ? tr("Save changes", "Guardar cambios") : tr("Create alert", "Crear alerta")}
      </Button>
    </form>
  );
}

export function describeRule(r: Pick<RuleDTO, "type" | "params">, locale: Locale = "en"): string {
  const p = r.params as Record<string, number | string | undefined>;
  const es = locale === "es";
  const T = (en: string, sp: string) => (es ? sp : en);
  switch (r.type) {
    case "drawdown_from_peak":
      return T(
        `Drop ≥ ${p.drop_pct}% from the high${p.min_peak_market_cap ? ` (if peak MC ≥ ${formatUsdCompact(Number(p.min_peak_market_cap))})` : ""}`,
        `Caída ≥ ${p.drop_pct}% desde el máximo${p.min_peak_market_cap ? ` (si máx. MC ≥ ${formatUsdCompact(Number(p.min_peak_market_cap))})` : ""}`,
      );
    case "price_spike": {
      const dir = p.direction === "up" ? T("Rise", "Subida") : p.direction === "down" ? T("Drop", "Caída") : T("Move", "Movimiento");
      return T(`${dir} ≥ ${p.change_pct}% in ${p.window === "m5" ? "5 min" : "1h"}`, `${dir} ≥ ${p.change_pct}% en ${p.window === "m5" ? "5 min" : "1 h"}`);
    }
    case "volume_drop":
      return T(`1h volume ${p.drop_pct}% below its average`, `Volumen 1 h ${p.drop_pct}% bajo su promedio`);
    case "momentum_loss":
      return T(
        `+${p.min_gain_h6_pct}% over 6h, then −${p.drop_h1_pct}% over 1h with sells ≥ ${p.min_sell_buy_ratio}× buys`,
        `+${p.min_gain_h6_pct}% en 6 h, luego −${p.drop_h1_pct}% en 1 h con ventas ≥ ${p.min_sell_buy_ratio}× compras`,
      );
    case "market_cap_cross":
      return T(
        `Market cap ${p.direction === "above" ? "goes above" : "falls below"} ${formatUsdCompact(Number(p.value_usd))}`,
        `Market cap ${p.direction === "above" ? "supera" : "cae bajo"} ${formatUsdCompact(Number(p.value_usd))}`,
      );
    case "exhaustion_risk":
      return T(`Risk score ≥ ${p.min_score}/100`, `Puntuación de riesgo ≥ ${p.min_score}/100`);
    case "liquidity_drop":
      return T(`Liquidity −${p.drop_pct}% in ${p.window}`, `Liquidez −${p.drop_pct}% en ${p.window}`);
    case "trend_break":
      return T(
        `Price ${p.below_avg_pct}% below its 1h average${Number(p.min_gain_h6_pct) > 0 ? ` after +${p.min_gain_h6_pct}% over 6h` : ""}`,
        `Precio ${p.below_avg_pct}% bajo su media de 1 h${Number(p.min_gain_h6_pct) > 0 ? ` tras +${p.min_gain_h6_pct}% en 6 h` : ""}`,
      );
    case "trailing_stop":
      return T(
        `Trailing stop ${p.trail_pct}% from the high since entry${String(p.only_in_profit) === "true" ? " (only in profit)" : ""}`,
        `Trailing stop ${p.trail_pct}% desde el máximo desde la entrada${String(p.only_in_profit) === "true" ? " (solo en beneficio)" : ""}`,
      );
    case "profit_giveback":
      return T(`Give back ${p.giveback_pct}% of max profit (after +${p.min_profit_pct}%)`, `Devolver ${p.giveback_pct}% del beneficio máx. (tras +${p.min_profit_pct}%)`);
  }
}
