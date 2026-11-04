-- AlterTable: isolamento de rede por ambiente (NetworkPolicy padrão do namespace).
ALTER TABLE "environments" ADD COLUMN "networkIsolation" BOOLEAN NOT NULL DEFAULT true;
