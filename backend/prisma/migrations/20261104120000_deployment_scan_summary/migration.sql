-- AlterTable: resumo do scan de vulnerabilidades (Trivy) por deploy.
ALTER TABLE "deployments" ADD COLUMN     "scanSummary" JSONB;
