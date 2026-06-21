import { Injectable } from "@di/index";
import { UserRepository } from "@repository/UserRepository";
import { OrganizationRepository } from "@repository/OrganizationRepository";
import { SessionService, type IssuedSession } from "@service/SessionService";
import { withTransaction } from "@database/withTransaction";
import { hashPassword, verifyPassword } from "@auth/password";
import { createAccessToken } from "@auth/tokens";
import type { SessionDevice } from "@auth/fingerprint";
import { HttpError } from "@functions/HttpError";
import type { User } from "@prisma-generated/client";

export interface AuthResult {
  accessToken: string;
  refresh: IssuedSession;
  user: Pick<User, "id" | "email" | "name">;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * Regras de autenticação: registro, login, refresh e logout.
 * Orquestra UserRepository + OrganizationRepository + SessionService dentro
 * de transações (withTransaction). Emite access token curto + refresh rotacionado.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly orgs: OrganizationRepository,
    private readonly sessions: SessionService,
  ) {}

  async register(
    input: { email: string; name: string; password: string; organizationName?: string },
    device: SessionDevice,
  ): Promise<AuthResult> {
    return withTransaction(async () => {
      const existing = await this.users.findByEmail(input.email);
      if (existing) throw HttpError.conflict("E-mail já cadastrado.");

      const user = await this.users.create({
        email: input.email,
        name: input.name,
        passwordHash: await hashPassword(input.password),
      });

      // Cria a organização inicial e vincula o usuário como OWNER.
      const orgName = input.organizationName ?? `${input.name}'s Org`;
      const org = await this.orgs.create({ name: orgName, slug: `${slugify(orgName)}-${user.id.slice(-6)}` });
      await this.orgs.addMember({ userId: user.id, organizationId: org.id, role: "OWNER" });

      return this.issue(user, device);
    });
  }

  async login(input: { email: string; password: string }, device: SessionDevice): Promise<AuthResult> {
    return withTransaction(async () => {
      const user = await this.users.findByEmail(input.email);
      if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
        throw HttpError.unauthorized("Credenciais inválidas.");
      }
      return this.issue(user, device);
    });
  }

  async refresh(presentedToken: string): Promise<AuthResult> {
    return withTransaction(async () => {
      const rotated = await this.sessions.rotate(presentedToken);
      const user = await this.users.findById(rotated.session.userId);
      if (!user) throw HttpError.unauthorized("Sessão inválida.");
      const accessToken = createAccessToken({
        sub: user.id,
        email: user.email,
        name: user.name,
        sid: rotated.session.id,
      });
      return { accessToken, refresh: rotated, user: { id: user.id, email: user.email, name: user.name } };
    });
  }

  async logout(presentedToken: string | undefined): Promise<void> {
    if (!presentedToken) return;
    await withTransaction(async () => {
      await this.sessions.revokeByToken(presentedToken);
    });
  }

  private async issue(user: User, device: SessionDevice): Promise<AuthResult> {
    const refresh = await this.sessions.create(user.id, device);
    const accessToken = createAccessToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      sid: refresh.session.id,
    });
    return { accessToken, refresh, user: { id: user.id, email: user.email, name: user.name } };
  }
}
