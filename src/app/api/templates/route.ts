import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const templates = await prisma.template.findMany({
    where: { organizationId: auth.session.orgId },
    orderBy: { channel: "asc" },
  });

  return NextResponse.json({ templates });
}

const schema = z.object({
  channel: z.enum(["WHATSAPP", "SMS", "EMAIL"]),
  name: z.string().min(1),
  body: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const template = await prisma.template.create({
    data: { organizationId: auth.session.orgId, ...parsed.data },
  });

  return NextResponse.json({ template }, { status: 201 });
}
