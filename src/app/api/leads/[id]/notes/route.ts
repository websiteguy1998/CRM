import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { logActivity } from "@/lib/timeline";
import { leadWhereForSession } from "@/lib/access";

const schema = z.object({ body: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const { orgId, sub } = auth.session;

  const lead = await prisma.lead.findFirst({
    where: { id, organizationId: orgId, ...leadWhereForSession(auth.session) },
  });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const note = await prisma.note.create({
    data: { organizationId: orgId, leadId: id, authorId: sub, body: parsed.data.body },
  });

  await logActivity({
    organizationId: orgId,
    leadId: id,
    type: "NOTE_ADDED",
    summary: "Note added",
    actorId: sub,
    metadata: { noteId: note.id },
  });

  return NextResponse.json({ note }, { status: 201 });
}
