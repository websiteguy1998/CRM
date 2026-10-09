-- CreateTable
CREATE TABLE "DuplicateAttempt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "attemptedById" TEXT,
    "clientName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "websiteUrl" TEXT,
    "matchedLeadId" TEXT,
    "matchedClientName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuplicateAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DuplicateAttempt_organizationId_attemptedById_createdAt_idx" ON "DuplicateAttempt"("organizationId", "attemptedById", "createdAt");

-- AddForeignKey
ALTER TABLE "DuplicateAttempt" ADD CONSTRAINT "DuplicateAttempt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateAttempt" ADD CONSTRAINT "DuplicateAttempt_attemptedById_fkey" FOREIGN KEY ("attemptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
