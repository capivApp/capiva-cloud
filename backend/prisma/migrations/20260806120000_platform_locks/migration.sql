-- CreateTable: lease de liderança para os schedulers do control plane.
-- Permite rodar N réplicas do backend sem duplicar backups e uptime checks.
CREATE TABLE "platform_locks" (
    "name" TEXT NOT NULL,
    "holder" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_locks_pkey" PRIMARY KEY ("name")
);
