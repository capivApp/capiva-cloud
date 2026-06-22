/*
  Warnings:

  - You are about to drop the `backup_configs` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "backup_configs" DROP CONSTRAINT "backup_configs_organizationId_fkey";

-- DropTable
DROP TABLE "backup_configs";
