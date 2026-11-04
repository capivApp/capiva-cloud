import { HttpError } from "@functions/HttpError";
import type { DbBackupKind } from "@infra/kubernetes/databaseManifests";

export interface RestoreCommandOptions {
  /** Zera o destino antes de reaplicar o dump (restore sobre o próprio banco). */
  resetTarget: boolean;
}

/**
 * Como cada tipo de banco reaplica um dump lógico (.sql.gz) vindo do S3. As
 * credenciais chegam por env (Secret efêmero): `$OBJECT_KEY`, `$SRC_URL` ou
 * `$DB_HOST`/`$DB_USER`/`$DB_PASS`/`$DB_NAME`.
 */
export interface RestoreKindStrategy {
  readonly kind: DbBackupKind;
  command(options: RestoreCommandOptions): string;
}

const SETUP = `set -e; mc alias set s3 "$S3_ENDPOINT" "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY" >/dev/null`;
const FETCH_DUMP = `mc cat "s3/$S3_BUCKET/$OBJECT_KEY" | gunzip`;

/** Espera o banco aceitar conexão: a cópia recém-criada ainda está subindo no operator. */
const waitFor = (probe: string) => `for i in $(seq 1 90); do ${probe} && break; sleep 10; done`;

const steps = (...parts: (string | false)[]) => [SETUP, ...parts.filter(Boolean)].join("; ");

/**
 * O dump é SQL puro (pg_dump sem `-Fc`), então o restore é `psql`, não `pg_restore`.
 * `ON_ERROR_STOP` faz o Job falhar no primeiro erro em vez de terminar "ok" pela metade.
 */
class PostgresRestore implements RestoreKindStrategy {
  readonly kind = "POSTGRESQL" as const;

  command({ resetTarget }: RestoreCommandOptions): string {
    return steps(
      waitFor('pg_isready -d "$SRC_URL"'),
      resetTarget && `psql -v ON_ERROR_STOP=1 "$SRC_URL" -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"`,
      `${FETCH_DUMP} | psql -v ON_ERROR_STOP=1 "$SRC_URL"`,
    );
  }
}

/** Crase escapada para dentro de `sh -c "..."`: sem a barra vira substituição de comando. */
const MYSQL_DB = "\\`$DB_NAME\\`";
const MYSQL_LOGIN = '-h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS"';

class MysqlRestore implements RestoreKindStrategy {
  readonly kind = "MYSQL" as const;

  command({ resetTarget }: RestoreCommandOptions): string {
    return steps(
      waitFor(`mysqladmin ping ${MYSQL_LOGIN} --silent`),
      resetTarget && `mysql ${MYSQL_LOGIN} -e "DROP DATABASE IF EXISTS ${MYSQL_DB}"`,
      `mysql ${MYSQL_LOGIN} -e "CREATE DATABASE IF NOT EXISTS ${MYSQL_DB}"`,
      `${FETCH_DUMP} | mysql ${MYSQL_LOGIN} "$DB_NAME"`,
    );
  }
}

const RESTORE_KINDS: Record<string, RestoreKindStrategy> = {
  POSTGRESQL: new PostgresRestore(),
  MYSQL: new MysqlRestore(),
};

/** Strategy do tipo de banco. Tipo sem dump lógico responde 400 com o motivo. */
export const createRestoreKindStrategy = (kind: string): RestoreKindStrategy => {
  const strategy = RESTORE_KINDS[kind];
  if (strategy) return strategy;
  throw HttpError.badRequest(`Restore de backup não é suportado para ${kind}. Use PostgreSQL ou MySQL.`, "RESTORE_NOT_SUPPORTED");
};
