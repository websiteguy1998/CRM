import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { isAdmin } from "@/lib/access";
import { clearSessionCookie } from "@/lib/auth";

/**
 * The "Switch" button in the sidebar — Super Admin only. Sessions are
 * stateless JWTs, so there's no per-user session to revoke; instead this
 * stamps the org with a timestamp that getSession() checks on every
 * request, so every token issued before right now (every currently logged
 * in user, lead-entry or sales, admin included) stops being honored the
 * next time they load a page or call the API, forcing them back to login.
 */
export async function POST() {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (!isAdmin(auth.session.role)) {
    return NextResponse.json({ error: "Only a Super Admin can do this" }, { status: 403 });
  }

  await prisma.organization.update({
    where: { id: auth.session.orgId },
    data: { sessionsInvalidatedAt: new Date() },
  });

  // The admin who clicked it is logged out too, per the request — their
  // own token is now older than the new timestamp either way.
  await clearSessionCookie();

  return NextResponse.json({ ok: true });
}
