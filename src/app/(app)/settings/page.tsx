"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { BellRing } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { DISCLAIMER } from "@/components/brand";
import { Badge, Button, ErrorNote, InfoNote, Panel, PanelHeader, Skeleton } from "@/components/ui";
import { api, ApiError, fetcher } from "@/lib/client/api";
import { currentSubscription, disablePush, enablePush, pushSupport, type PushSupport } from "@/lib/client/push";
import type { MeResponse } from "@/lib/client/types";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";

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

      <div className="mt-5">
        <SubscriptionPanel me={me} />
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

const STATUS: Record<string, string> = {
  active: "Activa",
  trialing: "En prueba",
  past_due: "Pago pendiente",
  canceled: "Cancelada",
  unpaid: "Impagada",
  incomplete: "Incompleta",
};

function SubscriptionPanel({ me }: { me?: MeResponse }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  useEffect(() => {
    Promise.resolve().then(() => setSuccess(new URLSearchParams(window.location.search).get("billing") === "success"));
  }, []);

  async function portal() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ url: string }>("/api/billing/portal", { method: "POST", json: {} });
      window.location.assign(r.url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error");
      setBusy(false);
    }
  }

  return (
    <Panel>
      <PanelHeader title="Suscripción" />
      <div className="space-y-3 p-4 text-sm">
        {success && (
          <p className="rounded-md border border-up/25 bg-up/5 px-3 py-2 text-up">
            ¡Pago completado! Tu plan se actualiza en cuanto Stripe confirma el pago (normalmente en segundos).
          </p>
        )}
        {!me ? (
          <Skeleton className="h-16" />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p>
                  Plan <span className="font-medium">{me.plan.name}</span>{" "}
                  <span className="num text-faint">· ${me.plan.priceUsd}/mes</span>
                </p>
                {me.subscription.status && (
                  <p className="mt-0.5 text-xs text-muted">
                    Estado: {STATUS[me.subscription.status] ?? me.subscription.status}
                    {me.subscription.currentPeriodEnd && ` · renueva/termina ${formatDateTime(me.subscription.currentPeriodEnd)}`}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Link href="/pricing">
                  <Button size="sm" variant={me.plan.id === "free" ? "primary" : "secondary"}>
                    {me.plan.id === "free" ? "Mejorar plan" : "Ver planes"}
                  </Button>
                </Link>
                {me.billingEnabled && me.subscription.hasCustomer && (
                  <Button size="sm" onClick={portal} loading={busy}>
                    Gestionar suscripción
                  </Button>
                )}
              </div>
            </div>
            {!me.billingEnabled && (
              <InfoNote>Los pagos todavía no están habilitados en este servidor. Durante la beta el plan se asigna manualmente.</InfoNote>
            )}
          </>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Panel>
  );
}
