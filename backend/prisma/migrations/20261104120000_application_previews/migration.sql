-- Preview deployments por PR/MR: a aplicação de preview aponta para a original
-- (previewOfId) e para o número do PR. Um preview por (aplicação, PR).

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "previewOfId" TEXT,
ADD COLUMN     "previewPrNumber" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "applications_previewOfId_previewPrNumber_key" ON "applications"("previewOfId", "previewPrNumber");

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_previewOfId_fkey" FOREIGN KEY ("previewOfId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
