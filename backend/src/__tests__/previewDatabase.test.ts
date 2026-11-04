/**
 * Banco do preview: por padrão o preview ganha uma CÓPIA dos bancos que a origem usa
 * (dados do último backup), para uma migration no boot do preview não tocar produção.
 * Regras puras: modo, nome do clone, quais bancos a origem usa e qual backup serve.
 */
import { describe, expect, it } from "bun:test";
import type { Backup } from "@prisma-generated/client";
import {
  buildPreviewDatabaseName,
  findBancosDaOrigem,
  hostOfConnection,
  pickBackupRestauravel,
  readPreviewDatabaseMode,
  readPreviewDatabaseNotes,
} from "@service/preview/previewDatabase";

describe("readPreviewDatabaseMode", () => {
  it("sem configuração, o preview recebe cópia", () => {
    expect(readPreviewDatabaseMode({})).toBe("copy");
    expect(readPreviewDatabaseMode(null)).toBe("copy");
    expect(readPreviewDatabaseMode({ previews: { enabled: true } })).toBe("copy");
  });

  it("compartilhado só quando pedido", () => {
    expect(readPreviewDatabaseMode({ previews: { enabled: true, database: "shared" } })).toBe(
      "shared",
    );
  });

  it("valor desconhecido cai na cópia, o modo seguro", () => {
    expect(readPreviewDatabaseMode({ previews: { database: "qualquer" } })).toBe("copy");
  });
});

describe("buildPreviewDatabaseName", () => {
  it("prefixa com o número do PR", () => {
    expect(buildPreviewDatabaseName(42, "pg-main")).toBe("pr-42-pg-main");
  });
});

describe("hostOfConnection", () => {
  it("lê o host de uma URL", () => {
    expect(hostOfConnection("postgresql://u:p@pg-rw.prod.svc.cluster.local:5432/app")).toBe(
      "pg-rw.prod.svc.cluster.local",
    );
  });

  it("lê o host de host:porta (sem esquema)", () => {
    expect(hostOfConnection("kafka-kafka-bootstrap.prod.svc.cluster.local:9092")).toBe(
      "kafka-kafka-bootstrap.prod.svc.cluster.local",
    );
  });

  it("valor que não é endereço devolve null", () => {
    expect(hostOfConnection("")).toBeNull();
  });
});

describe("findBancosDaOrigem", () => {
  const bancos = [
    { id: "db-1", host: "db-rw.prod.svc.cluster.local" },
    { id: "db-2", host: "mydb-rw.prod.svc.cluster.local" },
    { id: "db-3", host: "cache.prod.svc.cluster.local" },
  ];

  it("só os bancos cujo host aparece nas conexões injetadas", () => {
    const conexoes = ["postgresql://u:p@db-rw.prod.svc.cluster.local:5432/app"];
    expect(findBancosDaOrigem(conexoes, bancos)).toEqual([bancos[0]]);
  });

  it("nome que é sufixo de outro não casa por engano", () => {
    const conexoes = ["postgresql://u:p@mydb-rw.prod.svc.cluster.local:5432/app"];
    expect(findBancosDaOrigem(conexoes, bancos)).toEqual([bancos[1]]);
  });

  it("banco ligado por duas variáveis entra uma vez", () => {
    const conexoes = [
      "redis://cache.prod.svc.cluster.local:6379",
      "cache.prod.svc.cluster.local:26379",
    ];
    expect(findBancosDaOrigem(conexoes, bancos)).toEqual([bancos[2]]);
  });
});

describe("pickBackupRestauravel", () => {
  const backup = (over: Partial<Backup>): Backup =>
    ({
      id: "b",
      status: "completed",
      destination: "s3://x/db.sql.gz",
      startedAt: new Date("2026-11-01"),
      ...over,
    }) as Backup;

  it("o concluído mais recente com arquivo do próprio banco", () => {
    const antigo = backup({ id: "b1", startedAt: new Date("2026-10-01") });
    const novo = backup({ id: "b2", startedAt: new Date("2026-11-03") });
    expect(pickBackupRestauravel([antigo, novo])?.id).toBe("b2");
  });

  it("ignora backup em andamento, com falha ou de vários bancos", () => {
    const rodando = backup({ id: "b1", status: "running", startedAt: new Date("2026-11-04") });
    const falhou = backup({ id: "b2", status: "failed", startedAt: new Date("2026-11-03") });
    const varios = backup({
      id: "b3",
      destination: "s3://x/all/",
      startedAt: new Date("2026-11-02"),
    });
    const bom = backup({ id: "b4", startedAt: new Date("2026-10-01") });
    expect(pickBackupRestauravel([rodando, falhou, varios, bom])?.id).toBe("b4");
  });

  it("sem backup que sirva devolve null", () => {
    expect(pickBackupRestauravel([backup({ status: "failed" })])).toBeNull();
  });
});

describe("readPreviewDatabaseNotes", () => {
  it("lê os avisos gravados no preview", () => {
    expect(
      readPreviewDatabaseNotes({ previewDatabase: { notes: ["O banco pg subiu vazio."] } }),
    ).toEqual(["O banco pg subiu vazio."]);
  });

  it("sem avisos devolve lista vazia", () => {
    expect(readPreviewDatabaseNotes({})).toEqual([]);
    expect(readPreviewDatabaseNotes(null)).toEqual([]);
  });
});
