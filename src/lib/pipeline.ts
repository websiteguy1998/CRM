import { prisma } from "@/lib/prisma";

export async function getDefaultPipelineWithStages(organizationId: string) {
  const pipeline = await prisma.pipeline.findFirst({
    where: { organizationId, isDefault: true },
    include: { stages: { orderBy: { order: "asc" } } },
  });
  if (!pipeline) {
    throw new Error("No default pipeline configured for this organization");
  }
  return pipeline;
}

export async function getFirstStage(organizationId: string) {
  const pipeline = await getDefaultPipelineWithStages(organizationId);
  return { pipeline, stage: pipeline.stages[0] };
}
