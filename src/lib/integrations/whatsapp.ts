import { prisma } from "@/lib/prisma";

/**
 * WhatsApp Business Platform (Meta Cloud API) sender.
 *
 * Reads credentials from IntegrationAccount rows (Settings → Integrations),
 * where an admin can add as many named WhatsApp numbers as needed — each
 * just needs its own access token + phone number ID from Meta. Falls back
 * to a simulated send when none are configured, so the unified inbox works
 * end-to-end in a demo before real credentials are connected.
 *
 * All numbers share one inbound webhook (/api/webhooks/whatsapp) since
 * that's how Meta's Cloud API webhooks work — one subscription per app,
 * covering every phone number under it.
 */

type WhatsAppConfig = { accessToken: string; phoneNumberId: string };

async function getAccount(organizationId: string, accountId?: string) {
  const account = accountId
    ? await prisma.integrationAccount.findFirst({
        where: { id: accountId, organizationId, type: "WHATSAPP", status: "CONNECTED" },
      })
    : await prisma.integrationAccount.findFirst({
        where: { organizationId, type: "WHATSAPP", status: "CONNECTED" },
        orderBy: { createdAt: "asc" },
      });
  const config = account?.config as Partial<WhatsAppConfig> | null;
  if (!config?.accessToken || !config?.phoneNumberId) return null;
  return { accessToken: config.accessToken, phoneNumberId: config.phoneNumberId };
}

export async function sendWhatsAppMessage(
  organizationId: string,
  to: string,
  body: string,
  accountId?: string
) {
  const account = await getAccount(organizationId, accountId);
  if (!account) {
    return { simulated: true as const, externalId: `sim_wa_${Date.now()}` };
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${account.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    });
    if (!res.ok) throw new Error(`WhatsApp API responded ${res.status}`);
    const data = await res.json();
    return { simulated: false as const, externalId: data.messages?.[0]?.id as string | undefined };
  } catch (err) {
    console.error("WhatsApp send failed, falling back to simulated send", err);
    return { simulated: true as const, externalId: `sim_wa_${Date.now()}` };
  }
}
