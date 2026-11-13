"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { BellRing, Check } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { DISCLAIMER } from "@/components/brand";
import { Badge, Button, ErrorNote, InfoNote, Panel, PanelHeader, Skeleton, cn } from "@/components/ui";
import { api, ApiError, fetcher } from "@/lib/client/api";
import { currentSubscription, disablePush, enablePush, pushSupport, type PushSupport } from "@/lib/client/push";
import type { MeResponse } from "@/lib/client/types";
import { PLANS, type PlanId } from "@/lib/plans";

export default function SettingsPage() {
  const { data: me, mutate } = useSWR<MeResponse>("/api/me", fetcher);

  return (
    <>
      <PageHeader title="Ajustes" />
      <div className="grid gap-5 lg:grid-cols-2">
        <NotificationsPanel me={me} onChange={() => mutate()} />
        <Panel>
          <PanelHeader title="Cuenta" />
          <div className="space-y-2 p-4 text-sm">
            {me ? (
              <>
                <Row k="Email" v={me.email} />
                <Row k="Plan" v={<Badge>{me.plan.name}</Badge>} />
                <Row k="Tokens" v={<span className="num">{me.usage.tokens} / {me.plan.maxTokens}</span>} />
                <Row k="Reglas de alerta" v={<span className="num">{me.usage.rules}</span>} />
              </>
            ) : (
              <Skeleton className="h-24" />
            )}
          </div>
        </Panel>
      </div>

      <h2 className="mb-3 mt-8 text-sm font-medium">Planes</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {(Object.keys(PLANS) as PlanId[]).map((id) => {
          const p = PLANS[id];
          const current = me?.plan.id === id;
          return (
            <Panel key={id} className={cn("flex flex-col p-5", current && "border-text/30")}>
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{p.name}</h3>
                {current && <Badge tone="up">Tu plan</Badge>}
              </div>
              <p className="mt-1 text-xs text-faint">{id === "free" ? "Gratis" : "Precio por definir"}</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2 text-muted">
                    <Check size={14} className="mt-0.5 shrink-0 text-up" /> {f}
                  </li>
                ))}
              </ul>
              {!current && id !== "free" && (
                <Button className="mt-5" disabled title="Pagos aún no disponibles">
                  Próximamente
                </Button>
              )}
            </Panel>
          );
        })}
      </div>
      <div className="mt-3">
        <InfoNote>
          Los pagos todavía no están habilitados. Durante la beta, el plan se asigna manualmente — contacta al equipo si quieres probar Pro o
          Premium.
        </InfoNote>
      </div>
      <p className="mt-8 max-w-3xl text-[11px] leading-relaxed text-faint">{DISCLAIMER}</p>
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line pb-2 last:border-0">
      <span className="text-muted">{k}</span>
      <span className="truncate">{v}</span>
    </div>
  );
}

function NotificationsPanel({ me, onChange }: { me?: MeResponse; onChange: () => void }) {
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    Promise.resolve()
      .then(() => {
        setSupport(pushSupport());
        return currentSubscription();
      })
      .then((sub) => setSubscribed(Boolean(sub)))
      .catch(() => setSubscribed(false));
  }, []);

  async function run(fn: () => Promise<void>, ok: string) {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await fn();
      setMsg(ok);
      setSubscribed(Boolean(await currentSubscription()));
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const r = await api<{ delivered: number; error: string | null }>("/api/push/test", { method: "POST" });
      setMsg(r.delivered > 0 ? `Enviada a ${r.delivered} dispositivo(s).` : `No se entregó${r.error ? `: ${r.error}` : ""}.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <PanelHeader title="Notificaciones" sub="Web Push: recibe las alertas aunque PeakAlert no esté abierto." />
      <div className="space-y-3 p-4 text-sm">
        {me && !me.pushConfigured && (
          <InfoNote tone="warn">El servidor no tiene claves VAPID configuradas. Las alertas solo aparecerán dentro de la app.</InfoNote>
        )}
        {support === "unsupported" && <InfoNote>Este navegador no soporta notificaciones push.</InfoNote>}
        {support === "ios-needs-install" && (
          <InfoNote>
            En iPhone/iPad: abre PeakAlert en Safari → Compartir → &ldquo;Añadir a pantalla de inicio&rdquo;, y activa las notificaciones
            desde la app instalada (iOS 16.4+).
          </InfoNote>
        )}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BellRing size={16} className={subscribed ? "text-up" : "text-faint"} />
            <span>
              {subscribed == null ? "Comprobando…" : subscribed ? "Activadas en este dispositivo" : "Desactivadas en este dispositivo"}
            </span>
          </div>
          {support === "supported" &&
            (subscribed ? (
              <Button size="sm" variant="ghost" loading={busy} onClick={() => run(disablePush, "Notificaciones desactivadas.")}>
                Desactivar
              </Button>
            ) : (
              <Button
                size="sm"
                variant="primary"
                loading={busy}
                disabled={!me?.pushConfigured}
                onClick={() => run(enablePush, "Notificaciones activadas.")}
              >
                Activar
              </Button>
            ))}
        </div>
        {me && (
          <p className="text-xs text-faint">
            Dispositivos registrados: <span className="num">{me.usage.pushDevices}</span>
          </p>
        )}
        {subscribed && (
          <Button size="sm" onClick={test} loading={busy}>
            Enviar notificación de prueba
          </Button>
        )}
        {msg && <p className="text-xs text-up">{msg}</p>}
        {error && <ErrorNote>{error}</ErrorNote>}
        <p className="text-[11px] text-faint">
          Email y Telegram aún no están disponibles; la arquitectura de canales está preparada para añadirlos.
        </p>
      </div>
    </Panel>
  );
}
