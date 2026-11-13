import { NextResponse } from "next/server";
import { handler, requireUser } from "@/lib/api";

/** Not implemented yet — see src/lib/billing/index.ts. Returns 501 honestly. */
export const POST = handler(async () => {
  await requireUser();
  return NextResponse.json(
    { error: { code: "BILLING_NOT_AVAILABLE", message: "Los pagos todavía no están disponibles." } },
    { status: 501 },
  );
});
