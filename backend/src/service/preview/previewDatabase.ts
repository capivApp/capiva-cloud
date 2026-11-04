import type { Backup } from "@prisma-generated/client";
import { buildPreviewName } from "@service/preview/previewNaming";

/**
 * Banco do preview. `copy` (padrão): cada banco que a origem usa ganha um clone com os
 * dados do último backup, e uma migration no boot do preview não toca produção.
 * `shared`: o preview usa os mesmos bancos da origem (comportamento antigo, opt-in).
 */
export const PreviewDatabaseMode = { COPY: "copy", SHARED: "shared" } as const;
export type PreviewDatabaseMode = (typeof PreviewDatabaseMode)[keyof typeof PreviewDatabaseMode];

const MODES = new Set<string>(Object.values(PreviewDatabaseMode));

const isPreviewDatabaseMode = (value: unknown): value is PreviewDatabaseMode =>
  typeof value === "string" && MODES.has(value);

type Config = Record<string, unknown> | null | undefined;

export const readPreviewDatabaseMode = (sourceConfig: Config): PreviewDatabaseMode => {
  const mode = (sourceConfig?.previews as { database?: unknown } | undefined)?.database;
  return isPreviewDatabaseMode(mode) ? mode : PreviewDatabaseMode.COPY;
};

/** Mesmo limite do nome do preview: o nome do banco vira recurso no namespace. */
export const buildPreviewDatabaseName = buildPreviewName;

/** Host de uma conexão injetada: URL (`postgresql://...@host:5432/db`) ou `host:porta`. */
export const hostOfConnection = (value: string): string | null => {
  // `host:porta` também passa no URL.canParse (o host vira esquema): só URL com `://`.
  const host =
    value.includes("://") && URL.canParse(value) ? new URL(value).hostname : value.split(":")[0];
  return host || null;
};

/**
 * Quais bancos gerenciados a origem usa. O `attach` não grava vínculo: só injeta a
 * conexão como variável. Compara o host da conexão com o host interno de cada banco,
 * por igualdade (substring casaria `mydb-rw` com `db-rw`).
 */
export const findBancosDaOrigem = <T extends { host: string }>(
  conexoes: string[],
  bancos: T[],
): T[] => {
  const hosts = new Set(conexoes.map(hostOfConnection));
  return bancos.filter((banco) => hosts.has(banco.host));
};

/** Só o backup de um banco só (`.sql.gz`) tem objeto exato no S3 para restaurar. */
const isBackupRestauravel = (backup: Backup): boolean =>
  backup.status === "completed" && Boolean(backup.destination?.endsWith(".sql.gz"));

export const pickBackupRestauravel = (backups: Backup[]): Backup | null =>
  backups
    .filter(isBackupRestauravel)
    .toSorted((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0] ?? null;

/** Avisos da cópia (banco vazio, restore falhou) que vão no comentário do PR. */
export const readPreviewDatabaseNotes = (sourceConfig: Config): string[] => {
  const notes = (sourceConfig?.previewDatabase as { notes?: unknown } | undefined)?.notes;
  return Array.isArray(notes) ? notes.map(String) : [];
};
