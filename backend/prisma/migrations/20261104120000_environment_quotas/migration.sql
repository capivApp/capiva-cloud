-- AlterTable: quota do ambiente (ResourceQuota no namespace). NULL = sem limite no recurso.
ALTER TABLE "environments"
  ADD COLUMN "quotaCpuMillicores" INTEGER,
  ADD COLUMN "quotaMemoryMib" INTEGER,
  ADD COLUMN "quotaPods" INTEGER,
  ADD COLUMN "quotaStorageGi" INTEGER;
