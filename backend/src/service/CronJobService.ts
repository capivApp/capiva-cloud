import { Injectable } from "@di/index";
import { CronJobRepository } from "@repository/CronJobRepository";
import { ReconcilerFactory } from "@infra/kubernetes/ReconcilerFactory";
import { KubeContextResolver } from "@service/KubeContextResolver";
import { withTransaction } from "@database/withTransaction";
import { HttpError } from "@functions/HttpError";
import type { CronJob, Prisma, SourceKind } from "@prisma-generated/client";

export interface CreateCronJobInput {
  projectId: string;
  environmentId: string;
  name: string;
  schedule: string;
  source: SourceKind;
  sourceConfig: Record<string, unknown>;
  profile?: CronJob["profile"];
}

@Injectable()
export class CronJobService {
  constructor(
    private readonly cronJobs: CronJobRepository,
    private readonly reconcilers: ReconcilerFactory,
    private readonly kube: KubeContextResolver,
  ) {}

  list(projectId: string, tenant: { organizationId: string }): Promise<CronJob[]> {
    return withTransaction(() => this.cronJobs.listByProject(projectId), { tenant });
  }

  async create(input: CreateCronJobInput, tenant: { organizationId: string }): Promise<CronJob> {
    const cron = await withTransaction(
      () =>
        this.cronJobs.create({
          projectId: input.projectId,
          name: input.name,
          schedule: input.schedule,
          source: input.source,
          sourceConfig: input.sourceConfig as Prisma.InputJsonValue,
          profile: input.profile ?? "NANO",
        }),
      { tenant },
    );

    const ctx = await this.kube.forEnvironment(input.environmentId, tenant);
    const image = (input.sourceConfig?.image as string) ?? "ghcr.io/capiva/placeholder:latest";
    const status = await this.reconcilers.forCronJob().reconcile({ cron, image }, ctx);
    await withTransaction(() => this.cronJobs.updateStatus(cron.id, status.ready ? "scheduled" : "progressing"), { tenant });
    return cron;
  }

  async update(
    id: string,
    environmentId: string,
    patch: { schedule?: string; image?: string; env?: { key: string; value: string }[] },
    tenant: { organizationId: string },
  ): Promise<CronJob> {
    const cron = await withTransaction(() => this.cronJobs.findById(id), { tenant });
    if (!cron) throw HttpError.notFound("Cron job não encontrado.");

    const sourceConfig = { ...(cron.sourceConfig as Record<string, unknown>) };
    if (patch.image !== undefined) sourceConfig.image = patch.image;
    if (patch.env !== undefined) sourceConfig.env = patch.env;

    const updated = await withTransaction(
      () => this.cronJobs.update(id, { schedule: patch.schedule ?? cron.schedule, sourceConfig: sourceConfig as Prisma.InputJsonValue }),
      { tenant },
    );

    const ctx = await this.kube.forEnvironment(environmentId, tenant);
    const image = (sourceConfig.image as string) ?? "ghcr.io/capiva/placeholder:latest";
    const status = await this.reconcilers.forCronJob().reconcile({ cron: updated, image }, ctx);
    await withTransaction(() => this.cronJobs.updateStatus(id, status.ready ? "scheduled" : "progressing"), { tenant });
    return updated;
  }
}
