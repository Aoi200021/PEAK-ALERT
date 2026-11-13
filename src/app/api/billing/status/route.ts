import { NextResponse } from "next/server";
import { billingEnabled } from "@/lib/billing";

/** Public: tells the pricing page whether real payments are enabled. */
export async function GET() {
  return NextResponse.json({ enabled: billingEnabled() });
}
