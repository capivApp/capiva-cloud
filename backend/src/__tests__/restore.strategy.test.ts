/**
 * Restore de backup: seleção de strategy por tipo de banco e por modo, guards
 * de confirmação e o schema do corpo da requisição. Sem banco e sem cluster.
 */
import { describe, expect, it, mock } from "bun:test";
import { createRestoreKindStrategy } from "@service/restore/restoreKind.strategy";
import { createRestoreModeStrategy } from "@service/restore/restoreMode.strategy";
import { restoreBackupSchema } from "@schemas/restore.schema";
import { HttpError } from "@functions/HttpError";

const source = { name: "orders-db" } as const;

const captureError = (fn: () => unknown): HttpError => {
  try {
    fn();
  } catch (error) {
    return error as HttpError;
  }
  throw new Error("era esperado um erro");
};

describe("createRestoreKindStrategy", () => {
  it("escolhe a strategy do PostgreSQL e a do MySQL", () => {
    expect(createRestoreKindStrategy("POSTGRESQL").kind).toBe("POSTGRESQL");
    expect(createRestoreKindStrategy("MYSQL").kind).toBe("MYSQL");
  });

  it.each(["REDIS", "RABBITMQ", "KAFKA", "MINIO", "ELASTICSEARCH", "CLICKHOUSE"])(
    "%s responde erro claro de não suportado",
    (kind) => {
      const error = captureError(() => createRestoreKindStrategy(kind));
      expect(error).toBeInstanceOf(HttpError);
      expect(error.status).toBe(400);
      expect(error.message).toContain("não é suportado");
    },
  );
});

describe("createRestoreModeStrategy", () => {
  it("IN_PLACE zera o destino; AS_COPY não", () => {
    expect(createRestoreModeStrategy("IN_PLACE").resetTarget).toBe(true);
    expect(createRestoreModeStrategy("AS_COPY").resetTarget).toBe(false);
  });

  it("IN_PLACE exige que o usuário digite o nome do banco", () => {
    const strategy = createRestoreModeStrategy("IN_PLACE");
    const error = captureError(() => strategy.validate({ mode: "IN_PLACE", confirmName: "outro" }, source));
    expect(error.status).toBe(400);
    expect(() => strategy.validate({ mode: "IN_PLACE", confirmName: "orders-db" }, source)).not.toThrow();
  });

  it("AS_COPY exige um nome novo, diferente do banco de origem", () => {
    const strategy = createRestoreModeStrategy("AS_COPY");
    expect(captureError(() => strategy.validate({ mode: "AS_COPY", newName: "orders-db" }, source)).status).toBe(400);
    expect(() => strategy.validate({ mode: "AS_COPY", newName: "orders-copia" }, source)).not.toThrow();
  });

  it("IN_PLACE restaura no próprio banco; AS_COPY cria a cópia", async () => {
    const db = { id: "db_1", name: "orders-db" };
    const copy = { id: "db_2", name: "orders-copia" };
    const createCopy = mock(async () => copy);

    expect(await createRestoreModeStrategy("IN_PLACE").resolveTarget(db, { mode: "IN_PLACE", confirmName: "orders-db" }, createCopy)).toBe(db);
    expect(createCopy).not.toHaveBeenCalled();

    expect(await createRestoreModeStrategy("AS_COPY").resolveTarget(db, { mode: "AS_COPY", newName: "orders-copia" }, createCopy)).toBe(copy);
    expect(createCopy).toHaveBeenCalledWith(db, "orders-copia");
  });

  it("modo desconhecido é recusado", () => {
    expect(captureError(() => createRestoreModeStrategy("SIDEWAYS")).status).toBe(400);
  });
});

describe("restoreBackupSchema", () => {
  it("aceita os dois modos", () => {
    expect(restoreBackupSchema.parse({ mode: "IN_PLACE", confirmName: "orders-db" })).toEqual({ mode: "IN_PLACE", confirmName: "orders-db" });
    expect(restoreBackupSchema.parse({ mode: "AS_COPY", newName: "orders-copia" })).toEqual({ mode: "AS_COPY", newName: "orders-copia" });
  });

  it("recusa sem confirmação e nome fora do padrão, com mensagem em português", () => {
    const semConfirmacao = restoreBackupSchema.safeParse({ mode: "IN_PLACE" });
    expect(semConfirmacao.success).toBe(false);
    expect(semConfirmacao.error?.issues[0]?.message).toBe("Digite o nome do banco para confirmar.");

    const nomeInvalido = restoreBackupSchema.safeParse({ mode: "AS_COPY", newName: "Orders Copia" });
    expect(nomeInvalido.success).toBe(false);
    expect(nomeInvalido.error?.issues[0]?.message).toContain("letras minúsculas");
  });
});
