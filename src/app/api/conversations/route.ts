import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  const { orgId } = auth.session;

  const { searchParams } = new URL(req.url);
  const channel = searchParams.get("channel");

  const conversations = await prisma.conversation.findMany({
    where: {
      organizationId: orgId,
      ...(channel ? { channel: channel as "WHATSAPP" | "SMS" | "EMAIL" } : {}),
    },
    include: {
      lead: { include: { contact: true, owner: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { lastMessageAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ conversations });
}
