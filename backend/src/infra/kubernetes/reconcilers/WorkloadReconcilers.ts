import { Injectable } from "@di/index";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import { cronJobManifest, workerManifest } from "@infra/kubernetes/manifests";
import type { IResourceReconciler, KubeContext, ObservedStatus } from "@interface/integrations";
import type { CronJob, Worker } from "@prisma-generated/client";

/** Reconciler de Worker → Deployment sem Service (processo de background). */
@Injectable()
export class WorkerReconciler implements IResourceReconciler<{ worker: Worker; image: string }> {
  constructor(private readonly k8s: KubernetesAdapter) {}

  async reconcile({ worker, image }: { worker: Worker; image: string }, ctx: KubeContext): Promise<ObservedStatus> {
    const env = (((worker.sourceConfig as Record<string, unknown>)?.env as { key: string; value: string }[]) ?? []);
    await this.k8s.apply(ctx, workerManifest(worker.name, ctx.namespace, image, worker.profile, worker.replicas, env));
    return this.k8s.observe(ctx, "apps/v1", "Deployment", worker.name);
  }
  async destroy({ worker }: { worker: Worker }, ctx: KubeContext): Promise<void> {
    await this.k8s.remove(ctx, "apps/v1", "Deployment", worker.name);
  }
}

/** Reconciler de CronJob → recurso CronJob do Kubernetes. */
@Injectable()
export class CronJobReconciler implements IResourceReconciler<{ cron: CronJob; image: string }> {
  constructor(private readonly k8s: KubernetesAdapter) {}

  async reconcile({ cron, image }: { cron: CronJob; image: string }, ctx: KubeContext): Promise<ObservedStatus> {
    await this.k8s.apply(ctx, cronJobManifest(cron.name, ctx.namespace, cron.schedule, image, cron.profile));
    return this.k8s.observe(ctx, "batch/v1", "CronJob", cron.name);
  }
  async destroy({ cron }: { cron: CronJob }, ctx: KubeContext): Promise<void> {
    await this.k8s.remove(ctx, "batch/v1", "CronJob", cron.name);
  }
}
