import { prisma } from "@/lib/prisma";
import type { ActivityType, Prisma } from "@prisma/client";

/**
 * Appends one entry to a lead's unified activity timeline and bumps
 * lastActivityAt. Every channel (WhatsApp/SMS/email/calls/tasks/notes/stage
 * changes) funnels through here so the lead profile can render one feed.
 */
export async function logActivity(params: {
  organizationId: string;
  leadId: string;
  type: ActivityType;
  summary: string;
  actorId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  const { organizationId, leadId, type, summary, actorId, metadata } = params;

  await prisma.$transaction([
    prisma.activity.create({
      data: {
        organizationId,
        leadId,
        type,
        summary,
        actorId: actorId ?? undefined,
        metadata,
      },
    }),
    prisma.lead.update({
      where: { id: leadId },
      data: { lastActivityAt: new Date() },
    }),
  ]);
}
