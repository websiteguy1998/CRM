import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const conversation = await prisma.conversation.findFirst({
    where: { id, organizationId: auth.session.orgId },
    include: {
      lead: { include: { contact: true, owner: true } },
      messages: { orderBy: { createdAt: "asc" }, include: { sentBy: true, attachments: true } },
    },
  });

  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ conversation });
}
