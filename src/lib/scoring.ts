import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/timeline";

/**
 * Rule-based lead score, 0-100. This is a deterministic placeholder for the
 * "AI lead scoring" layer described in the product brief — same inputs
 * (engagement, response speed, call/email outcomes), just not model-driven
 * yet. Swap the body for a call to an LLM/ML service later without touching
 * any caller, since everything else only depends on Lead.score/scoreReasons.
 */
export async function recalculateLeadScore(leadId: string) {
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: {
      conversations: { include: { messages: true } },
      calls: true,
      deals: true,
      stage: true,
    },
  });

  let score = 20; // base for any open lead
  const reasons: string[] = ["Base score for a new lead"];

  const inboundMessages = lead.conversations.flatMap((c) =>
    c.messages.filter((m) => m.direction === "INBOUND")
  );
  if (inboundMessages.length > 0) {
    score += 15;
    reasons.push(`Replied ${inboundMessages.length}x across channels`);
  }

  const answeredCalls = lead.calls.filter((c) => c.status === "ANSWERED");
  if (answeredCalls.length > 0) {
    score += 20;
    reasons.push(`${answeredCalls.length} answered call(s)`);
  }
  const totalCallMinutes =
    answeredCalls.reduce((sum, c) => sum + c.durationSec, 0) / 60;
  if (totalCallMinutes >= 5) {
    score += 10;
    reasons.push(`${totalCallMinutes.toFixed(0)} min of call time`);
  }

  const pricingKeywords = ["price", "cost", "pricing", "quote", "proposal"];
  const mentionedPricing = inboundMessages.some((m) =>
    pricingKeywords.some((k) => m.body?.toLowerCase().includes(k))
  );
  if (mentionedPricing) {
    score += 15;
    reasons.push("Asked about price/proposal");
  }

  if (lead.stage?.isWon) {
    score = 100;
    reasons.push("Deal won");
  } else if (lead.stage?.isLost) {
    score = 0;
    reasons.push("Marked lost");
  }

  score = Math.max(0, Math.min(100, score));

  const previous = lead.score;
  await prisma.lead.update({
    where: { id: leadId },
    data: { score, scoreReasons: reasons },
  });

  if (previous !== score) {
    await logActivity({
      organizationId: lead.organizationId,
      leadId,
      type: "SCORE_UPDATED",
      summary: `Lead score updated ${previous} → ${score}`,
      metadata: { previous, score, reasons },
    });
  }

  return { score, reasons };
}
