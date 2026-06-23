import { Injectable } from "@di/index";
import { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import { databaseManifest, databaseExternalServiceManifest, basicAuthSecretManifest, EXTERNAL_DB } from "@infra/kubernetes/databaseManifests";
import { decrypt } from "@functions/crypto";
import type { IResourceReconciler, K8sManifest, KubeContext, ObservedStatus } from "@interface/integrations";
import type { ManagedDatabase } from "@prisma-generated/client";

function safeDecrypt(value: unknown): string {
  try {
    return typeof value === "string" ? decrypt(value) : "";
  } catch {
    return typeof value === "string" ? value : "";
  }
}

/**
 * Interpreta o status de um banco gerenciado. Operators de Postgres (CNPG)
 * reportam `readyInstances`/`instances`/`phase` — diferente de `readyReplicas`
 * de um Deployment. Centraliza a leitura de saúde para a UI não ficar "fake".
 */
export function interpretDbStatus(obs: ObservedStatus): ObservedStatus & { instances?: number; readyInstances?: number; phase?: string } {
  const raw = (obs.raw ?? {}) as Record<string, unknown>;
  const instances = (raw.instances as number) ?? (raw.readyReplicas as number) ?? undefined;
  const readyInstances = (raw.readyInstances as number) ?? (raw.availableReplicas as number) ?? (raw.readyReplicas as number) ?? undefined;
  const phase = raw.phase as string | undefined;
  const ready = (readyInstances ?? 0) > 0 || obs.ready;
  return { ...obs, ready, replicas: readyInstances ?? obs.replicas, instances, readyInstances, phase };
}

/**
 * Strategy de reconciliação de banco gerenciado. Cada `kind` mapeia para o
 * Operator battle-tested adequado (ver databaseManifests.ts), escondendo
 * StatefulSets/Patroni/InnoDB Cluster/Sentinel do usuário.
 */
@Injectable()
export class DatabaseReconciler implements IResourceReconciler<ManagedDatabase> {
  constructor(private readonly k8s: KubernetesAdapter) {}

  async reconcile(db: ManagedDatabase, ctx: KubeContext): Promise<ObservedStatus> {
    const cfg = (db.config ?? {}) as Record<string, unknown>;
    // Postgres: provisiona os Secrets de credenciais (usuário da app + superusuário
    // `postgres`) ANTES do Cluster, para o CNPG aplicar o login informado.
    if (db.kind === "POSTGRESQL") {
      const username = (cfg.username as string) || "app";
      await this.k8s.apply(ctx, basicAuthSecretManifest(`${db.name}-app`, ctx.namespace, username, safeDecrypt(cfg.passwordCipher)));
      await this.k8s.apply(ctx, basicAuthSecretManifest(`${db.name}-superuser`, ctx.namespace, "postgres", safeDecrypt(cfg.superuserPasswordCipher)));
    }
    const manifest = this.manifestFor(db, ctx);
    await this.k8s.apply(ctx, manifest);
    // Acesso externo (NodePort) para tipos suportados (ex.: Postgres).
    const ext = EXTERNAL_DB[db.kind];
    if (ext) await this.k8s.apply(ctx, databaseExternalServiceManifest(db.name, ctx.namespace, ext.selector(db.name), ext.port));
    return interpretDbStatus(await this.k8s.observe(ctx, manifest.apiVersion, manifest.kind, db.name));
  }

  async destroy(db: ManagedDatabase, ctx: KubeContext): Promise<void> {
    const manifest = this.manifestFor(db, ctx);
    await this.k8s.remove(ctx, manifest.apiVersion, manifest.kind, db.name);
    // Remove também o Service NodePort de acesso externo (`<name>-ext`), senão fica órfão.
    if (EXTERNAL_DB[db.kind]) await this.k8s.remove(ctx, "v1", "Service", `${db.name}-ext`).catch(() => undefined);
    // Secrets de credenciais (Postgres).
    if (db.kind === "POSTGRESQL") {
      await this.k8s.remove(ctx, "v1", "Secret", `${db.name}-app`).catch(() => undefined);
      await this.k8s.remove(ctx, "v1", "Secret", `${db.name}-superuser`).catch(() => undefined);
    }
  }

  private manifestFor(db: ManagedDatabase, ctx: KubeContext): K8sManifest {
    const cfg = (db.config ?? {}) as Record<string, unknown>;
    return databaseManifest(db.kind, {
      name: db.name,
      namespace: ctx.namespace,
      size: db.size,
      ha: db.highAvailability,
      username: cfg.username as string | undefined,
      database: cfg.database as string | undefined,
    });
  }
}
