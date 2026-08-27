/**
 * SMS sender via Twilio's REST API. Same simulated-fallback pattern as
 * whatsapp.ts: works out of the box in a demo, sends for real once
 * TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER are set.
 * Inbound delivery is via the webhook at /api/webhooks/sms.
 */
export async function sendSms(to: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!sid || !token || !from) {
    return { simulated: true as const, externalId: `sim_sms_${Date.now()}` };
  }

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }),
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
