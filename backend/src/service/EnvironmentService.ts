import { Injectable } from "@di/index";
import { EnvironmentRepository } from "@repository/EnvironmentRepository";
import { withTransaction } from "@database/withTransaction";
import { HttpError } from "@functions/HttpError";
import { slugify } from "@functions/slug";
import type { Environment, EnvironmentKind } from "@prisma-generated/client";

export interface CreateEnvironmentInput {
  name: string;
  kind: EnvironmentKind;
  clusterId?: string;
}

@Injectable()
export class EnvironmentService {
  constructor(private readonly environments: EnvironmentRepository) {}

  list(organizationId: string): Promise<Environment[]> {
    return withTransaction(() => this.environments.listByOrganization(organizationId), {
      tenant: { organizationId },
    });
  }

  create(organizationId: string, input: CreateEnvironmentInput): Promise<Environment> {
    // Namespace derivado do ambiente — escondido do usuário, usado pelos reconcilers.
    const namespace = `capiva-${slugify(input.name)}-${organizationId.slice(-6)}`;
    return withTransaction(
      () =>
        this.environments.create({
          organizationId,
          name: input.name,
          kind: input.kind,
          clusterId: input.clusterId,
          namespace,
        }),
      { tenant: { organizationId } },
    );
  }

  async getById(organizationId: string, id: string): Promise<Environment> {
    const env = await withTransaction(() => this.environments.findById(id), {
      tenant: { organizationId },
    });
    if (!env || env.organizationId !== organizationId) throw HttpError.notFound("Ambiente não encontrado.");
    return env;
  }

  async update(
    organizationId: string,
    id: string,
    input: { name?: string; kind?: EnvironmentKind; clusterId?: string | null },
  ): Promise<Environment> {
    await this.getById(organizationId, id);
    return withTransaction(
      () => this.environments.update(id, { name: input.name, kind: input.kind, clusterId: input.clusterId }),
      { tenant: { organizationId } },
    );
  }

  async remove(organizationId: string, id: string): Promise<void> {
    await this.getById(organizationId, id);
    await withTransaction(() => this.environments.delete(id), { tenant: { organizationId } });
  }
}
