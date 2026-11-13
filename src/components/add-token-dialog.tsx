"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { api, ApiError } from "@/lib/client/api";
import { formatPct, formatPrice, formatUsdCompact, shortAddress } from "@/lib/format";
import { detectAddressKind } from "@/lib/validation";
import { Button, ErrorNote, InfoNote, Input, Modal, cn } from "./ui";
import { ChainTag, TokenAvatar } from "./token-bits";

interface Candidate {
  chainId: string;
  address: string;
  name: string | null;
  symbol: string | null;
  priceUsd: number | null;
  marketCap: number | null;
  fdv: number | null;
  liquidityUsd: number | null;
  volumeH24: number | null;
  changeH24: number | null;
  dexId: string | null;
  imageUrl: string | null;
  pairCount: number;
}

export function AddTokenDialog({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: (tokenId: string) => void;
}) {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  function reset() {
    setAddress("");
    setError(null);
    setCandidates(null);
    setSelected(null);
  }

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCandidates(null);
    const a = address.trim();
    if (!detectAddressKind(a)) {
      setError("Formato no válido. Pega la contract address (EVM 0x…, Solana, Sui o TON).");
      return;
    }
    setLoading(true);
    try {
      const r = await api<{ candidates: Candidate[]; fetchedAt: string }>(
        `/api/tokens/lookup?address=${encodeURIComponent(a)}`,
      );
      setCandidates(r.candidates);
      setSelected(r.candidates[0]?.chainId ?? null);
      setFetchedAt(r.fetchedAt);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo consultar el token.");
    } finally {
      setLoading(false);
    }
  }

  async function add() {
    const c = candidates?.find((x) => x.chainId === selected);
    if (!c) return;
    setAdding(true);
    setError(null);
    try {
      const r = await api<{ tokenId: string }>("/api/watchlist", {
        method: "POST",
        json: { address: c.address, chainId: c.chainId },
      });
      reset();
      onAdded(r.tokenId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo agregar el token.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Agregar token"
    >
      <form onSubmit={lookup} className="flex gap-2">
        <Input
          autoFocus
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Contract address"
          spellCheck={false}
          autoComplete="off"
          className="num text-[13px]"
          aria-label="Contract address"
        />
        <Button type="submit" variant="primary" loading={loading} disabled={!address.trim()}>
          <Search size={14} /> Buscar
        </Button>
      </form>
      <p className="mt-2 text-[11px] text-faint">Datos de DexScreener. Se usa el par con más liquidez en cada red.</p>

      {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}

      {candidates && candidates.length > 0 && (
        <div className="mt-5 space-y-2">
          {candidates.length > 1 && (
            <InfoNote>
              Esta dirección existe en {candidates.length} redes. Elige la correcta — en otras redes puede ser un token distinto.
            </InfoNote>
          )}
          {candidates.map((c) => (
            <button
              key={c.chainId}
              type="button"
              onClick={() => setSelected(c.chainId)}
              className={cn(
                "w-full rounded-lg border p-3 text-left transition-colors",
                selected === c.chainId ? "border-text/40 bg-panel-2" : "border-line hover:border-line-strong",
              )}
            >
              <div className="flex items-center gap-3">
                <TokenAvatar src={c.imageUrl} symbol={c.symbol} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{c.symbol ?? "?"}</span>
                    <ChainTag chain={c.chainId} />
                  </div>
                  <p className="truncate text-xs text-muted">
                    {c.name ?? "Sin nombre"} · <span className="num">{shortAddress(c.address)}</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="num text-sm">{formatPrice(c.priceUsd)}</p>
                  <p className={cn("num text-xs", (c.changeH24 ?? 0) >= 0 ? "text-up" : "text-down")}>
                    {formatPct(c.changeH24)} 24h
                  </p>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-2.5 text-xs">
                <div>
                  <dt className="text-faint">Market cap</dt>
                  <dd className="num">{formatUsdCompact(c.marketCap ?? c.fdv)}{c.marketCap == null && c.fdv != null ? " (FDV)" : ""}</dd>
                </div>
                <div>
                  <dt className="text-faint">Liquidez</dt>
                  <dd className={cn("num", (c.liquidityUsd ?? 0) < 10_000 && "text-warn")}>{formatUsdCompact(c.liquidityUsd)}</dd>
                </div>
                <div>
                  <dt className="text-faint">Vol. 24h</dt>
                  <dd className="num">{formatUsdCompact(c.volumeH24)}</dd>
                </div>
              </dl>
              {(c.liquidityUsd ?? 0) < 10_000 && (
                <p className="mt-2 text-[11px] text-warn">Liquidez muy baja: los precios pueden ser poco fiables.</p>
              )}
            </button>
          ))}
          {fetchedAt && (
            <p className="text-[11px] text-faint">Consultado {new Date(fetchedAt).toLocaleTimeString("es")}</p>
          )}
          <Button variant="primary" className="mt-2 w-full" onClick={add} loading={adding} disabled={!selected}>
            Seguir token
          </Button>
        </div>
      )}
    </Modal>
  );
}
