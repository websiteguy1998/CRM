import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";

const schema = z.object({
  active: z.boolean().optional(),
  role: z.enum(["ADMIN", "MANAGER", "AGENT", "QA", "MARKETING", "LEAD_ENTRY"]).optional(),
});

/** Admin-only: approve/reject a pending signup, or change a user's role/active state. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (auth.session.role !== "ADMIN") {
    return NextResponse.json({ error: "Only admins can manage users" }, { status: 403 });
  }
  const { id } = await params;

  const user = await prisma.user.findFirst({ where: { id, organizationId: auth.session.orgId } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const updated = await prisma.user.update({
    where: { id },
    data: parsed.data,
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
  });

  return NextResponse.json({ user: updated });
}

/** Admin-only: reject a pending signup (delete the account request). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (auth.session.role !== "ADMIN") {
    return NextResponse.json({ error: "Only admins can manage users" }, { status: 403 });
  }
  const { id } = await params;

  const user = await prisma.user.findFirst({ where: { id, organizationId: auth.session.orgId } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.active) {
    return NextResponse.json({ error: "Deactivate the user instead of deleting an active account" }, { status: 400 });
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
