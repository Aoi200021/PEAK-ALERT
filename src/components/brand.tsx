import Link from "next/link";

export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="14" fill="#14171b" stroke="#2a2f37" strokeWidth="2" />
      <path
        d="M12 44 L26 24 L34 34 L42 18 L52 44"
        fill="none"
        stroke="#e8eaed"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="42" cy="18" r="5" fill="#f6465d" />
    </svg>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
      <LogoMark />
      <span>PeakAlert</span>
    </Link>
  );
}

export const DISCLAIMER = {
  en: "PeakAlert is a monitoring tool. Alerts are based on rules you configure on public market data; they are not financial advice or predictions. Memecoins are extremely volatile and you can lose everything you invest.",
  es: "PeakAlert es una herramienta de monitoreo. Las alertas se basan en reglas que tú configuras sobre datos públicos de mercado; no son asesoramiento financiero ni predicciones. Los memecoins son extremadamente volátiles y puedes perder todo lo invertido.",
};
