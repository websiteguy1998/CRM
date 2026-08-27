import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Safe to run on every deploy (e.g. as part of a Vercel build command):
  // skip re-seeding if demo data already exists instead of erroring on
  // duplicate emails.
  const alreadySeeded = await prisma.organization.findFirst();
  if (alreadySeeded) {
    console.log("Demo data already present, skipping seed.");
    return;
  }

  const org = await prisma.organization.create({
    data: { name: "Unify CRM Demo" },
  });

  const passwordHash = await bcrypt.hash("password123", 10);

  const [admin, sarah, mike, john, priyaEntry] = await Promise.all([
    prisma.user.create({
      data: { organizationId: org.id, name: "Alex Admin", email: "admin@unifycrm.dev", passwordHash, role: "ADMIN" },
    }),
    prisma.user.create({
      data: { organizationId: org.id, name: "Sarah Lee", email: "sarah@unifycrm.dev", passwordHash, role: "AGENT" },
    }),
    prisma.user.create({
      data: { organizationId: org.id, name: "Mike Chen", email: "mike@unifycrm.dev", passwordHash, role: "AGENT" },
    }),
    prisma.user.create({
      data: { organizationId: org.id, name: "John Smith", email: "john@unifycrm.dev", passwordHash, role: "MANAGER" },
    }),
    prisma.user.create({
      data: { organizationId: org.id, name: "Priya Entry", email: "priya.entry@unifycrm.dev", passwordHash, role: "LEAD_ENTRY" },
    }),
  ]);
  const agents = [sarah, mike, john];

  const pipeline = await prisma.pipeline.create({
    data: { organizationId: org.id, name: "Sales Pipeline", isDefault: true },
  });
  const stageDefs = [
    { name: "New", order: 0 },
    { name: "Contacted", order: 1 },
    { name: "Interested", order: 2 },
    { name: "Follow-up", order: 3 },
    { name: "Won", order: 4, isWon: true },
    { name: "Lost", order: 5, isLost: true },
  ];
  const stages = await Promise.all(
    stageDefs.map((s) =>
      prisma.pipelineStage.create({
        data: { pipelineId: pipeline.id, name: s.name, order: s.order, isWon: s.isWon ?? false, isLost: s.isLost ?? false },
      })
    )
  );
  const [stageNew, stageContacted, stageInterested, stageFollowUp, stageWon, stageLost] = stages;

  const sources = await Promise.all(
    ["Google Ads", "Facebook Ads", "Referral", "Website", "Cold Call"].map((name) =>
      prisma.leadSource.create({ data: { organizationId: org.id, name } })
    )
  );
  const [googleAds, facebookAds, referral, website] = sources;

  const campaignA = await prisma.campaign.create({
    data: { organizationId: org.id, name: "Q3 Website Redesign Push", sourceId: googleAds.id },
  });
  const campaignB = await prisma.campaign.create({
    data: { organizationId: org.id, name: "Spring Promo", sourceId: facebookAds.id },
  });

  await Promise.all([
    prisma.template.create({
      data: { organizationId: org.id, channel: "WHATSAPP", name: "Intro", body: "Hi! Thanks for your interest — happy to answer any questions." },
    }),
    prisma.template.create({
      data: { organizationId: org.id, channel: "EMAIL", name: "Proposal follow-up", body: "Following up on the proposal I sent over — any questions?" },
    }),
  ]);

  const companyNames = ["ABC Company", "Bright Retail", "Northwind Traders", "Acme Logistics", "Blue Ocean Media"];
  const companies = await Promise.all(
    companyNames.map((name) => prisma.company.create({ data: { organizationId: org.id, name, industry: "Services" } }))
  );

  const leadSeeds = [
    { first: "John", last: "Smith", phone: "+15551230001", email: "john.smith@abccompany.com", company: 0, source: googleAds, campaign: campaignA, stage: stageInterested, owner: sarah, score: 87, websiteUrl: "abccompany.com", country: "United States", price: 8500, duration: "3 weeks", statusNote: "Text on WhatsApp (Sarah)" },
    { first: "Priya", last: "Patel", phone: "+15551230002", email: "priya@brightretail.com", company: 1, source: facebookAds, campaign: campaignB, stage: stageContacted, owner: mike, score: 55, websiteUrl: "brightretail.com", country: "United Kingdom" },
    { first: "Diego", last: "Alvarez", phone: "+15551230003", email: "diego@northwind.com", company: 2, source: referral, stage: stageNew, owner: john, score: 20 },
    { first: "Mia", last: "Wong", phone: "+15551230004", email: "mia@acmelogistics.com", company: 3, source: website, stage: stageFollowUp, owner: sarah, score: 72, deliveryDate: "future" },
    { first: "Sam", last: "Okafor", phone: "+15551230005", email: "sam@blueocean.com", company: 4, source: googleAds, campaign: campaignA, stage: stageWon, owner: mike, score: 100 },
    { first: "Grace", last: "Kim", phone: "+15551230006", email: "grace@abccompany.com", company: 0, source: referral, stage: stageLost, owner: john, score: 0 },
    { first: "Tom", last: "Reilly", phone: "+15551230007", email: "tom@brightretail.com", company: 1, source: website, stage: stageNew, owner: sarah, score: 25 },
    { first: "Elena", last: "Fischer", phone: "+15551230008", email: "elena@northwind.com", company: 2, source: facebookAds, campaign: campaignB, stage: stageContacted, owner: mike, score: 48 },
  ];

  let i = 0;
  for (const seed of leadSeeds) {
    const contact = await prisma.contact.create({
      data: {
        organizationId: org.id,
        firstName: seed.first,
        lastName: seed.last,
        email: seed.email,
        phone: seed.phone,
        companyId: companies[seed.company].id,
      },
    });

    const lead = await prisma.lead.create({
      data: {
        organizationId: org.id,
        contactId: contact.id,
        companyId: companies[seed.company].id,
        sourceId: seed.source.id,
        campaignId: seed.campaign?.id,
        pipelineId: pipeline.id,
        stageId: seed.stage.id,
        ownerId: seed.owner.id,
        createdById: admin.id,
        status: seed.stage.isWon ? "WON" : seed.stage.isLost ? "LOST" : "OPEN",
        score: seed.score,
        scoreReasons: ["Seeded demo data"],
        websiteUrl: seed.websiteUrl,
        country: seed.country,
        price: seed.price,
        duration: seed.duration,
        statusNote: seed.statusNote,
        deliveryDate: seed.deliveryDate ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : undefined,
      },
    });

    await prisma.activity.create({
      data: { organizationId: org.id, leadId: lead.id, type: "LEAD_CREATED", summary: "Lead created" },
    });
    await prisma.activity.create({
      data: { organizationId: org.id, leadId: lead.id, type: "LEAD_ASSIGNED", summary: `Assigned to ${seed.owner.name}` },
    });

    // Give the more advanced leads a fuller history: a WhatsApp thread, a call, and a follow-up.
    if (seed.stage.order >= 1) {
      const conversation = await prisma.conversation.create({
        data: { organizationId: org.id, leadId: lead.id, channel: "WHATSAPP", lastMessageAt: new Date() },
      });
      await prisma.message.create({
        data: { conversationId: conversation.id, direction: "OUTBOUND", status: "SENT", body: "Hi! Thanks for reaching out — happy to help.", sentById: seed.owner.id },
      });
      await prisma.message.create({
        data: { conversationId: conversation.id, direction: "INBOUND", status: "RECEIVED", body: "Yes, I'm interested. What does it cost?" },
      });
      await prisma.activity.create({
        data: { organizationId: org.id, leadId: lead.id, type: "MESSAGE_OUTBOUND", summary: "💬 WHATSAPP sent" },
      });
      await prisma.activity.create({
        data: { organizationId: org.id, leadId: lead.id, type: "MESSAGE_INBOUND", summary: '💬 WHATSAPP received: "Yes, I\'m interested. What does it cost?"' },
      });
    }

    if (seed.stage.order >= 2) {
      const call = await prisma.call.create({
        data: {
          organizationId: org.id,
          leadId: lead.id,
          agentId: seed.owner.id,
          direction: "OUTBOUND",
          status: "ANSWERED",
          durationSec: 512,
          toNumber: seed.phone,
          aiSummary: "Customer wants a proposal; budget $5,000-$8,000; timeline 30 days.",
          nextAction: "Send proposal",
        },
      });
      await prisma.activity.create({
        data: { organizationId: org.id, leadId: lead.id, type: "CALL_LOGGED", summary: "📞 Outbound call — answered (8:32)", metadata: { callId: call.id } },
      });
    }

    if (seed.stage.order === 3) {
      const dueAt = new Date();
      dueAt.setDate(dueAt.getDate() + (i % 2 === 0 ? -1 : 2));
      const task = await prisma.task.create({
        data: {
          organizationId: org.id,
          leadId: lead.id,
          assignedToId: seed.owner.id,
          type: "CALL",
          title: "Follow up on proposal",
          dueAt,
        },
      });
      await prisma.activity.create({
        data: { organizationId: org.id, leadId: lead.id, type: "TASK_CREATED", summary: "Follow-up scheduled — Follow up on proposal", metadata: { taskId: task.id } },
      });
    }

    if (seed.stage.isWon) {
      await prisma.deal.create({
        data: {
          organizationId: org.id,
          leadId: lead.id,
          title: "Website redesign package",
          value: 8500,
          status: "WON",
          closedAt: new Date(),
        },
      });
    }
    if (seed.stage.isLost) {
      await prisma.deal.create({
        data: { organizationId: org.id, leadId: lead.id, title: "Website redesign package", value: 4000, status: "LOST", closedAt: new Date() },
      });
    }

    i += 1;
  }

  // A couple of unassigned leads entered by the LEAD_ENTRY demo user, so
  // the "pending allocation" and 24h-visibility behavior has something to
  // show without any manual steps.
  const entrySeeds = [
    { first: "Noah Bennett", phone: "+15551239001", email: "noah@driftwoodstudio.com", idName: "driftwood_studio", idUrl: "https://fiverr.com/driftwood_studio", websiteUrl: "driftwoodstudio.com", country: "Canada", statusNote: "New lead, not contacted yet" },
    { first: "Layla Haddad", phone: "+15551239002", email: "layla@haddadconsulting.com", idName: "layla.h", idUrl: "https://upwork.com/freelancers/layla-h", websiteUrl: "haddadconsulting.com", country: "United Arab Emirates", statusNote: "Vm" },
  ];
  for (const seed of entrySeeds) {
    const contact = await prisma.contact.create({
      data: { organizationId: org.id, firstName: seed.first, email: seed.email, phone: seed.phone },
    });
    const lead = await prisma.lead.create({
      data: {
        organizationId: org.id,
        contactId: contact.id,
        pipelineId: pipeline.id,
        stageId: stageNew.id,
        createdById: priyaEntry.id,
        idName: seed.idName,
        idUrl: seed.idUrl,
        websiteUrl: seed.websiteUrl,
        country: seed.country,
        statusNote: seed.statusNote,
      },
    });
    await prisma.activity.create({
      data: { organizationId: org.id, leadId: lead.id, type: "LEAD_CREATED", summary: "Lead created", actorId: priyaEntry.id },
    });
  }

  console.log(`Seeded org ${org.id} with ${agents.length + 2} users and ${leadSeeds.length + entrySeeds.length} leads.`);
  console.log("Login with admin@unifycrm.dev / password123 (or sarah/mike/john/priya.entry@unifycrm.dev).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
