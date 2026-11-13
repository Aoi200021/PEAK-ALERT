"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { BellOff, Pause, Play, Plus, Siren, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { AlertRuleForm, describeRule } from "@/components/alert-rule-form";
import { PaperExitDetails } from "@/components/paper-exit";
import { AlertExplanationCard, SeverityBadge } from "@/components/alert-explanation";
import { OpenIn } from "@/components/open-in";
import { TokenAvatar } from "@/components/token-bits";
import { Badge, Button, EmptyState, Field, InfoNote, Modal, Panel, Segmented, Select, Skeleton, cn } from "@/components/ui";
import { ALERT_META } from "@/lib/alerts/types";
import { api, fetcher } from "@/lib/client/api";
import type { EventDTO, MeResponse, PositionDTO, RuleDTO, WatchlistResponse } from "@/lib/client/types";
import { formatDateTime, formatPrice, formatUsd, formatUsdCompact, timeAgo, toNum } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";

type Tab = "rules" | "history";

export default function AlertsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <AlertsView />
    </Suspense>
  );
}

function AlertsView() {
  const { t: tr } = useI18n();
  const search = useSearchParams();
  const router = useRouter();
  const tab: Tab = search.get("tab") === "history" ? "history" : "rules";
  const setTab = (t: Tab) => router.replace(t === "history" ? "/alerts?tab=history" : "/alerts");

  return (
    <>
      <PageHeader
        title={tr("Alerts", "Alertas")}
        sub={tr("Rules that watch your tokens, and your alert history.", "Reglas que vigilan tus tokens y el historial de avisos.")}
        actions={
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: "rules", label: tr("Rules", "Reglas") },
              { value: "history", label: tr("History", "Historial") },
            ]}
          />
        }
      />
      {tab === "rules" ? <RulesTab /> : <HistoryTab />}
      <p className="mt-6 text-[11px] leading-relaxed text-faint">
        {tr(
          "Alerts are evaluated on the server with DexScreener data every time it updates (about every minute via the scheduled job, or every 30 s while the dashboard is open). They are not buy or sell signals and don't predict tops.",
          "Las alertas se evalúan en el servidor con datos de DexScreener cada vez que se actualizan (aprox. cada minuto con el job programado, o cada 30 s mientras tienes el dashboard abierto). No son señales de compra o venta ni predicen máximos.",
        )}
      </p>
    </>
  );
}

function RulesTab() {
  const { t: tr, p: pl, locale } = useI18n();
  const { data, mutate, isLoading } = useSWR<{ rules: RuleDTO[] }>("/api/alerts/rules", fetcher);
  const { data: wl } = useSWR<WatchlistResponse>("/api/watchlist", fetcher);
  const { data: me } = useSWR<MeResponse>("/api/me", fetcher);
  const { data: pos } = useSWR<{ positions: PositionDTO[] }>(me?.plan.portfolio ? "/api/positions" : null, fetcher);
  const [creating, setCreating] = useState(false);
  const [tokenId, setTokenId] = useState<string>("");
  const openPositions = (pos?.positions ?? [])
    .filter((p) => p.token_id === tokenId && p.exit_price == null)
    .map((p) => ({ id: p.id, label: `${formatUsd(toNum(p.invested_usd))} @ ${formatPrice(toNum(p.entry_price))}` }));

  const tokens = wl?.tokens ?? [];

  async function toggle(r: RuleDTO) {
    await api(`/api/alerts/rules/${r.id}`, { method: "PATCH", json: { enabled: !r.enabled } }).catch(() => null);
    mutate();
  }
  async function remove(r: RuleDTO) {
    if (!confirm(tr("Delete this alert?", "¿Eliminar esta alerta?"))) return;
    await api(`/api/alerts/rules/${r.id}`, { method: "DELETE" }).catch(() => null);
    mutate();
  }

  return (
    <Panel>
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <p className="text-sm font-medium">
          {tr("Rules", "Reglas")} <span className="num text-faint">{data?.rules.length ?? ""}</span>
        </p>
        <Button size="sm" variant="primary" onClick={() => setCreating(true)} disabled={!tokens.length}>
          <Plus size={13} /> {tr("New alert", "Nueva alerta")}
        </Button>
      </div>
      {isLoading ? (
        <div className="space-y-2 p-4"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
      ) : !data?.rules.length ? (
        <EmptyState
          icon={<Siren size={26} strokeWidth={1.5} />}
          title={tr("No alerts set up", "Sin alertas configuradas")}
          action={
            tokens.length ? (
              <Button variant="primary" onClick={() => setCreating(true)}><Plus size={14} /> {tr("Create alert", "Crear alerta")}</Button>
            ) : (
              <Link href="/dashboard"><Button variant="primary">{tr("Add a token first", "Agrega un token primero")}</Button></Link>
            )
          }
        >
          {tr(
            "Example: alert me if the token drops 15% from its high after passing $1M market cap.",
            "Ejemplo: avísame si el token cae 15% desde su máximo después de haber superado $1M de market cap.",
          )}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {data.rules.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3">
              <TokenAvatar src={r.token?.image_url} symbol={r.token?.symbol} />
              <Link href={`/tokens/${r.token_id}`} className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium">{r.token?.symbol}</span>
                  <span className="text-sm text-muted">· {pl(ALERT_META[r.type].label)}</span>
                  {!r.enabled ? (
                    <Badge>{tr("paused", "pausada")}</Badge>
                  ) : r.armed ? (
                    <Badge tone="up">{tr("watching", "vigilando")}</Badge>
                  ) : (
                    <Badge tone="warn">{tr("triggered · waiting to re-arm", "disparada · esperando rearme")}</Badge>
                  )}
                  {me && !me.plan.alertTypes.includes(r.type) && <Badge tone="warn">{tr("requires Pro", "requiere Pro")}</Badge>}
                  {r.position && <Badge>{tr("position", "posición")} {formatPrice(toNum(r.position.entry_price))}</Badge>}
                </div>
                <p className="mt-0.5 truncate text-xs text-faint">
                  {describeRule(r, locale)} · cooldown {r.cooldown_minutes} min
                  {r.last_triggered_at && ` · ${tr("last alert", "último aviso")} ${timeAgo(r.last_triggered_at, undefined, locale)}`}
                </p>
              </Link>
              <div className="flex shrink-0 gap-0.5">
                <button onClick={() => toggle(r)} className="rounded p-1.5 text-faint hover:bg-panel-2 hover:text-text" aria-label={r.enabled ? tr("Pause", "Pausar") : tr("Enable", "Activar")}>
                  {r.enabled ? <Pause size={14} /> : <Play size={14} />}
                </button>
                <button onClick={() => remove(r)} className="rounded p-1.5 text-faint hover:bg-panel-2 hover:text-down" aria-label={tr("Delete", "Eliminar")}>
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title={tr("New alert", "Nueva alerta")}>
        <div className="space-y-4">
          <Field label="Token">
            <Select value={tokenId} onChange={(e) => setTokenId(e.target.value)}>
              <option value="">{tr("Select a token…", "Selecciona un token…")}</option>
              {tokens.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.symbol} · {formatPrice(toNum(t.price_usd))} · MC {formatUsdCompact(toNum(t.market_cap))}
                </option>
              ))}
            </Select>
          </Field>
          {tokenId && (
            <AlertRuleForm
              key={tokenId}
              tokenId={tokenId}
              me={me}
              positions={openPositions}
              onSaved={() => {
                setCreating(false);
                setTokenId("");
                mutate();
              }}
            />
          )}
        </div>
      </Modal>
    </Panel>
  );
}

const PAGE = 30;

function HistoryTab() {
  const { t: tr, p: pl, locale } = useI18n();
  const { data: me } = useSWR<MeResponse>("/api/me", fetcher);
  const getKey = (i: number, prev: { events: EventDTO[] } | null) => {
    if (prev && prev.events.length < PAGE) return null;
    const before = prev?.events.at(-1)?.created_at;
    return `/api/alerts/events?limit=${PAGE}${before ? `&before=${encodeURIComponent(before)}` : ""}`;
  };
  const { data, size, setSize, mutate, isLoading } = useSWRInfinite<{ events: EventDTO[]; unread: number; historyHours: number | null }>(
    getKey,
    fetcher,
    { refreshInterval: 30_000 },
  );
  const events = data?.flatMap((d) => d.events) ?? [];
  const hasMore = (data?.at(-1)?.events.length ?? 0) === PAGE;
  const unread = data?.[0]?.unread ?? 0;
  const historyHours = data?.[0]?.historyHours;
  const [open, setOpen] = useState<string | null>(null);

  async function markAllRead() {
    await api("/api/alerts/events/read", { method: "POST", json: {} }).catch(() => null);
    mutate();
  }

  return (
    <div className="space-y-3">
      {historyHours != null && (
        <InfoNote>
          {tr(
            `Your ${me?.plan.name ?? ""} plan shows alerts from the last ${historyHours >= 48 ? `${Math.round(historyHours / 24)} days` : `${historyHours} h`}. Full history is on Premium.`,
            `Tu plan ${me?.plan.name ?? ""} muestra las alertas de ${historyHours >= 48 ? `los últimos ${Math.round(historyHours / 24)} días` : `las últimas ${historyHours} h`}. El historial completo está en Premium.`,
          )}{" "}
          <Link href="/pricing" className="text-text underline underline-offset-2">{tr("See plans", "Ver planes")}</Link>
        </InfoNote>
      )}
      <Panel>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="text-sm font-medium">
            {tr("History", "Historial")} {unread > 0 && <span className="num ml-1 rounded bg-down/15 px-1.5 text-[11px] text-down">{unread} {tr("unread", "sin leer")}</span>}
          </p>
          {unread > 0 && <Button size="sm" variant="ghost" onClick={markAllRead}>{tr("Mark all as read", "Marcar todo como leído")}</Button>}
        </div>
        {isLoading ? (
          <div className="space-y-2 p-4"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
        ) : events.length === 0 ? (
          <EmptyState icon={<BellOff size={26} strokeWidth={1.5} />} title={tr("No alerts have fired yet", "Aún no se ha disparado ninguna alerta")}>
            {tr("When one of your rules is met it will appear here, with its Paper Exit.", "Cuando una de tus reglas se cumpla aparecerá aquí, junto con su Paper Exit.")}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {events.map((e) => (
              <li key={e.id}>
                <button
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-panel-2/50"
                  onClick={() => {
                    setOpen(open === e.id ? null : e.id);
                    if (!e.read_at) api("/api/alerts/events/read", { method: "POST", json: { ids: [e.id] } }).then(() => mutate()).catch(() => null);
                  }}
                >
                  <span className={cn("mt-2 h-1.5 w-1.5 shrink-0 rounded-full", e.read_at ? "bg-transparent" : "bg-down")} />
                  <TokenAvatar src={e.token?.image_url} symbol={e.token?.symbol} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm">{e.title}</span>
                      <Badge>{pl(ALERT_META[e.type]?.short)}</Badge>
                      <SeverityBadge severity={e.severity} />
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{e.explanation?.what ?? e.message}</p>
                    <p className="mt-1 text-[11px] text-faint">
                      {formatDateTime(e.created_at, locale)} · {timeAgo(e.created_at, undefined, locale)}
                      {e.notified_at ? tr(" · push sent", " · push enviado") : e.notify_error ? tr(" · push not delivered", " · push no entregado") : ""}
                    </p>
                  </div>
                </button>
                {open === e.id && (
                  <div className="space-y-3 px-4 pb-4 sm:pl-[60px]">
                    {e.explanation ? <AlertExplanationCard e={e.explanation} /> : <p className="text-xs text-muted">{e.message}</p>}
                    {e.paper && <PaperExitDetails paper={e.paper} />}
                    {e.token && (
                      <div className="flex flex-wrap items-center gap-3">
                        <Link href={`/tokens/${e.token.id}`} className="text-xs text-muted hover:text-text">
                          {tr(`View ${e.token.symbol} in PeakAlert →`, `Ver ${e.token.symbol} en PeakAlert →`)}
                        </Link>
                        <OpenIn chainId={e.token.chain_id} address={e.token.address} />
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {hasMore && (
          <div className="border-t border-line p-3 text-center">
            <Button size="sm" variant="ghost" onClick={() => setSize(size + 1)}>{tr("Load more", "Cargar más")}</Button>
          </div>
        )}
      </Panel>
    </div>
  );
}
