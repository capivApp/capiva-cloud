import { Injectable } from "@di/index";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import { databaseManifest } from "@infra/kubernetes/databaseManifests";
import type { IResourceReconciler, K8sManifest, KubeContext, ObservedStatus } from "@interface/integrations";
import type { ManagedDatabase } from "@prisma-generated/client";

/**
 * Strategy de reconciliação de banco gerenciado. Cada `kind` mapeia para o
 * Operator battle-tested adequado (ver databaseManifests.ts), escondendo
 * StatefulSets/Patroni/InnoDB Cluster/Sentinel do usuário.
 */
@Injectable()
export class DatabaseReconciler implements IResourceReconciler<ManagedDatabase> {
  constructor(private readonly k8s: KubernetesAdapter) {}

  async reconcile(db: ManagedDatabase, ctx: KubeContext): Promise<ObservedStatus> {
    const manifest = this.manifestFor(db, ctx);
    await this.k8s.apply(ctx, manifest);
    return this.k8s.observe(ctx, manifest.apiVersion, manifest.kind, db.name);
  }

  async destroy(db: ManagedDatabase, ctx: KubeContext): Promise<void> {
    const manifest = this.manifestFor(db, ctx);
    await this.k8s.remove(ctx, manifest.apiVersion, manifest.kind, db.name);
  }

  private manifestFor(db: ManagedDatabase, ctx: KubeContext): K8sManifest {
    return databaseManifest(db.kind, { name: db.name, namespace: ctx.namespace, size: db.size, ha: db.highAvailability });
  }
}
