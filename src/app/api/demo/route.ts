import { NextResponse } from "next/server";
import { getPublicSnapshot } from "@/lib/market/public";

/** Public, unauthenticated preview. Cached 30 s server-side to protect the upstream rate limit. */
export async function GET() {
  const snap = await getPublicSnapshot();
  return NextResponse.json(snap, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30" } });
}
