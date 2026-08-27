-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'LEAD_ENTRY';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "country" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "deliveryDate" TIMESTAMP(3),
ADD COLUMN     "duration" TEXT,
ADD COLUMN     "idName" TEXT,
ADD COLUMN     "idUrl" TEXT,
ADD COLUMN     "price" DECIMAL(12,2),
ADD COLUMN     "statusNote" TEXT,
ADD COLUMN     "websiteUrl" TEXT;

-- CreateTable
CREATE TABLE "SignupVerification" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignupVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SignupVerification_email_idx" ON "SignupVerification"("email");

-- CreateIndex
CREATE INDEX "Lead_organizationId_createdById_createdAt_idx" ON "Lead"("organizationId", "createdById", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_organizationId_websiteUrl_idx" ON "Lead"("organizationId", "websiteUrl");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
