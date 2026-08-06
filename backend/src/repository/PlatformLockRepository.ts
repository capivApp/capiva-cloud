import { Injectable } from "@di/index";
import { BaseRepository } from "@repository/BaseRepository";

/**
 * Lease de liderança. Recurso da plataforma (não pertence a organização
 * nenhuma), por isso fora do escopo multi-tenant.
 */
@Injectable()
export class PlatformLockRepository extends BaseRepository {
  /**
   * Tenta adquirir ou renovar a lease. Retorna true se este `holder` é o líder.
   *
   * O UPDATE condicional é atômico no banco: só passa quem já era o dono ou
   * quem encontra a lease vencida. O INSERT cobre a primeira execução e perde
   * por chave primária se outra réplica chegar antes — o que é exatamente o
   * comportamento desejado.
   */
  async acquire(name: string, holder: string, ttlMs: number): Promise<boolean> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    const { count } = await this.tx.platformLock.updateMany({
      where: { name, OR: [{ holder }, { expiresAt: { lt: now } }] },
      data: { holder, expiresAt, acquiredAt: now },
    });
    if (count > 0) return true;

    try {
      await this.tx.platformLock.create({ data: { name, holder, expiresAt } });
      return true;
    } catch {
      return false;
    }
  }

  /** Libera a lease no shutdown para o próximo líder assumir sem esperar o TTL. */
  async release(name: string, holder: string): Promise<void> {
    await this.tx.platformLock.deleteMany({ where: { name, holder } });
  }
}
