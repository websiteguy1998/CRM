-- DropForeignKey
ALTER TABLE "Call" DROP CONSTRAINT "Call_leadId_fkey";

-- AlterTable
ALTER TABLE "Call" ALTER COLUMN "leadId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
