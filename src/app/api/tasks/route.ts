import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  const { orgId } = auth.session;

  const tasks = await prisma.task.findMany({
    where: { organizationId: orgId },
    include: { lead: { include: { contact: true } }, assignedTo: true },
    orderBy: { dueAt: "asc" },
    take: 300,
  });

  return NextResponse.json({ tasks });
}
