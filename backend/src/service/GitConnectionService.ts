import crypto from "crypto";
import { Injectable } from "@di/index";
import { GitConnectionRepository } from "@repository/GitConnectionRepository";
import { withTransaction } from "@database/withTransaction";
import { encrypt, decrypt } from "@functions/crypto";
import { HttpError } from "@functions/HttpError";
import type { GitConnection, GitProviderKind } from "@prisma-generated/client";

export interface CreateGitConnectionInput {
  provider: GitProviderKind;
  accessToken: string;
  accountLogin?: string;
  baseUrl?: string;
}

/** Conexões Git. Tokens são cifrados em repouso; webhook secret é gerado. */
@Injectable()
export class GitConnectionService {
  constructor(private readonly connections: GitConnectionRepository) {}

  list(organizationId: string): Promise<GitConnection[]> {
    return withTransaction(() => this.connections.listByOrganization(organizationId), {
      tenant: { organizationId },
    });
  }

  create(organizationId: string, input: CreateGitConnectionInput): Promise<GitConnection> {
    return withTransaction(
      () =>
        this.connections.create({
          organizationId,
          provider: input.provider,
          accessTokenCipher: encrypt(input.accessToken),
          webhookSecret: crypto.randomBytes(24).toString("hex"),
          accountLogin: input.accountLogin,
          baseUrl: input.baseUrl,
        }),
      { tenant: { organizationId } },
    );
  }

  async getById(organizationId: string, id: string): Promise<GitConnection> {
    const conn = await withTransaction(() => this.connections.findById(id), {
      tenant: { organizationId },
    });
    if (!conn || conn.organizationId !== organizationId) throw HttpError.notFound("Conexão Git não encontrada.");
    return conn;
  }

  /** Credenciais decifradas para clonar repositórios privados no build. */
  async credentials(organizationId: string, id: string): Promise<{ token: string; provider: GitProviderKind }> {
    const conn = await this.getById(organizationId, id);
    return { token: decrypt(conn.accessTokenCipher), provider: conn.provider };
  }

  async update(
    organizationId: string,
    id: string,
    input: { accessToken?: string; accountLogin?: string; baseUrl?: string },
  ): Promise<GitConnection> {
    await this.getById(organizationId, id);
    return withTransaction(
      () =>
        this.connections.update(id, {
          accountLogin: input.accountLogin,
          baseUrl: input.baseUrl,
          ...(input.accessToken ? { accessTokenCipher: encrypt(input.accessToken) } : {}),
        }),
      { tenant: { organizationId } },
    );
  }

  async remove(organizationId: string, id: string): Promise<void> {
    await this.getById(organizationId, id);
    await withTransaction(() => this.connections.delete(id), { tenant: { organizationId } });
  }
}
