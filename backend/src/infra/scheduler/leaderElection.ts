import crypto from "crypto";
import { container } from "@di/index";
import { PlatformLockRepository } from "@repository/PlatformLockRepository";
import { withTransaction } from "@database/withTransaction";

/**
 * Eleição de líder para tarefas periódicas do control plane.
 *
 * O backend é stateless e roda com N réplicas, mas backups agendados e uptime
 * checks NÃO são idempotentes por execução: sem coordenação, 3 réplicas geram
 * 3 dumps do mesmo banco e 3× a carga de sondagem. A lease no banco garante um
 * executor por vez e expira sozinha se o líder morrer.
 */
const IDENTITY = `${process.env.HOSTNAME ?? "local"}-${crypto.randomUUID().slice(0, 8)}`;

/** TTL da lease: precisa cobrir com folga o intervalo entre ticks. */
const leaseTtl = (intervalMs: number): number => Math.max(intervalMs * 3, 60_000);

/** Identidade desta réplica (aparece no registro da lease). */
export const nodeIdentity = (): string => IDENTITY;

/**
 * Executa `task` apenas se esta réplica conseguir a lease de `name`.
 * Falha ao consultar o banco → não roda (melhor pular um ciclo do que duplicar).
 */
export async function withLeadership<T>(
  name: string,
  intervalMs: number,
  task: () => Promise<T>,
): Promise<T | null> {
  const leader = await withTransaction(
    () => container.get(PlatformLockRepository).acquire(name, IDENTITY, leaseTtl(intervalMs)),
    {},
  ).catch(() => false);

  if (!leader) return null;
  return task();
}

/** Libera as leases desta réplica no shutdown (failover imediato). */
export async function releaseLeadership(names: string[]): Promise<void> {
  const locks = container.get(PlatformLockRepository);
  await Promise.all(
    names.map((name) =>
      withTransaction(() => locks.release(name, IDENTITY), {}).catch(() => undefined),
    ),
  );
}
