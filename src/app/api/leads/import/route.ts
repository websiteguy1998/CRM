import { NextRequest, NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { getFirstStage } from "@/lib/pipeline";
import { pickNextAgent } from "@/lib/assignment";
import { logActivity } from "@/lib/timeline";

const HEADER_ALIASES: Record<string, string> = {
  "first name": "firstName",
  firstname: "firstName",
  "last name": "lastName",
  lastname: "lastName",
  company: "company",
  "company name": "company",
  phone: "phone",
  "phone number": "phone",
  mobile: "phone",
  email: "email",
  "email address": "email",
  website: "website",
  industry: "industry",
  city: "city",
  state: "state",
  country: "country",
  "lead source": "source",
  source: "source",
  campaign: "campaign",
};

function normalizeHeader(h: string) {
  return h.trim().toLowerCase();
}

function normalizePhone(phone: string | undefined) {
  if (!phone) return undefined;
  const trimmed = phone.trim();
  const digits = trimmed.replace(/[^\d+]/g, "");
  return digits || undefined;
}

export async function POST(req: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  const { orgId } = auth.session;

  const body = await req.json().catch(() => null);
  if (!body?.csv || typeof body.csv !== "string") {
    return NextResponse.json({ error: "Missing CSV content" }, { status: 400 });
  }

  let records: Record<string, string>[];
  try {
    const raw: Record<string, string>[] = parse(body.csv, {
      columns: (headers: string[]) =>
        headers.map((h) => HEADER_ALIASES[normalizeHeader(h)] ?? normalizeHeader(h)),
      skip_empty_lines: true,
      trim: true,
    });
    records = raw;
  } catch {
    return NextResponse.json({ error: "Could not parse CSV file" }, { status: 400 });
  }

  if (records.length === 0) {
    return NextResponse.json({ error: "No rows found in file" }, { status: 400 });
  }
  if (records.length > 5000) {
    return NextResponse.json({ error: "Max 5000 rows per import" }, { status: 400 });
  }

  const { pipeline, stage } = await getFirstStage(orgId);

  let imported = 0;
  let duplicates = 0;
  const errors: string[] = [];

  for (const [i, row] of records.entries()) {
    const firstName = row.firstName?.trim();
    const phone = normalizePhone(row.phone);
    const email = row.email?.trim().toLowerCase();

    if (!firstName || (!phone && !email)) {
      errors.push(`Row ${i + 2}: needs at least a first name and a phone or email`);
      continue;
    }

    const existing = await prisma.contact.findFirst({
      where: {
        organizationId: orgId,
        OR: [
          ...(phone ? [{ phone }] : []),
          ...(email ? [{ email }] : []),
        ],
      },
    });
    if (existing) {
      duplicates += 1;
      continue;
    }

    const company = row.company
      ? (await prisma.company.findFirst({ where: { organizationId: orgId, name: row.company } })) ??
        (await prisma.company.create({
          data: {
            organizationId: orgId,
            name: row.company,
            industry: row.industry,
            website: row.website,
            city: row.city,
            state: row.state,
            country: row.country,
          },
        }))
      : null;

    const source = row.source
      ? await prisma.leadSource.upsert({
          where: { organizationId_name: { organizationId: orgId, name: row.source } },
          update: {},
          create: { organizationId: orgId, name: row.source },
        })
      : null;

    const campaign = row.campaign
      ? (await prisma.campaign.findFirst({ where: { organizationId: orgId, name: row.campaign } })) ??
        (await prisma.campaign.create({
          data: { organizationId: orgId, name: row.campaign, sourceId: source?.id },
        }))
      : null;

    const contact = await prisma.contact.create({
      data: {
        organizationId: orgId,
        firstName,
        lastName: row.lastName,
        email: email || undefined,
        phone,
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
        campaignId: campaign?.id,
        pipelineId: pipeline.id,
        stageId: stage.id,
        ownerId: ownerId ?? undefined,
      },
    });

    await logActivity({
      organizationId: orgId,
      leadId: lead.id,
      type: "LEAD_CREATED",
      summary: `Lead imported from CSV${row.source ? ` (${row.source})` : ""}`,
    });

    imported += 1;
  }

  return NextResponse.json({ imported, duplicates, errors });
}
