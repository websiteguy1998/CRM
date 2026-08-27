import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import type { SessionPayload } from "@/lib/auth";

export async function requireApiSession(): Promise<
  { session: SessionPayload } | { error: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session };
}
