import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { prisma } from "@/lib/prisma";
import { recordInboundMessage } from "@/lib/inbound";

/**
 * Real Gmail sending/receiving via a Gmail "App Password" (SMTP + IMAP)
 * instead of full OAuth — much faster to set up for a small team than
 * standing up a Google Cloud OAuth consent screen, at the cost of only
 * working with Gmail/Google Workspace inboxes that have an app password
 * enabled. Falls back to simulated send when nothing is configured, same
 * as the WhatsApp/SMS integrations.
 */

type GmailConfig = { email: string; appPassword: string };

async function getGmailConfig(organizationId: string): Promise<GmailConfig | null> {
  const account = await prisma.integrationAccount.findFirst({
    where: { organizationId, type: "GMAIL", status: "CONNECTED" },
  });
  const config = account?.config as Partial<GmailConfig> | null;
  if (!config?.email || !config?.appPassword) return null;
  return { email: config.email, appPassword: config.appPassword };
}

export async function sendEmail(organizationId: string, to: string, subject: string, body: string) {
  const gmail = await getGmailConfig(organizationId);
  if (!gmail) {
    return { simulated: true as const, externalId: `sim_email_${Date.now()}` };
  }

  try {
    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: gmail.email, pass: gmail.appPassword },
    });
    const info = await transport.sendMail({
      from: gmail.email,
      to,
      subject: subject || "(no subject)",
      text: body,
    });
    return { simulated: false as const, externalId: info.messageId };
  } catch (err) {
    console.error("Gmail send failed, falling back to simulated send", err);
    return { simulated: true as const, externalId: `sim_email_${Date.now()}` };
  }
}

/**
 * Polls the connected Gmail inbox for unseen mail and records each as an
 * inbound message on the matching (or newly created) lead. There's no
 * inbound webhook for App-Password Gmail, so this is called on demand from
 * a "Check for new emails" button rather than pushed in real time.
 */
export async function checkGmailInbox(organizationId: string) {
  const gmail = await getGmailConfig(organizationId);
  if (!gmail) return { checked: 0, configured: false as const };

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: gmail.email, pass: gmail.appPassword },
    logger: false,
  });

  let checked = 0;
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ seen: false }, { uid: true });
      for (const uid of uids || []) {
        const raw = await client.download(String(uid), undefined, { uid: true });
        if (!raw) continue;
        const parsed = await simpleParser(raw.content);
        const from = parsed.from?.value?.[0];
        if (!from?.address) continue;

        await recordInboundMessage({
          channel: "EMAIL",
          fromEmail: from.address,
          displayName: from.name,
          subject: parsed.subject,
          body: parsed.text ?? parsed.html?.toString() ?? "",
          externalId: parsed.messageId,
        });
        await client.messageFlagsAdd({ uid: String(uid) }, ["\\Seen"], { uid: true });
        checked += 1;
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  return { checked, configured: true as const };
}
