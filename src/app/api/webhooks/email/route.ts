import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recordInboundMessage } from "@/lib/inbound";

/**
 * Generic inbound email relay. Gmail and Microsoft Graph don't push email
 * bodies directly — Gmail notifies via a Pub/Sub push subscription (you then
 * call users.messages.get) and Graph via a change-notification webhook (you
 * then call GET /me/messages/{id}). Point whichever relay you build at this
 * endpoint with the normalized shape below once that OAuth wiring exists.
 */
const schema = z.object({
  from: z.string().email(),
  displayName: z.string().optional(),
  subject: z.string().optional(),
  body: z.string(),
  externalId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  await recordInboundMessage({
    channel: "EMAIL",
    fromEmail: data.from,
    displayName: data.displayName,
    subject: data.subject,
    body: data.body,
    externalId: data.externalId,
  });

  return NextResponse.json({ ok: true });
}
