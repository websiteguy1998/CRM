import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { checkGmailInbox } from "@/lib/integrations/email";

export async function POST() {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;

  try {
    const result = await checkGmailInbox(auth.session.orgId);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Gmail inbox check failed", err);
    return NextResponse.json(
      { error: "Could not check Gmail — verify the address and app password in Settings." },
      { status: 502 }
    );
  }
}
