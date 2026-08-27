import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/page-header";
import IntegrationTypeCard from "./integration-type-card";

const TYPES = [
  {
    type: "WHATSAPP" as const,
    title: "WhatsApp Business Platform",
    description: "Meta Cloud API — add one entry per WhatsApp number you send from.",
  },
  {
    type: "ZOOM_PHONE" as const,
    title: "Zoom Phone",
    description: "Server-to-Server OAuth app — click-to-call, recordings, transcripts.",
  },
  {
    type: "GMAIL" as const,
    title: "Gmail / Google Workspace",
    description: "App password auth — add one entry per mailbox.",
  },
  {
    type: "MICROSOFT_365" as const,
    title: "Microsoft 365 / Outlook",
    description: "Microsoft Graph OAuth app for email.",
  },
  {
    type: "SMS_TWILIO" as const,
    title: "SMS (Twilio)",
    description: "Send and receive SMS as another channel on the timeline.",
  },
];

export default async function IntegrationsSettingsPage() {
  const session = await getSession();
  if (!session) return null;

  const integrations = await prisma.integrationAccount.findMany({
    where: { organizationId: session.orgId },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Integrations"
        description="Add as many numbers/mailboxes as you use — messages keep working in simulated mode until at least one is connected."
      />
      <div className="space-y-4 p-6">
        {TYPES.map((t) => (
          <IntegrationTypeCard
            key={t.type}
            type={t.type}
            title={t.title}
            description={t.description}
            accounts={integrations
              .filter((i) => i.type === t.type && i.status !== "NOT_CONFIGURED")
              .map((i) => ({
                id: i.id,
                name: i.name,
                status: i.status,
                lastError: (i.config as Record<string, unknown> | null)?.lastError as string | undefined,
              }))}
          />
        ))}
      </div>
    </div>
  );
}
