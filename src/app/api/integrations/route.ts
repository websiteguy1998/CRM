import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const integrations = await prisma.integrationAccount.findMany({
    where: { organizationId: auth.session.orgId },
    orderBy: { type: "asc" },
  });

  return NextResponse.json({ integrations });
}

const schema = z.object({
  type: z.enum(["WHATSAPP", "ZOOM_PHONE", "GMAIL", "MICROSOFT_365", "SMS_TWILIO"]),
  name: z.string().min(1),
  config: z.record(z.string(), z.string()).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (auth.session.role !== "ADMIN") {
    return NextResponse.json({ error: "Only admins can manage integrations" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  const integration = await prisma.integrationAccount.upsert({
    where: {
      organizationId_type_name: {
        organizationId: auth.session.orgId,
        type: data.type,
        name: data.name,
      },
    },
    update: { config: data.config, status: "CONNECTED" },
    create: {
      organizationId: auth.session.orgId,
      type: data.type,
      name: data.name,
      config: data.config,
      status: "CONNECTED",
    },
  });

  return NextResponse.json({ integration }, { status: 201 });
}
