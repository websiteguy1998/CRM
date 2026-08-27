import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { logActivity } from "@/lib/timeline";

const schema = z.object({
  title: z.string().min(1),
  type: z.enum(["CALL", "EMAIL", "WHATSAPP", "SMS", "MEETING", "OTHER"]).default("OTHER"),
  dueAt: z.string().min(1),
  notes: z.string().optional(),
  assignedToId: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const { orgId, sub } = auth.session;

  const lead = await prisma.lead.findFirst({ where: { id, organizationId: orgId } });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  const task = await prisma.task.create({
    data: {
      organizationId: orgId,
      leadId: id,
      assignedToId: data.assignedToId ?? lead.ownerId ?? sub,
      title: data.title,
      type: data.type,
      dueAt: new Date(data.dueAt),
      notes: data.notes,
    },
  });

  await logActivity({
    organizationId: orgId,
    leadId: id,
    type: "TASK_CREATED",
    summary: `Follow-up scheduled — ${data.title}`,
    actorId: sub,
    metadata: { taskId: task.id },
  });

  return NextResponse.json({ task }, { status: 201 });
}
