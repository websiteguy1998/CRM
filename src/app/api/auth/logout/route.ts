import { NextResponse } from "next/server";
import { clearSessionCookie, getCrmWs } from "@/lib/auth";

export async function POST() {
  await clearSessionCookie(await getCrmWs());
  return NextResponse.json({ ok: true });
}
