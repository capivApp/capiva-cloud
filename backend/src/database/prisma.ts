import { PrismaClient } from "@prisma-generated/client";
import { config } from "../config";

/**
 * Cliente Prisma singleton com driver adapter por provider (Prisma 7 usa o
 * engine "client", que exige um adapter). Mantém o banco CONFIGURÁVEL por
 * ambiente (DATABASE_PROVIDER). Único ponto de criação do client no sistema —
 * acesso permitido somente em Repositories/DAO.
 */
function createAdapter() {
  const url = process.env.DATABASE_URL!;
  switch (config.databaseProvider) {
    case "sqlite": {
      const { PrismaBetterSQLite3 } = require("@prisma/adapter-better-sqlite3");
      return new PrismaBetterSQLite3({ url });
    }
    case "mysql": {
      // Requer `bun add @prisma/adapter-mariadb` (compatível com MySQL).
      const { PrismaMariaDb } = require("@prisma/adapter-mariadb");
      return new PrismaMariaDb({ uri: url });
    }
    case "postgresql":
    default: {
      const { PrismaPg } = require("@prisma/adapter-pg");
      return new PrismaPg({ connectionString: url });
    }
  }
}

const prismaClient = new PrismaClient({
  adapter: createAdapter(),
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

export default prismaClient;
export type { PrismaClient };
