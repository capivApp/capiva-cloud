-- CreateTable: andamento dos restores de backup (banco e volume).

-- CreateEnum
CREATE TYPE "RestoreMode" AS ENUM ('IN_PLACE', 'AS_COPY');

-- CreateEnum
CREATE TYPE "RestoreStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "backup_restores" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "backupId" TEXT NOT NULL,
    "kind" "BackupKind" NOT NULL,
    "mode" "RestoreMode" NOT NULL,
    "status" "RestoreStatus" NOT NULL DEFAULT 'PENDING',
    "sourceDatabaseId" TEXT,
    "targetDatabaseId" TEXT,
    "volumeId" TEXT,
    "targetName" TEXT,
    "jobName" TEXT,
    "secretName" TEXT,
    "message" TEXT,
    "requestedBy" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "backup_restores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "backup_restores_organizationId_idx" ON "backup_restores"("organizationId");

-- CreateIndex
CREATE INDEX "backup_restores_backupId_idx" ON "backup_restores"("backupId");

-- CreateIndex
CREATE INDEX "backup_restores_sourceDatabaseId_idx" ON "backup_restores"("sourceDatabaseId");

-- CreateIndex
CREATE INDEX "backup_restores_volumeId_idx" ON "backup_restores"("volumeId");

-- AddForeignKey
ALTER TABLE "backup_restores" ADD CONSTRAINT "backup_restores_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_restores" ADD CONSTRAINT "backup_restores_backupId_fkey" FOREIGN KEY ("backupId") REFERENCES "backups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
