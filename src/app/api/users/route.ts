import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { hashPassword } from "@/lib/password";

export async function GET() {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const users = await prisma.user.findMany({
    where: { organizationId: auth.session.orgId },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ users });
}

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "MANAGER", "AGENT", "QA", "MARKETING"]).default("AGENT"),
});

export async function POST(req: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  if (auth.session.role !== "ADMIN") {
    return NextResponse.json({ error: "Only admins can add users" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existing) return NextResponse.json({ error: "Email already in use" }, { status: 409 });

  const user = await prisma.user.create({
    data: {
      organizationId: auth.session.orgId,
      name: data.name,
      email: data.email.toLowerCase(),
      passwordHash: await hashPassword(data.password),
      role: data.role,
    },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
  });

  return NextResponse.json({ user }, { status: 201 });
}
