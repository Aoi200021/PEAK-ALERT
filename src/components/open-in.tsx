import { ExternalLink } from "lucide-react";
import { cn } from "./ui";

/**
 * Links to view/trade a token in external apps. PeakAlert never trades: these only open
 * the token page in the other app, where the user decides what to do.
 * Formats verified Nov 2026:
 *   Phantom: https://phantom.com/tokens/{solana|ethereum}/{address}  (opens the app on mobile if installed)
 *   fomo:    https://fomo.family/tokens/solana/{mint}
 */
const PHANTOM_CHAINS = new Set(["solana", "ethereum"]);

export function openInLinks(chainId: string, address: string, pairUrl?: string | null) {
  const links: { label: string; href: string }[] = [];
  if (PHANTOM_CHAINS.has(chainId)) links.push({ label: "Phantom", href: `https://phantom.com/tokens/${chainId}/${address}` });
  if (chainId === "solana") links.push({ label: "fomo", href: `https://fomo.family/tokens/solana/${address}` });
  links.push({ label: "DexScreener", href: pairUrl ?? `https://dexscreener.com/${chainId}/${address}` });
  return links;
}

export function OpenIn({ chainId, address, pairUrl, className, compact }: { chainId: string; address: string; pairUrl?: string | null; className?: string; compact?: boolean }) {
  if (!address || address.startsWith("demo-")) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {!compact && <span className="text-[11px] text-faint">Abrir en</span>}
      {openInLinks(chainId, address, pairUrl).map((l) => (
        <a
          key={l.label}
          href={l.href}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-md border border-line-strong bg-panel-2 px-2 py-1 text-xs text-text transition-colors hover:bg-[#1a1e23]"
        >
          {l.label} <ExternalLink size={11} className="text-faint" />
        </a>
      ))}
    </div>
  );
}
