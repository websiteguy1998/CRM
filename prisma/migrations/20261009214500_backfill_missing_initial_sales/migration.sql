-- Data-only migration: backfill a missing INITIAL Sale row for every WON
-- lead that already has a price but predates the Sale ledger (or was won
-- via "Skip for now" with no amount entered at the time). Without this,
-- the next upsell recorded on any of these leads would wipe their existing
-- won value down to just the upsell amount (recalculateLeadPrice sums only
-- actual Sale rows). closedAt is backdated to the lead's most recent "won"
-- stage change when we have one, falling back to when the lead row was
-- last updated.
INSERT INTO "Sale" ("id", "organizationId", "leadId", "type", "amount", "closedAt", "createdAt")
SELECT
  'bf_' || replace(gen_random_uuid()::text, '-', ''),
  l."organizationId",
  l.id,
  'INITIAL',
  l.price,
  COALESCE(
    (
      SELECT lsh."changedAt"
      FROM "LeadStageHistory" lsh
      JOIN "PipelineStage" ps ON ps.id = lsh."toStageId"
      WHERE lsh."leadId" = l.id AND ps."isWon" = true
      ORDER BY lsh."changedAt" DESC
      LIMIT 1
    ),
    l."updatedAt"
  ),
  now()
FROM "Lead" l
WHERE l.status = 'WON'
  AND l.price IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Sale" s WHERE s."leadId" = l.id);
