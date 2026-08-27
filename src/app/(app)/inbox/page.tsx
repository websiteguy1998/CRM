import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import InboxView from "./inbox-view";
import { leadWhereForSession } from "@/lib/access";

export default async function InboxPage() {
  const session = await getSession();
  if (!session) return null;

  const conversations = await prisma.conversation.findMany({
    where: { organizationId: session.orgId, lead: leadWhereForSession(session) },
    include: {
      lead: { include: { contact: true, owner: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { lastMessageAt: "desc" },
    take: 200,
  });

  return (
    <InboxView
      initialConversations={JSON.parse(JSON.stringify(conversations))}
    />
  );
}
