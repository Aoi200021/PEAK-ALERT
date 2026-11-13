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
import { TokenAvatar } from "@/components/token-bits";
import { Badge, Button, EmptyState, Field, InfoNote, Modal, Panel, Segmented, Select, Skeleton, cn } from "@/components/ui";
import { ALERT_META } from "@/lib/alerts/types";
import { api, fetcher } from "@/lib/client/api";
import type { EventDTO, MeResponse, RuleDTO, WatchlistResponse } from "@/lib/client/types";
import { formatDateTime, formatPrice, formatUsdCompact, timeAgo, toNum } from "@/lib/format";

type Tab = "rules" | "history";

export default function AlertsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <AlertsView />
    </Suspense>
  );
}

function AlertsView() {
  const search = useSearchParams();
  const router = useRouter();
  const tab: Tab = search.get("tab") === "history" ? "history" : "rules";
  const setTab = (t: Tab) => router.replace(t === "history" ? "/alerts?tab=history" : "/alerts");

  return (
    <>
      <PageHeader
        title="Alertas"
        sub="Reglas que vigilan tus tokens y el historial de avisos."
        actions={
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: "rules", label: "Reglas" },
              { value: "history", label: "Historial" },
            ]}
          />
        }
      />
      {tab === "rules" ? <RulesTab /> : <HistoryTab />}
      <p className="mt-6 text-[11px] leading-relaxed text-faint">
        Las alertas se evalúan en el servidor con datos de DexScreener cada vez que se actualizan (aprox. cada minuto con el job programado,
        o cada 30 s mientras tienes el dashboard abierto). No son señales de compra o venta ni predicen máximos.
      </p>
    </>
  );
}

function RulesTab() {
  const { data, mutate, isLoading } = useSWR<{ rules: RuleDTO[] }>("/api/alerts/rules", fetcher);
  const { data: wl } = useSWR<WatchlistResponse>("/api/watchlist", fetcher);
  const { data: me } = useSWR<MeResponse>("/api/me", fetcher);
  const [creating, setCreating] = useState(false);
  const [tokenId, setTokenId] = useState<string>("");

  const tokens = wl?.tokens ?? [];

  async function toggle(r: RuleDTO) {
    await api(`/api/alerts/rules/${r.id}`, { method: "PATCH", json: { enabled: !r.enabled } }).catch(() => null);
    mutate();
  }
  async function remove(r: RuleDTO) {
    if (!confirm("¿Eliminar esta alerta?")) return;
    await api(`/api/alerts/rules/${r.id}`, { method: "DELETE" }).catch(() => null);
    mutate();
  }

  return (
    <Panel>
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <p className="text-sm font-medium">
          Reglas <span className="num text-faint">{data?.rules.length ?? ""}</span>
        </p>
        <Button size="sm" variant="primary" onClick={() => setCreating(true)} disabled={!tokens.length}>
          <Plus size={13} /> Nueva alerta
        </Button>
      </div>
      {isLoading ? (
        <div className="space-y-2 p-4"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
      ) : !data?.rules.length ? (
        <EmptyState
          icon={<Siren size={26} strokeWidth={1.5} />}
          title="Sin alertas configuradas"
          action={
            tokens.length ? (
              <Button variant="primary" onClick={() => setCreating(true)}><Plus size={14} /> Crear alerta</Button>
            ) : (
              <Link href="/dashboard"><Button variant="primary">Agrega un token primero</Button></Link>
            )
          }
        >
          Ejemplo: avísame si el token cae 15% desde su máximo después de haber superado $1M de market cap.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {data.rules.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3">
              <TokenAvatar src={r.token?.image_url} symbol={r.token?.symbol} />
              <Link href={`/tokens/${r.token_id}`} className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium">{r.token?.symbol}</span>
                  <span className="text-sm text-muted">· {ALERT_META[r.type].label}</span>
                  {!r.enabled ? <Badge>pausada</Badge> : r.armed ? <Badge tone="up">vigilando</Badge> : <Badge tone="warn">disparada · esperando rearme</Badge>}
                  {me && !me.plan.alertTypes.includes(r.type) && <Badge tone="warn">requiere Pro</Badge>}
                </div>
                <p className="mt-0.5 truncate text-xs text-faint">
                  {describeRule(r)} · cooldown {r.cooldown_minutes} min
                  {r.last_triggered_at && ` · último aviso ${timeAgo(r.last_triggered_at)}`}
                </p>
              </Link>
              <div className="flex shrink-0 gap-0.5">
                <button onClick={() => toggle(r)} className="rounded p-1.5 text-faint hover:bg-panel-2 hover:text-text" aria-label={r.enabled ? "Pausar" : "Activar"}>
                  {r.enabled ? <Pause size={14} /> : <Play size={14} />}
                </button>
                <button onClick={() => remove(r)} className="rounded p-1.5 text-faint hover:bg-panel-2 hover:text-down" aria-label="Eliminar">
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Nueva alerta">
        <div className="space-y-4">
          <Field label="Token">
            <Select value={tokenId} onChange={(e) => setTokenId(e.target.value)}>
              <option value="">Selecciona un token…</option>
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
          Tu plan {me?.plan.name} muestra las alertas de las últimas {historyHours} h. El historial completo está disponible en Pro y Premium.{" "}
          <Link href="/settings" className="text-text underline underline-offset-2">Ver planes</Link>
        </InfoNote>
      )}
      <Panel>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="text-sm font-medium">
            Historial {unread > 0 && <span className="num ml-1 rounded bg-down/15 px-1.5 text-[11px] text-down">{unread} sin leer</span>}
          </p>
          {unread > 0 && <Button size="sm" variant="ghost" onClick={markAllRead}>Marcar todo como leído</Button>}
        </div>
        {isLoading ? (
          <div className="space-y-2 p-4"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
        ) : events.length === 0 ? (
          <EmptyState icon={<BellOff size={26} strokeWidth={1.5} />} title="Aún no se ha disparado ninguna alerta">
            Cuando una de tus reglas se cumpla aparecerá aquí, junto con su Paper Exit.
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
                      <Badge>{ALERT_META[e.type]?.short}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{e.message}</p>
                    <p className="mt-1 text-[11px] text-faint">
                      {formatDateTime(e.created_at)} · {timeAgo(e.created_at)}
                      {e.notified_at ? " · push enviado" : e.notify_error ? " · push no entregado" : ""}
                    </p>
                  </div>
                </button>
                {open === e.id && e.paper && (
                  <div className="px-4 pb-4 sm:pl-[60px]">
                    <PaperExitDetails paper={e.paper} />
                    {e.token && (
                      <Link href={`/tokens/${e.token.id}`} className="mt-2 inline-block text-xs text-muted hover:text-text">
                        Ver {e.token.symbol} →
                      </Link>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {hasMore && (
          <div className="border-t border-line p-3 text-center">
            <Button size="sm" variant="ghost" onClick={() => setSize(size + 1)}>Cargar más</Button>
          </div>
        )}
      </Panel>
    </div>
  );
}
