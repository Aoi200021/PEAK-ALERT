import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Demo",
  description: "Vista previa de Peak Detection con datos públicos de DexScreener.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
