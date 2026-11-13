import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description: "PeakAlert plans: Free, Pro ($5/mo) and Premium ($10/mo).",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
