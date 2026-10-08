import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/api-auth";
import { isAdmin } from "@/lib/access";
import { switchWorkspace } from "@/lib/workspace";

/** Which CRM is live right now — the sidebar polls this to follow a Switch. */
export async function GET() {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  return NextResponse.json({ orgId: auth.session.orgId });
}

const switchSchema = z.object({ target: z.enum(["A", "B"]) });

/**
 * The "Switch" button in the sidebar — Super Admin only. Moves every user
 * (lead entry, sales, everyone) to CRM B, or back to CRM A. Logins are
 * untouched: getSession() reads the active CRM on every request, so
 * everyone lands in the other CRM on their next page load, still signed in.
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (!isAdmin(auth.session.role)) {
    return NextResponse.json({ error: "Only a Super Admin can do this" }, { status: 403 });
  }
  const parsed = switchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid target" }, { status: 400 });

  const orgId = await switchWorkspace(parsed.data.target);
  return NextResponse.json({ orgId });
}
