import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { isAdmin } from "@/lib/access";
import { switchEveryoneToCrmB } from "@/lib/workspace";

/** Is this login still good? CRM A's sidebar polls it to follow a Switch. */
export async function GET() {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  return NextResponse.json({ ok: true });
}

/**
 * The "Switch" button in CRM A's sidebar — Super Admin only. Logs every
 * user (lead entry, sales, everyone, the admin too) out of CRM A; the app
 * layout then moves each of them into CRM B, still signed in, on their next
 * page load. CRM A is only reachable again by signing in at its own URL.
 */
export async function POST() {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (auth.session.ws !== "a" || !isAdmin(auth.session.role)) {
    return NextResponse.json({ error: "Only a Super Admin can do this" }, { status: 403 });
  }

  await switchEveryoneToCrmB();
  return NextResponse.json({ ok: true });
}
