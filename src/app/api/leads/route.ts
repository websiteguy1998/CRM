import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { getFirstStage } from "@/lib/pipeline";
import { logActivity } from "@/lib/timeline";
import { leadWhereForSession, isAdmin } from "@/lib/access";
import { findDuplicateLead, normalizeIdentifyingField, isValidEmailList } from "@/lib/duplicate-lead";

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
      ...leadWhereForSession(auth.session),
      ...(stageId ? { stageId } : {}),
      ...(ownerId && isAdmin(auth.session.role) ? { ownerId } : {}),
      ...(search
        ? {
            OR: [
              { idName: { contains: search, mode: "insensitive" } },
              { websiteUrl: { contains: search, mode: "insensitive" } },
              {
                contact: {
                  OR: [
                    { firstName: { contains: search, mode: "insensitive" } },
                    { lastName: { contains: search, mode: "insensitive" } },
                    { email: { contains: search, mode: "insensitive" } },
                    { phone: { contains: search, mode: "insensitive" } },
                  ],
                },
              },
            ],
          }
        : {}),
    },
    include: {
      contact: true,
      company: true,
      stage: true,
      owner: true,
      source: true,
      createdBy: true,
    },
    orderBy: { lastActivityAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ leads });
}

const createLeadSchema = z.object({
  clientName: z.string().min(1),
  idName: z.string().optional(),
  idUrl: z.string().optional(),
  country: z.string().optional(),
  clientCountry: z.string().optional(),
  websiteUrl: z.string().optional(),
  phone: z.string().optional(),
  email: z
    .string()
    .optional()
    .refine((v) => !v || isValidEmailList(v), { message: "Enter valid email address(es), separated by commas" }),
  deliveryDate: z.string().optional(),
  price: z.coerce.number().optional(),
  duration: z.string().optional(),
  statusNote: z.string().optional(),
  category: z.enum(["WEB_DEVELOPMENT", "GRAPHIC_DESIGN", "UI_DESIGN", "SEO", "SMM"]).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  const { orgId, sub, role } = auth.session;

  if (role !== "ADMIN" && role !== "LEAD_ENTRY") {
    return NextResponse.json({ error: "Not permitted for this role" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createLeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  const phone = normalizeIdentifyingField(data.phone);
  const email = normalizeIdentifyingField(data.email);
  const websiteUrl = normalizeIdentifyingField(data.websiteUrl);
  const idUrl = normalizeIdentifyingField(data.idUrl);

  const duplicate = await findDuplicateLead(orgId, { phone, email, websiteUrl });
  if (duplicate) {
    return NextResponse.json(
      {
        error: "This lead is already registered in the system.",
        duplicateLeadId: duplicate.id,
      },
      { status: 409 }
    );
  }

  const { pipeline, stage } = await getFirstStage(orgId);

  const contact = await prisma.contact.create({
    data: {
      organizationId: orgId,
      firstName: data.clientName,
      email,
      phone,
    },
  });

  // Left unassigned on purpose — a Super Admin allocates it to a sales
  // agent afterwards (Leads list / lead detail "Owner" field, admin-only).
  const lead = await prisma.lead.create({
    data: {
      organizationId: orgId,
      contactId: contact.id,
      pipelineId: pipeline.id,
      stageId: stage.id,
      createdById: sub,
      idName: data.idName,
      idUrl,
      country: data.country,
      clientCountry: data.clientCountry,
      websiteUrl,
      deliveryDate: data.deliveryDate ? new Date(data.deliveryDate) : undefined,
      price: data.price,
      duration: data.duration,
      statusNote: data.statusNote,
      category: data.category,
    },
    include: { contact: true, stage: true, owner: true },
  });

  await logActivity({
    organizationId: orgId,
    leadId: lead.id,
    type: "LEAD_CREATED",
    summary: "Lead created",
    actorId: sub,
  });

  return NextResponse.json({ lead }, { status: 201 });
}
