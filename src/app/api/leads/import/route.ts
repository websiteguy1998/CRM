import { NextRequest, NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/api-auth";
import { getFirstStage } from "@/lib/pipeline";
import { logActivity } from "@/lib/timeline";
import { findDuplicateLead, normalizeIdentifyingField } from "@/lib/duplicate-lead";
import type { LeadCategoryValue } from "@/lib/categories";

const HEADER_ALIASES: Record<string, string> = {
  "id name": "idName",
  idname: "idName",
  "id url": "idUrl",
  idurl: "idUrl",
  "client name": "clientName",
  clientname: "clientName",
  name: "clientName",
  country: "country",
  "id country": "country",
  "client country": "clientCountry",
  clientcountry: "clientCountry",
  "website url": "websiteUrl",
  website: "websiteUrl",
  contact: "phone",
  phone: "phone",
  "phone number": "phone",
  mobile: "phone",
  email: "email",
  "email address": "email",
  delivery: "deliveryDate",
  "delivery date": "deliveryDate",
  status: "statusNote",
  price: "price",
  duration: "duration",
  category: "category",
  service: "category",
};

const CATEGORY_ALIASES: Record<string, LeadCategoryValue> = {
  "web development": "WEB_DEVELOPMENT",
  "web dev": "WEB_DEVELOPMENT",
  webdev: "WEB_DEVELOPMENT",
  "graphic design": "GRAPHIC_DESIGN",
  graphicdesign: "GRAPHIC_DESIGN",
  "ui design": "UI_DESIGN",
  "ui/ux": "UI_DESIGN",
  "ui ux": "UI_DESIGN",
  uiux: "UI_DESIGN",
  seo: "SEO",
  smm: "SMM",
  "social media marketing": "SMM",
};

function parseCategory(value: string | undefined): LeadCategoryValue | undefined {
  const key = value?.trim().toLowerCase();
  if (!key) return undefined;
  return CATEGORY_ALIASES[key];
}

function normalizeHeader(h: string) {
  return h.trim().toLowerCase();
}

function normalizePhone(phone: string | undefined) {
  if (!phone) return undefined;
  const trimmed = phone.trim();
  const digits = trimmed.replace(/[^\d+]/g, "");
  return digits || undefined;
}

function parseDeliveryDate(value: string | undefined) {
  if (!value?.trim()) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function POST(req: NextRequest) {
  const auth = await requireApiSession();
  if ("error" in auth) return auth.error;
  const { orgId, sub, role } = auth.session;

  if (role !== "ADMIN" && role !== "LEAD_ENTRY") {
    return NextResponse.json({ error: "Not permitted for this role" }, { status: 403 });
  }

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
    const clientName = normalizeIdentifyingField(row.clientName);
    const phone = normalizePhone(normalizeIdentifyingField(row.phone));
    const email = normalizeIdentifyingField(row.email)?.toLowerCase();
    const websiteUrl = normalizeIdentifyingField(row.websiteUrl);
    const idUrl = normalizeIdentifyingField(row.idUrl);

    if (!clientName || (!phone && !email && !websiteUrl)) {
      errors.push(`Row ${i + 2}: needs a client name and at least a phone, email, or website`);
      continue;
    }

    const duplicate = await findDuplicateLead(orgId, { phone, email, websiteUrl });
    if (duplicate) {
      duplicates += 1;
      continue;
    }

    const contact = await prisma.contact.create({
      data: {
        organizationId: orgId,
        firstName: clientName,
        email: email || undefined,
        phone,
      },
    });

    const lead = await prisma.lead.create({
      data: {
        organizationId: orgId,
        contactId: contact.id,
        pipelineId: pipeline.id,
        stageId: stage.id,
        createdById: sub,
        idName: row.idName || undefined,
        idUrl,
        country: row.country || undefined,
        clientCountry: row.clientCountry || undefined,
        websiteUrl,
        deliveryDate: parseDeliveryDate(row.deliveryDate),
        price: row.price ? Number(row.price) || undefined : undefined,
        duration: row.duration || undefined,
        statusNote: row.statusNote || undefined,
        category: parseCategory(row.category),
      },
    });

    await logActivity({
      organizationId: orgId,
      leadId: lead.id,
      type: "LEAD_CREATED",
      summary: "Lead imported from CSV",
      actorId: sub,
    });

    imported += 1;
  }

  return NextResponse.json({ imported, duplicates, errors });
}
