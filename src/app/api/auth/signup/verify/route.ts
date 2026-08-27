import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPrimaryOrganizationId } from "@/lib/org";
import { hashPassword } from "@/lib/password";

const schema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  name: z.string().min(1),
  password: z.string().min(8),
  role: z.enum(["AGENT", "LEAD_ENTRY", "MANAGER", "QA", "MARKETING"]),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid signup details" }, { status: 400 });
  const { email: rawEmail, code, name, password, role } = parsed.data;
  const email = rawEmail.toLowerCase();

  const verification = await prisma.signupVerification.findFirst({
    where: { email, code },
    orderBy: { createdAt: "desc" },
  });
  if (!verification || verification.expiresAt < new Date()) {
    return NextResponse.json({ error: "That code is invalid or has expired" }, { status: 400 });
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const orgId = await getPrimaryOrganizationId();

  await prisma.user.create({
    data: {
      organizationId: orgId,
      name,
      email,
      passwordHash: await hashPassword(password),
      role,
      active: false, // pending Super Admin approval
    },
  });

  await prisma.signupVerification.deleteMany({ where: { email } });

  return NextResponse.json({ ok: true });
}
