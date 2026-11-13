import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Demo",
  description: "Live Peak Detection preview with public DexScreener data.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
