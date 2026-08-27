import { prisma } from "@/lib/prisma";
import { getFirstStage } from "@/lib/pipeline";
import { logActivity } from "@/lib/timeline";
import { recalculateLeadScore } from "@/lib/scoring";
import { getPrimaryOrganizationId } from "@/lib/org";
import type { Channel } from "@prisma/client";

/**
 * A real multi-tenant deployment would resolve the organization from the
 * webhook payload itself (WhatsApp phone_number_id, Twilio account SID, the
 * mailbox that received the email) by matching it against
 * IntegrationAccount.config. This MVP runs a single organization, so it
 * falls back to getPrimaryOrganizationId() when no integration match is
 * found.
 */
const resolveOrganizationId = getPrimaryOrganizationId;

/** Finds the contact/lead a phone or email belongs to, creating both if this is a brand-new inbound contact. */
async function findOrCreateLeadForContact(params: {
  organizationId: string;
  phone?: string;
  email?: string;
  displayName?: string;
  inboundSourceName: string;
}) {
  const { organizationId, phone, email, displayName, inboundSourceName } = params;

  const existingContact = await prisma.contact.findFirst({
    where: {
      organizationId,
      OR: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])],
    },
    include: { leads: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  if (existingContact?.leads[0]) {
    return existingContact.leads[0];
  }

  const contact =
    existingContact ??
    (await prisma.contact.create({
      data: {
        organizationId,
        firstName: displayName || phone || email || "Unknown",
        phone,
        email,
      },
    }));

  const { pipeline, stage } = await getFirstStage(organizationId);
  const source = await prisma.leadSource.upsert({
    where: { organizationId_name: { organizationId, name: inboundSourceName } },
    update: {},
    create: { organizationId, name: inboundSourceName },
  });

  // Left unassigned on purpose — a Super Admin manually allocates every
  // lead to a sales agent (see Lead.ownerId / the allocate action).
  const lead = await prisma.lead.create({
    data: {
      organizationId,
      contactId: contact.id,
      pipelineId: pipeline.id,
      stageId: stage.id,
      sourceId: source.id,
    },
  });

  await logActivity({
    organizationId,
    leadId: lead.id,
    type: "LEAD_CREATED",
    summary: `New inbound lead via ${inboundSourceName}`,
  });

  return lead;
}

export async function recordInboundMessage(params: {
  channel: Channel;
  fromPhone?: string;
  fromEmail?: string;
  displayName?: string;
  body: string;
  subject?: string;
  externalId?: string;
  mediaUrl?: string;
}) {
  const organizationId = await resolveOrganizationId();
  const lead = await findOrCreateLeadForContact({
    organizationId,
    phone: params.fromPhone,
    email: params.fromEmail,
    displayName: params.displayName,
    inboundSourceName: params.channel === "WHATSAPP" ? "WhatsApp" : params.channel === "SMS" ? "SMS" : "Email",
  });

  const existingConversation = await prisma.conversation.findFirst({
    where: { leadId: lead.id, channel: params.channel },
  });
  const conversation = existingConversation
    ? await prisma.conversation.update({
        where: { id: existingConversation.id },
        data: { lastMessageAt: new Date() },
      })
    : await prisma.conversation.create({
        data: {
          organizationId,
          leadId: lead.id,
          channel: params.channel,
          subject: params.subject,
          lastMessageAt: new Date(),
        },
      });

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "INBOUND",
      status: "RECEIVED",
      body: params.body,
      mediaUrl: params.mediaUrl,
      externalId: params.externalId,
    },
  });

  const icon = { WHATSAPP: "💬", SMS: "📱", EMAIL: "📧" }[params.channel];
  await logActivity({
    organizationId,
    leadId: lead.id,
    type: "MESSAGE_INBOUND",
    summary: `${icon} ${params.channel} received: "${params.body.slice(0, 80)}"`,
    metadata: { conversationId: conversation.id, messageId: message.id },
  });

  await recalculateLeadScore(lead.id);

  return { lead, conversation, message };
}
