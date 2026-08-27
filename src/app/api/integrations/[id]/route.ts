import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (auth.session.role !== "ADMIN") {
    return NextResponse.json({ error: "Only admins can manage integrations" }, { status: 403 });
  }
  const { id } = await params;

  const account = await prisma.integrationAccount.findFirst({
    where: { id, organizationId: auth.session.orgId },
  });
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.integrationAccount.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
