import { NextRequest, NextResponse } from "next/server";
import { recordInboundMessage } from "@/lib/inbound";

/**
 * Inbound Twilio SMS webhook — Twilio posts application/x-www-form-urlencoded
 * with From/To/Body. Point your Twilio number's "A message comes in" webhook
 * at this URL. (Signature validation via X-Twilio-Signature + TWILIO_AUTH_TOKEN
 * should be added before taking real traffic in production.)
 */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: true });

  const from = form.get("From")?.toString();
  const body = form.get("Body")?.toString();
  const messageSid = form.get("MessageSid")?.toString();

  if (from && body) {
    await recordInboundMessage({
      channel: "SMS",
      fromPhone: from,
      body,
      externalId: messageSid,
    });
  }

  return new NextResponse("<Response></Response>", {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
