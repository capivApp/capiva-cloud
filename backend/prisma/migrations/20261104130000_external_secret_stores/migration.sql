-- CreateEnum
CREATE TYPE "SecretStoreProvider" AS ENUM ('AWS_SECRETS_MANAGER', 'VAULT', 'GCP_SECRET_MANAGER');

-- AlterEnum
ALTER TYPE "EnvVarSource" ADD VALUE 'EXTERNAL';

-- AlterTable
ALTER TABLE "env_vars" ADD COLUMN     "remoteProperty" TEXT,
ADD COLUMN     "secretStoreId" TEXT;

-- CreateTable
CREATE TABLE "secret_stores" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" "SecretStoreProvider" NOT NULL,
    "config" JSONB NOT NULL,
    "credentialsCipher" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "secret_stores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "secret_stores_organizationId_name_key" ON "secret_stores"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "secret_stores" ADD CONSTRAINT "secret_stores_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "env_vars" ADD CONSTRAINT "env_vars_secretStoreId_fkey" FOREIGN KEY ("secretStoreId") REFERENCES "secret_stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
