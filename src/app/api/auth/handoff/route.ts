import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clearSessionCookie, getCrmWs, getSwitchedCrmALogin, setSessionCookie } from "@/lib/auth";
import { CRM_B_PREFIX } from "@/lib/crm";

/**
 * Where the admin Switch sends everyone (as /crm-b/api/auth/handoff): turns
 * the CRM A login it just ended into a CRM B login, and drops the CRM A
 * cookie so CRM A's URL shows its own login page from then on.
 */
export async function GET(req: NextRequest) {
  const fail = NextResponse.redirect(new URL(`${CRM_B_PREFIX}/login`, req.url));
  if ((await getCrmWs()) !== "b") return fail;

  const old = await getSwitchedCrmALogin();
  if (!old) return fail;
  const user = await prisma.user.findUnique({ where: { id: old.sub } });
  if (!user?.active) return fail;

  await setSessionCookie({
    sub: user.id,
    orgId: user.organizationId,
    role: user.role,
    name: user.name,
    email: user.email,
    ws: "b",
  });
  await clearSessionCookie("a");
  return NextResponse.redirect(new URL(CRM_B_PREFIX, req.url));
}
