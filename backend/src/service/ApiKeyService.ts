import crypto from "crypto";
import { Injectable } from "@di/index";
import { ApiKeyRepository } from "@repository/ApiKeyRepository";
import { withTransaction } from "@database/withTransaction";
import { HttpError } from "@functions/HttpError";
import type { ApiKey, Role } from "@prisma-generated/client";

export interface ResolvedApiKey {
  keyId: string;
  organizationId: string;
  role: Role;
  name: string;
}

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

/**
 * API/CLI Keys (para o app mobile e automações). A chave crua (`cap_<prefix>_<secret>`)
 * é mostrada UMA vez na criação; guardamos apenas o sha256. `verify` resolve a
 * org + papel a partir da chave (usado pelo authMiddleware).
 */
@Injectable()
export class ApiKeyService {
  constructor(private readonly keys: ApiKeyRepository) {}

  list(organizationId: string): Promise<ApiKey[]> {
    return withTransaction(() => this.keys.listByOrganization(organizationId), { tenant: { organizationId } });
  }

  /** Cria a chave e devolve o valor cru UMA vez (não persistido). */
  async create(organizationId: string, input: { name: string; role?: Role; scopes?: string[] }): Promise<{ apiKey: ApiKey; secret: string }> {
    const prefix = crypto.randomBytes(4).toString("hex");
    const secretPart = crypto.randomBytes(24).toString("hex");
    const secret = `cap_${prefix}_${secretPart}`;
    const apiKey = await withTransaction(
      () =>
        this.keys.create({
          organizationId,
          name: input.name,
          keyHash: sha256(secret),
          prefix,
          role: input.role ?? "DEVELOPER",
          scopes: (input.scopes ?? []) as unknown as object,
        }),
      { tenant: { organizationId } },
    );
    return { apiKey, secret };
  }

  /** Resolve uma chave crua → org + papel. Atualiza lastUsedAt. */
  async verify(secret: string): Promise<ResolvedApiKey | null> {
    if (!secret.startsWith("cap_")) return null;
    const key = await withTransaction(() => this.keys.findByHash(sha256(secret)), {});
    if (!key) return null;
    await withTransaction(() => this.keys.touch(key.id), { tenant: { organizationId: key.organizationId } }).catch(() => undefined);
    return { keyId: key.id, organizationId: key.organizationId, role: key.role, name: key.name };
  }

  async revoke(organizationId: string, id: string): Promise<void> {
    const key = await withTransaction(() => this.keys.findById(id), { tenant: { organizationId } });
    if (!key || key.organizationId !== organizationId) throw HttpError.notFound("Chave não encontrada.");
    await withTransaction(() => this.keys.delete(id), { tenant: { organizationId } });
  }
}
