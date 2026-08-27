import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { logActivity } from "@/lib/timeline";
import { recalculateLeadScore } from "@/lib/scoring";
import { sendWhatsAppMessage } from "@/lib/integrations/whatsapp";
import { sendSms } from "@/lib/integrations/sms";
import { sendEmail } from "@/lib/integrations/email";
import { channelIcon } from "@/lib/format";

const schema = z.object({
  channel: z.enum(["WHATSAPP", "SMS", "EMAIL"]),
  body: z.string().min(1),
  subject: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const { orgId, sub } = auth.session;

  const lead = await prisma.lead.findFirst({
    where: { id, organizationId: orgId },
    include: { contact: true },
  });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { channel, body, subject } = parsed.data;

  const destination = channel === "EMAIL" ? lead.contact.email : lead.contact.phone;
  if (!destination) {
    return NextResponse.json(
      { error: `Lead has no ${channel === "EMAIL" ? "email address" : "phone number"} on file` },
      { status: 400 }
    );
  }

  const existingConversation = await prisma.conversation.findFirst({ where: { leadId: id, channel } });
  const conversation = existingConversation
    ? await prisma.conversation.update({
        where: { id: existingConversation.id },
        data: { lastMessageAt: new Date() },
      })
    : await prisma.conversation.create({
        data: { organizationId: orgId, leadId: id, channel, subject, lastMessageAt: new Date() },
      });

  const dispatch =
    channel === "WHATSAPP"
      ? sendWhatsAppMessage(destination, body)
      : channel === "SMS"
      ? sendSms(destination, body)
      : sendEmail(orgId, destination, subject ?? "", body);
  const result = await dispatch;

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "OUTBOUND",
      status: "SENT",
      body,
      sentById: sub,
      externalId: result.externalId,
    },
  });

  await logActivity({
    organizationId: orgId,
    leadId: id,
    type: "MESSAGE_OUTBOUND",
    summary: `${channelIcon(channel)} ${channel} sent${result.simulated ? " (simulated — connect this channel in Settings)" : ""}`,
    actorId: sub,
    metadata: { conversationId: conversation.id, messageId: message.id, simulated: result.simulated },
  });

  await recalculateLeadScore(id);

  return NextResponse.json({ message, simulated: result.simulated }, { status: 201 });
}
