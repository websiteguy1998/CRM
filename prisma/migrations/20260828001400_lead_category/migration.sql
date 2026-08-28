-- CreateEnum
CREATE TYPE "LeadCategory" AS ENUM ('WEB_DEVELOPMENT', 'GRAPHIC_DESIGN', 'UI_DESIGN', 'SEO', 'SMM');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "category" "LeadCategory";
