import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Precios",
  description: "Planes Free, Pro ($5/mes) y Premium ($10/mes) de PeakAlert.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
