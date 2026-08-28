import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";

const schema = z.object({ zoomUserEmail: z.string().email().nullable() });

/** Self-service: an agent sets which Zoom account they place click-to-call calls from. */
export async function PATCH(req: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const user = await prisma.user.update({
    where: { id: auth.session.sub },
    data: { zoomUserEmail: parsed.data.zoomUserEmail },
    select: { id: true, zoomUserEmail: true },
  });

  return NextResponse.json({ user });
}
