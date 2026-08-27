import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { getFirstStage } from "@/lib/pipeline";
import { pickNextAgent } from "@/lib/assignment";
import { logActivity } from "@/lib/timeline";

export async function GET(req: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  const { orgId } = auth.session;

  const { searchParams } = new URL(req.url);
  const stageId = searchParams.get("stageId");
  const ownerId = searchParams.get("ownerId");
  const search = searchParams.get("q");

  const leads = await prisma.lead.findMany({
    where: {
      organizationId: orgId,
      ...(stageId ? { stageId } : {}),
      ...(ownerId ? { ownerId } : {}),
      ...(search
        ? {
            contact: {
              OR: [
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { phone: { contains: search, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    },
    include: {
      contact: true,
      company: true,
      stage: true,
      owner: true,
      source: true,
    },
    orderBy: { lastActivityAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ leads });
}

const createLeadSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  companyName: z.string().optional(),
  sourceName: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  const { orgId } = auth.session;

  const body = await req.json().catch(() => null);
  const parsed = createLeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const { pipeline, stage } = await getFirstStage(orgId);

  const company = data.companyName
    ? (await prisma.company.findFirst({
        where: { organizationId: orgId, name: data.companyName },
      })) ??
      (await prisma.company.create({
        data: { organizationId: orgId, name: data.companyName },
      }))
    : null;

  const source = data.sourceName
    ? await prisma.leadSource.upsert({
        where: { organizationId_name: { organizationId: orgId, name: data.sourceName } },
        update: {},
        create: { organizationId: orgId, name: data.sourceName },
      })
    : null;

  const contact = await prisma.contact.create({
    data: {
      organizationId: orgId,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email || undefined,
      phone: data.phone,
      companyId: company?.id,
    },
  });

  const ownerId = await pickNextAgent(orgId);

  const lead = await prisma.lead.create({
    data: {
      organizationId: orgId,
      contactId: contact.id,
      companyId: company?.id,
      sourceId: source?.id,
      pipelineId: pipeline.id,
      stageId: stage.id,
      ownerId: ownerId ?? undefined,
    },
    include: { contact: true, stage: true, owner: true },
  });

  await logActivity({
    organizationId: orgId,
    leadId: lead.id,
    type: "LEAD_CREATED",
    summary: "Lead created",
  });
  if (ownerId) {
    await logActivity({
      organizationId: orgId,
      leadId: lead.id,
      type: "LEAD_ASSIGNED",
      summary: `Assigned to ${lead.owner?.name}`,
    });
  }

  return NextResponse.json({ lead }, { status: 201 });
}
