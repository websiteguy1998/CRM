import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { logActivity } from "@/lib/timeline";

const schema = z.object({ completed: z.boolean() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const { orgId, sub } = auth.session;

  const task = await prisma.task.findFirst({ where: { id, organizationId: orgId } });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const updated = await prisma.task.update({
    where: { id },
    data: { completedAt: parsed.data.completed ? new Date() : null },
  });

  if (parsed.data.completed) {
    await logActivity({
      organizationId: orgId,
      leadId: task.leadId,
      type: "TASK_COMPLETED",
      summary: `Follow-up completed — ${task.title}`,
      actorId: sub,
    });
  }

  return NextResponse.json({ task: updated });
}
