"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import type { PositionDTO } from "@/lib/client/types";
import { formatPrice, formatUsdCompact, toNum } from "@/lib/format";
import { Button, ErrorNote, Field, Input, Segmented } from "./ui";
import { useI18n } from "@/lib/i18n/client";

/** datetime-local value for "now" in the user's timezone */
function localNow(d = new Date()) {
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

function plainNumber(n: number | null) {
  if (n == null) return "";
  // avoid exponent notation for tiny prices
  return n < 1e-6 ? n.toFixed(14).replace(/0+$/, "") : String(n);
}

export function NewPositionForm({
  tokenId,
  currentPrice,
  currentMarketCap = null,
  onSaved,
}: {
  tokenId: string;
  currentPrice: number | null;
  currentMarketCap?: number | null;
  onSaved: () => void;
}) {
  const [by, setBy] = useState<"price" | "mcap">("price");
  const { t } = useI18n();
  const [entryPrice, setEntryPrice] = useState(plainNumber(currentPrice));
  const [entryMc, setEntryMc] = useState(currentMarketCap ? String(Math.round(currentMarketCap)) : "");
  const [invested, setInvested] = useState("");
  const [entryAt, setEntryAt] = useState(localNow());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api("/api/positions", {
        method: "POST",
        json: {
          tokenId,
          ...(by === "price" ? { entryPrice: Number(entryPrice) } : { entryMarketCap: Number(entryMc) }),
          investedUsd: Number(invested),
          entryAt: new Date(entryAt).toISOString(),
          notes: notes || undefined,
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Couldn't save.", "No se pudo guardar."));
    } finally {
      setSaving(false);
    }
  }

  const derivedPrice =
    by === "mcap" && Number(entryMc) > 0 && currentPrice && currentMarketCap ? Number(entryMc) * (currentPrice / currentMarketCap) : null;
  const effPrice = by === "price" ? Number(entryPrice) : derivedPrice;
  const qty = Number(invested) > 0 && effPrice && effPrice > 0 ? Number(invested) / effPrice : null;

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">{t("Enter entry by", "Indicar entrada por")}</span>
        <Segmented
          value={by}
          onChange={setBy}
          options={[
            { value: "price", label: t("Price", "Precio") },
            ...(currentMarketCap ? [{ value: "mcap" as const, label: "Market cap" }] : []),
          ]}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {by === "price" ? (
          <Field label={t("Entry price (USD)", "Precio de entrada (USD)")} hint={currentPrice ? `${t("Current", "Actual")}: ${formatPrice(currentPrice)}` : undefined}>
            <Input type="number" inputMode="decimal" step="any" min={0} required value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} className="num" />
          </Field>
        ) : (
          <Field
            label={t("Entry market cap (USD)", "Market cap de entrada (USD)")}
            hint={
              derivedPrice
                ? t(`≈ price ${formatPrice(derivedPrice)} (same supply as today)`, `≈ precio ${formatPrice(derivedPrice)} (misma supply que hoy)`)
                : currentMarketCap
                  ? `${t("Current", "Actual")}: ${formatUsdCompact(currentMarketCap)}`
                  : undefined
            }
          >
            <Input type="number" inputMode="decimal" step="any" min={0} required value={entryMc} onChange={(e) => setEntryMc(e.target.value)} className="num" />
          </Field>
        )}
        <Field label={t("Amount invested (USD)", "Monto invertido (USD)")} hint={qty ? `≈ ${qty.toLocaleString("en-US", { maximumFractionDigits: 2 })} tokens` : undefined}>
          <Input type="number" inputMode="decimal" step="any" min={0} required value={invested} onChange={(e) => setInvested(e.target.value)} className="num" />
        </Field>
      </div>
      <Field label={t("Purchase date", "Fecha de compra")}>
        <Input type="datetime-local" required value={entryAt} max={localNow()} onChange={(e) => setEntryAt(e.target.value)} />
      </Field>
      <Field label={t("Notes (optional)", "Notas (opcional)")}>
        <Input maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("e.g. bought after the Raydium listing", "Ej: entré tras listing en Raydium")} />
      </Field>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button type="submit" variant="primary" className="w-full" loading={saving}>
        {t("Add position", "Registrar posición")}
      </Button>
    </form>
  );
}

export function ClosePositionForm({
  position,
  currentPrice,
  onSaved,
}: {
  position: PositionDTO;
  currentPrice: number | null;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [exitPrice, setExitPrice] = useState(plainNumber(toNum(position.exit_price) ?? currentPrice));
  const [exitAt, setExitAt] = useState(localNow());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(`/api/positions/${position.id}`, {
        method: "PATCH",
        json: { exitPrice: Number(exitPrice), exitAt: new Date(exitAt).toISOString() },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Couldn't save.", "No se pudo guardar."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-xs text-muted">
        {t(
          "Record the price you sold at. PeakAlert doesn't execute trades: this only updates your records.",
          "Registra a qué precio vendiste. PeakAlert no ejecuta operaciones: esto solo actualiza tu registro.",
        )}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("Sale price (USD)", "Precio de venta (USD)")} hint={currentPrice ? `${t("Current", "Actual")}: ${formatPrice(currentPrice)}` : undefined}>
          <Input type="number" inputMode="decimal" step="any" min={0} required value={exitPrice} onChange={(e) => setExitPrice(e.target.value)} className="num" />
        </Field>
        <Field label={t("Sale date", "Fecha de venta")}>
          <Input type="datetime-local" required value={exitAt} max={localNow()} onChange={(e) => setExitAt(e.target.value)} />
        </Field>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button type="submit" variant="primary" className="w-full" loading={saving}>
        {t("Record sale", "Registrar venta")}
      </Button>
    </form>
  );
}
