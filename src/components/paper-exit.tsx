"use client";

import type { PaperDTO } from "@/lib/client/types";
import { formatPrice, formatUsd, toNum } from "@/lib/format";
import { CHECKPOINTS, changeAfterAlertPct } from "@/lib/paper-exit";
import { Delta } from "./ui";

/**
 * "Paper Exit": what would have happened if you had sold at the alert.
 * Only uses prices PeakAlert actually observed after the alert.
 */
export function PaperExitDetails({ paper, exitPrice }: { paper: PaperDTO; exitPrice?: number | null }) {
  const alertPrice = toNum(paper.alert_price)!;
  const qty = toNum(paper.quantity);
  const last = toNum(paper.last_price);
  const max = toNum(paper.max_price_after);
  const min = toNum(paper.min_price_after);

  const nowChange = changeAfterAlertPct(alertPrice, last);
  const valueAtAlert = qty != null ? qty * alertPrice : null;
  const valueNow = qty != null && last != null ? qty * last : null;
  const diff = valueAtAlert != null && valueNow != null ? valueAtAlert - valueNow : null;

  return (
    <div className="rounded-md border border-line bg-bg/60 p-3 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-muted">Paper Exit · si hubieras vendido en la alerta</span>
        <span className="text-faint">{paper.closed ? "seguimiento cerrado (7 d)" : "en seguimiento"}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5">
        <Cell k="Precio en alerta" v={<span className="num">{formatPrice(alertPrice)}</span>} />
        {CHECKPOINTS.map((c) => {
          const cp = paper.checkpoints?.[c.key];
          return (
            <Cell
              key={c.key}
              k={`Después de ${c.label}`}
              v={cp ? <Delta value={changeAfterAlertPct(alertPrice, cp.price)} digits={1} /> : <span className="text-faint">pendiente</span>}
            />
          );
        })}
        <Cell
          k="Rango posterior"
          v={
            <span className="num">
              <Delta value={changeAfterAlertPct(alertPrice, min)} digits={0} /> / <Delta value={changeAfterAlertPct(alertPrice, max)} digits={0} />
            </span>
          }
        />
      </div>
      <p className="mt-2.5 leading-relaxed text-muted">
        {nowChange == null ? (
          "Aún no hay precios posteriores registrados."
        ) : nowChange < 0 ? (
          <>Desde la alerta el precio cayó <Delta value={nowChange} digits={1} />. Vender en ese momento habría evitado esa caída.</>
        ) : (
          <>Desde la alerta el precio subió <Delta value={nowChange} digits={1} />. Vender en ese momento habría dejado esa subida sobre la mesa.</>
        )}
        {diff != null && (
          <>
            {" "}Con tu posición abierta en ese momento: {formatUsd(valueAtAlert)} al vender vs. {formatUsd(valueNow)} ahora
            (<span className={diff >= 0 ? "text-up" : "text-down"}>{diff >= 0 ? "+" : ""}{formatUsd(diff)}</span> a favor de vender).
          </>
        )}
        {exitPrice != null && (
          <> Tu venta real fue a {formatPrice(exitPrice)} (<Delta value={changeAfterAlertPct(alertPrice, exitPrice)} digits={1} /> vs. precio de la alerta).</>
        )}
      </p>
    </div>
  );
}

function Cell({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-faint">{k}</p>
      <div className="mt-0.5">{v}</div>
    </div>
  );
}
