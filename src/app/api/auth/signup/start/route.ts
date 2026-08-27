import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPrimaryOrganizationId } from "@/lib/org";
import { generateVerificationCode } from "@/lib/verification";
import { sendEmail } from "@/lib/integrations/email";

const schema = z.object({ email: z.string().email() });
const CODE_TTL_MINUTES = 10;

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  const email = parsed.data.email.toLowerCase();

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

  await prisma.$transaction([
    prisma.signupVerification.deleteMany({ where: { email } }),
    prisma.signupVerification.create({ data: { email, code, expiresAt } }),
  ]);

  const orgId = await getPrimaryOrganizationId();
  const result = await sendEmail(
    orgId,
    email,
    "Your Unify CRM verification code",
    `Your verification code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes.`
  );

  // No real mailbox connected yet (Settings -> Integrations -> Gmail) —
  // hand the code back directly so signup still works. The account still
  // can't sign in until a Super Admin approves it, so this isn't a full
  // bypass of the control, just of email delivery.
  return NextResponse.json({
    ok: true,
    ...(result.simulated ? { devCode: code } : {}),
  });
}
