"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "./ui";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const KEY = "peakalert:install-dismissed";

function dismissedRecently() {
  try {
    const v = localStorage.getItem(KEY);
    return v != null && Date.now() - Number(v) < 14 * 86_400_000;
  } catch {
    return false;
  }
}

/**
 * "Install PeakAlert" banner.
 * Android/desktop Chrome: uses the native install prompt.
 * iPhone/iPad Safari: shows the Share → Add to Home Screen steps (iOS has no install API).
 */
export function InstallPrompt() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone || dismissedRecently()) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    const ua = navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
    const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
    if (isIos && isSafari) {
      Promise.resolve().then(() => {
        setIos(true);
        setHidden(false);
      });
    }
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {
      /* private mode */
    }
    setHidden(true);
  }

  async function install() {
    if (!evt) return;
    await evt.prompt();
    const choice = await evt.userChoice;
    if (choice.outcome === "accepted") setHidden(true);
    setEvt(null);
  }

  if (hidden || (!evt && !ios)) return null;

  return (
    <div className="rise mb-5 flex items-start gap-3 rounded-lg border border-line-strong bg-panel px-4 py-3 text-sm">
      {/* eslint-disable-next-line @next/next/no-img-element -- local static icon */}
      <img src="/icon-192.png" alt="" width={36} height={36} className="shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Instala PeakAlert</p>
        {ios ? (
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            Pulsa <Share size={12} className="inline -mt-0.5" /> <b className="text-text">Compartir</b> y luego{" "}
            <b className="text-text">Añadir a pantalla de inicio</b>. Así se abre como app y puedes recibir notificaciones (iOS 16.4+).
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-muted">Ábrela como app desde tu pantalla de inicio y recibe las alertas al instante.</p>
        )}
        {evt && (
          <Button size="sm" variant="primary" className="mt-2" onClick={install}>
            <Download size={13} /> Instalar
          </Button>
        )}
      </div>
      <button onClick={dismiss} className="rounded p-1 text-faint hover:text-text" aria-label="Cerrar">
        <X size={15} />
      </button>
    </div>
  );
}
