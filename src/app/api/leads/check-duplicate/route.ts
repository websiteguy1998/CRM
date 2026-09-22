import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { findDuplicateLead } from "@/lib/duplicate-lead";

/**
 * Live duplicate check while filling out the New lead form — called as
 * soon as the website URL (or phone/email) field is filled in, so a lead
 * entry agent finds out before finishing the rest of the form instead of
 * only on submit.
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (auth.session.role !== "ADMIN" && auth.session.role !== "LEAD_ENTRY") {
    return NextResponse.json({ error: "Not permitted for this role" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const websiteUrl = searchParams.get("websiteUrl") ?? undefined;
  const phone = searchParams.get("phone") ?? undefined;
  const email = searchParams.get("email") ?? undefined;

  if (!websiteUrl && !phone && !email) {
    return NextResponse.json({ duplicate: null });
  }

  const duplicate = await findDuplicateLead(auth.session.orgId, { websiteUrl, phone, email });
  if (!duplicate) return NextResponse.json({ duplicate: null });

  return NextResponse.json({
    duplicate: { id: duplicate.id, clientName: duplicate.contact.firstName },
  });
}
