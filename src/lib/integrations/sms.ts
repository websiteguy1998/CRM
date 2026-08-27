import { prisma } from "@/lib/prisma";

/**
 * SMS sender via Twilio's REST API. Same DB-backed, multi-account pattern
 * as whatsapp.ts — an admin can add as many named Twilio numbers as
 * needed in Settings → Integrations. Falls back to a simulated send when
 * none are configured. Inbound delivery is via the webhook at
 * /api/webhooks/sms (point each Twilio number's webhook there).
 */

type TwilioConfig = { accountSid: string; authToken: string; fromNumber: string };

async function getAccount(organizationId: string, accountId?: string) {
  const account = accountId
    ? await prisma.integrationAccount.findFirst({
        where: { id: accountId, organizationId, type: "SMS_TWILIO", status: "CONNECTED" },
      })
    : await prisma.integrationAccount.findFirst({
        where: { organizationId, type: "SMS_TWILIO", status: "CONNECTED" },
        orderBy: { createdAt: "asc" },
      });
  const config = account?.config as Partial<TwilioConfig> | null;
  if (!config?.accountSid || !config?.authToken || !config?.fromNumber) return null;
  return { accountSid: config.accountSid, authToken: config.authToken, fromNumber: config.fromNumber };
}

export async function sendSms(organizationId: string, to: string, body: string, accountId?: string) {
  const account = await getAccount(organizationId, accountId);
  if (!account) {
    return { simulated: true as const, externalId: `sim_sms_${Date.now()}` };
  }

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${account.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${account.accountSid}:${account.authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: account.fromNumber, Body: body }),
      }
    );
    if (!res.ok) throw new Error(`Twilio API responded ${res.status}`);
    const data = await res.json();
    return { simulated: false as const, externalId: data.sid as string | undefined };
  } catch (err) {
    console.error("SMS send failed, falling back to simulated send", err);
    return { simulated: true as const, externalId: `sim_sms_${Date.now()}` };
  }
}
