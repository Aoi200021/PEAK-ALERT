import { NextResponse } from "next/server";
import { handler, requireUser } from "@/lib/api";
import { getPublicSnapshot } from "@/lib/market/public";

/** Market context for the dashboard (SOL price). */
export const GET = handler(async () => {
  await requireUser();
  const snap = await getPublicSnapshot();
  return NextResponse.json({ demo: snap.demo, sol: snap.sol, fetchedAt: snap.fetchedAt });
});
