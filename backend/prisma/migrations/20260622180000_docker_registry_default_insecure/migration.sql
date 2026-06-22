-- AlterTable: registry de destino padrão, suporte a registries inseguros (HTTP) e sem autenticação.
ALTER TABLE "docker_registries"
  ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "insecure" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "docker_registries" ALTER COLUMN "username" SET DEFAULT '';
ALTER TABLE "docker_registries" ALTER COLUMN "passwordCipher" SET DEFAULT '';
