import { Injectable } from "@di/index";
import { EnvVarRepository } from "@repository/EnvVarRepository";
import { ApplicationService } from "@service/ApplicationService";
import { withTransaction } from "@database/withTransaction";
import { encrypt } from "@functions/crypto";

/** Item de variável vindo do editor (já parseado/validado no controller). */
export interface EnvVarInput {
  key: string;
  value: string;
  secret: boolean;
}

/** Projeção segura: nunca expõe o valor de variáveis secretas. */
export interface EnvVarView {
  id: string;
  key: string;
  value: string;
  secret: boolean;
  source: "MANUAL" | "INJECTED";
  overridden: boolean;
  /** Indica que existe valor armazenado (útil quando o valor é mascarado). */
  hasValue: boolean;
}

/**
 * Decide o valor a persistir para uma variável (regra pura, testável):
 * - não-secreta → valor em texto puro;
 * - secreta com valor em branco e segredo já existente → mantém o cifrado atual;
 * - secreta com valor informado → cifra antes de persistir.
 */
export function resolveStoredValue(
  item: EnvVarInput,
  previous: { value: string; secret: boolean } | undefined,
): string {
  if (!item.secret) return item.value;
  if (item.value === "" && previous?.secret) return previous.value;
  return encrypt(item.value);
}

/**
 * Regras de edição de variáveis de ambiente pós-criação.
 *
 * - Variáveis `secret` são cifradas em repouso (AES-256-GCM) e nunca retornadas
 *   no GET — o valor é mascarado e preservado quando salvo em branco.
 * - O editor gerencia apenas variáveis de origem MANUAL; variáveis INJECTED
 *   (provenientes de dependências) não são tocadas pela substituição em lote.
 * - Após cada alteração a aplicação é reconciliada para refletir no Deployment.
 */
@Injectable()
export class EnvVarService {
  constructor(
    private readonly envVars: EnvVarRepository,
    private readonly apps: ApplicationService,
  ) {}

  /** Lista as variáveis mascarando segredos. Valida posse via ApplicationService. */
  async list(applicationId: string, tenant: { organizationId: string }): Promise<EnvVarView[]> {
    await this.apps.getById(applicationId, tenant);
    const vars = await withTransaction(() => this.envVars.listByApplication(applicationId), { tenant });
    return vars.map((v) => ({
      id: v.id,
      key: v.key,
      value: v.secret ? "" : v.value,
      secret: v.secret,
      source: v.source as "MANUAL" | "INJECTED",
      overridden: v.overridden,
      hasValue: v.secret ? true : v.value.length > 0,
    }));
  }

  /**
   * Substitui em lote as variáveis MANUAL (suporta colar `.env` no front, que
   * envia o array já parseado). Variáveis INJECTED são preservadas.
   */
  async replace(applicationId: string, items: EnvVarInput[], tenant: { organizationId: string }): Promise<EnvVarView[]> {
    const app = await this.apps.getById(applicationId, tenant);

    await withTransaction(async () => {
      const existing = await this.envVars.listByApplication(applicationId);
      const previousByKey = new Map(existing.map((e) => [e.key, e]));
      const incomingKeys = new Set(items.map((i) => i.key));

      for (const item of items) {
        const value = resolveStoredValue(item, previousByKey.get(item.key));
        await this.envVars.upsert({ applicationId, key: item.key, value, secret: item.secret, source: "MANUAL" });
      }

      // Remove apenas variáveis MANUAL que sumiram do payload.
      for (const e of existing) {
        if (e.source === "MANUAL" && !incomingKeys.has(e.key)) {
          await this.envVars.delete(applicationId, e.key);
        }
      }
    }, { tenant });

    await this.apps.reconcile(app, tenant).catch((e) => console.error("[env] reconcile:", (e as Error).message));
    return this.list(applicationId, tenant);
  }

  /** Remove uma única variável (qualquer origem) e reconcilia. */
  async removeKey(applicationId: string, key: string, tenant: { organizationId: string }): Promise<void> {
    const app = await this.apps.getById(applicationId, tenant);
    await withTransaction(() => this.envVars.delete(applicationId, key), { tenant });
    await this.apps.reconcile(app, tenant).catch((e) => console.error("[env] reconcile:", (e as Error).message));
  }
}
