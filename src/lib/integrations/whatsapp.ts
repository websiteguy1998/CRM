/**
 * WhatsApp Business Platform (Meta Cloud API) sender.
 *
 * Falls back to a simulated send when WHATSAPP_ACCESS_TOKEN /
 * WHATSAPP_PHONE_NUMBER_ID aren't configured yet, so the unified inbox works
 * end-to-end in a demo before real credentials are connected in
 * Settings → Integrations. Once configured, this hits the real Graph API.
 *
 * Inbound messages arrive via the webhook at /api/webhooks/whatsapp, which
 * Meta calls after you subscribe your app to the phone number.
 */
export async function sendWhatsAppMessage(to: string, body: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    return { simulated: true as const, externalId: `sim_wa_${Date.now()}` };
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body },
        }),
      }
    );
    if (!res.ok) throw new Error(`WhatsApp API responded ${res.status}`);
    const data = await res.json();
    return { simulated: false as const, externalId: data.messages?.[0]?.id as string | undefined };
  } catch (err) {
    console.error("WhatsApp send failed, falling back to simulated send", err);
    return { simulated: true as const, externalId: `sim_wa_${Date.now()}` };
  }
}
