import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { hashPassword } from "@/lib/password";

const schema = z.object({
  active: z.boolean().optional(),
  role: z.enum(["ADMIN", "MANAGER", "AGENT", "QA", "MARKETING", "LEAD_ENTRY"]).optional(),
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
});

/** Admin-only: approve/reject a pending signup, edit a user's profile, or change role/active state. */
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
  const { password, email, ...rest } = parsed.data;

  if (email && email.toLowerCase() !== user.email) {
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...rest,
      ...(email ? { email: email.toLowerCase() } : {}),
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
    },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
  });

  return NextResponse.json({ user: updated });
}

/**
 * Admin-only: permanently remove a user (pending signup, or an active
 * account someone wants gone). Every FK to User is nullable, so instead
 * of blocking on "this user has leads/calls/activity", we detach them —
 * owned leads become Unassigned, activity/notes/messages keep their
 * content with no attributed actor, calls keep their recording/duration
 * with no agent — then delete the user row itself. Nothing business-data
 * gets deleted, only the user record.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (auth.session.role !== "ADMIN") {
    return NextResponse.json({ error: "Only admins can manage users" }, { status: 403 });
  }
  const { id } = await params;

  if (id === auth.session.sub) {
    return NextResponse.json({ error: "You can't delete your own account" }, { status: 400 });
  }

  const user = await prisma.user.findFirst({ where: { id, organizationId: auth.session.orgId } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (user.role === "ADMIN") {
    const otherActiveAdmins = await prisma.user.count({
      where: { organizationId: auth.session.orgId, role: "ADMIN", active: true, id: { not: id } },
    });
    if (otherActiveAdmins === 0) {
      return NextResponse.json({ error: "Can't delete the last active admin" }, { status: 400 });
    }
  }

  await prisma.$transaction([
    prisma.teamMember.deleteMany({ where: { userId: id } }),
    prisma.lead.updateMany({ where: { ownerId: id }, data: { ownerId: null } }),
    prisma.lead.updateMany({ where: { createdById: id }, data: { createdById: null } }),
    prisma.leadStageHistory.updateMany({ where: { changedById: id }, data: { changedById: null } }),
    prisma.task.updateMany({ where: { assignedToId: id }, data: { assignedToId: null } }),
    prisma.note.updateMany({ where: { authorId: id }, data: { authorId: null } }),
    prisma.activity.updateMany({ where: { actorId: id }, data: { actorId: null } }),
    prisma.call.updateMany({ where: { agentId: id }, data: { agentId: null } }),
    prisma.message.updateMany({ where: { sentById: id }, data: { sentById: null } }),
    prisma.user.delete({ where: { id } }),
  ]);

  return NextResponse.json({ ok: true });
}
