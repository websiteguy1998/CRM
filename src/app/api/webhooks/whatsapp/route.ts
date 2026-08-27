import { NextRequest, NextResponse } from "next/server";
import { recordInboundMessage } from "@/lib/inbound";

/** Meta calls this with a GET during webhook setup to verify ownership. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

/**
 * Inbound WhatsApp Cloud API webhook. Meta's payload shape:
 * https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components
 */
export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => null);
  if (!payload) return NextResponse.json({ ok: true });

  const entries = payload.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const contactName = value.contacts?.[0]?.profile?.name;
      for (const message of value.messages ?? []) {
        if (message.type !== "text") continue;
        await recordInboundMessage({
          channel: "WHATSAPP",
          fromPhone: message.from,
          displayName: contactName,
          body: message.text?.body ?? "",
          externalId: message.id,
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
