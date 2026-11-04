-- AlterTable
ALTER TABLE "managed_databases" ADD COLUMN "previewOfApplicationId" TEXT;

-- CreateIndex
CREATE INDEX "managed_databases_previewOfApplicationId_idx" ON "managed_databases"("previewOfApplicationId");
