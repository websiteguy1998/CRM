import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/page-header";
import IntegrationForm from "./integration-form";

const TYPES = [
  {
    type: "WHATSAPP" as const,
    title: "WhatsApp Business Platform",
    description: "Meta Cloud API — send/receive WhatsApp messages from the CRM.",
  },
  {
    type: "ZOOM_PHONE" as const,
    title: "Zoom Phone",
    description: "Server-to-Server OAuth app — click-to-call, recordings, transcripts.",
  },
  {
    type: "GMAIL" as const,
    title: "Gmail / Google Workspace",
    description: "OAuth app for sending and syncing email threads.",
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
  });

  return (
    <div>
      <PageHeader
        title="Integrations"
        description="Connect official APIs — messages keep working in simulated mode until you do."
      />
      <div className="space-y-4 p-6">
        {TYPES.map((t) => (
          <IntegrationForm
            key={t.type}
            type={t.type}
            title={t.title}
            description={t.description}
            status={integrations.find((i) => i.type === t.type)?.status ?? "NOT_CONFIGURED"}
          />
        ))}
      </div>
    </div>
  );
}
