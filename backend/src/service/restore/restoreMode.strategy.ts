import { HttpError } from "@functions/HttpError";
import type { RestoreBackupDTO } from "@schemas/restore.schema";
import type { RestoreMode } from "@prisma-generated/client";

/** Cria o banco que recebe a cópia (fluxo normal do ManagedDatabaseService). */
export type CopyFactory<TDatabase> = (source: TDatabase, newName: string) => Promise<TDatabase>;

/**
 * Para onde o backup vai: sobre o próprio banco (destrutivo, exige o nome
 * digitado) ou num banco novo. Modo novo = uma classe nova + uma linha no mapa.
 */
export interface RestoreModeStrategy {
  readonly mode: RestoreMode;
  /** Zera o destino antes de reaplicar o dump. */
  readonly resetTarget: boolean;
  validate(input: RestoreBackupDTO, source: { name: string }): void;
  resolveTarget<TDatabase extends { name: string }>(
    source: TDatabase,
    input: RestoreBackupDTO,
    createCopy: CopyFactory<TDatabase>,
  ): Promise<TDatabase>;
}

class InPlaceRestore implements RestoreModeStrategy {
  readonly mode = "IN_PLACE" as const;
  readonly resetTarget = true;

  validate(input: RestoreBackupDTO, source: { name: string }): void {
    if (input.mode === "IN_PLACE" && input.confirmName.trim() === source.name) return;
    throw HttpError.badRequest(
      "O nome digitado não confere com o nome do banco.",
      "RESTORE_CONFIRMATION",
    );
  }

  async resolveTarget<TDatabase extends { name: string }>(source: TDatabase): Promise<TDatabase> {
    return source;
  }
}

class AsCopyRestore implements RestoreModeStrategy {
  readonly mode = "AS_COPY" as const;
  readonly resetTarget = false;

  validate(input: RestoreBackupDTO, source: { name: string }): void {
    if (input.mode === "AS_COPY" && input.newName && input.newName !== source.name) return;
    throw HttpError.badRequest(
      "Informe um nome diferente do banco de origem.",
      "RESTORE_COPY_NAME",
    );
  }

  resolveTarget<TDatabase extends { name: string }>(
    source: TDatabase,
    input: RestoreBackupDTO,
    createCopy: CopyFactory<TDatabase>,
  ): Promise<TDatabase> {
    return createCopy(source, input.mode === "AS_COPY" ? input.newName : "");
  }
}

const RESTORE_MODES: Record<string, RestoreModeStrategy> = {
  IN_PLACE: new InPlaceRestore(),
  AS_COPY: new AsCopyRestore(),
};

export const createRestoreModeStrategy = (mode: string): RestoreModeStrategy => {
  const strategy = RESTORE_MODES[mode];
  if (strategy) return strategy;
  throw HttpError.badRequest(
    "Escolha como restaurar: sobre o banco atual ou como cópia.",
    "RESTORE_MODE",
  );
};
