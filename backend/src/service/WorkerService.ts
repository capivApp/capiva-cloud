import { Injectable } from "@di/index";
import { WorkerRepository } from "@repository/WorkerRepository";
import { ReconcilerFactory } from "@infra/kubernetes/ReconcilerFactory";
import { KubeContextResolver } from "@service/KubeContextResolver";
import { withTransaction } from "@database/withTransaction";
import { HttpError } from "@functions/HttpError";
import type { Prisma, SourceKind, Worker } from "@prisma-generated/client";

export interface CreateWorkerInput {
  projectId: string;
  environmentId: string;
  name: string;
  source: SourceKind;
  sourceConfig: Record<string, unknown>;
  profile?: Worker["profile"];
  replicas?: number;
}

@Injectable()
export class WorkerService {
  constructor(
    private readonly workers: WorkerRepository,
    private readonly reconcilers: ReconcilerFactory,
    private readonly kube: KubeContextResolver,
  ) {}

  list(projectId: string, tenant: { organizationId: string }): Promise<Worker[]> {
    return withTransaction(() => this.workers.listByProject(projectId), { tenant });
  }

  async create(input: CreateWorkerInput & { environmentId: string }, tenant: { organizationId: string }): Promise<Worker> {
    const worker = await withTransaction(
      () =>
        this.workers.create({
          projectId: input.projectId,
          name: input.name,
          source: input.source,
          sourceConfig: input.sourceConfig as Prisma.InputJsonValue,
          profile: input.profile ?? "SMALL",
          replicas: input.replicas ?? 1,
        }),
      { tenant },
    );

    const ctx = await this.kube.forEnvironment(input.environmentId, tenant);
    const image = (input.sourceConfig?.image as string) ?? "ghcr.io/capiva/placeholder:latest";
    const status = await this.reconcilers.forWorker().reconcile({ worker, image }, ctx);
    await withTransaction(() => this.workers.updateStatus(worker.id, status.ready ? "running" : "progressing"), { tenant });
    return worker;
  }

  /** Atualiza envs/réplicas/imagem do worker e reconcilia. */
  async update(
    id: string,
    environmentId: string,
    patch: { replicas?: number; image?: string; env?: { key: string; value: string }[] },
    tenant: { organizationId: string },
  ): Promise<Worker> {
    const worker = await withTransaction(() => this.workers.findById(id), { tenant });
    if (!worker) throw HttpError.notFound("Worker não encontrado.");

    const sourceConfig = { ...(worker.sourceConfig as Record<string, unknown>) };
    if (patch.image !== undefined) sourceConfig.image = patch.image;
    if (patch.env !== undefined) sourceConfig.env = patch.env;

    const updated = await withTransaction(
      () => this.workers.update(id, { replicas: patch.replicas ?? worker.replicas, sourceConfig: sourceConfig as Prisma.InputJsonValue }),
      { tenant },
    );

    const ctx = await this.kube.forEnvironment(environmentId, tenant);
    const image = (sourceConfig.image as string) ?? "ghcr.io/capiva/placeholder:latest";
    const status = await this.reconcilers.forWorker().reconcile({ worker: updated, image }, ctx);
    await withTransaction(() => this.workers.updateStatus(id, status.ready ? "running" : "progressing"), { tenant });
    return updated;
  }

  async remove(id: string, environmentId: string, tenant: { organizationId: string }): Promise<void> {
    const worker = await withTransaction(() => this.workers.findById(id), { tenant });
    if (!worker) throw HttpError.notFound("Worker não encontrado.");
    const ctx = await this.kube.forEnvironment(environmentId, tenant);
    await this.reconcilers.forWorker().destroy({ worker }, ctx);
    await withTransaction(() => this.workers.delete(id), { tenant });
  }
}
