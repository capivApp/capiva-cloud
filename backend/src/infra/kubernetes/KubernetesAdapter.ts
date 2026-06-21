import {
  CoreV1Api,
  KubeConfig,
  KubernetesObjectApi,
  PatchStrategy,
  VersionApi,
  type KubernetesObject,
} from "@kubernetes/client-node";
import crypto from "crypto";
import { Injectable } from "@di/index";
import type {
  IKubernetesAdapter,
  K8sManifest,
  KubeContext,
  NodeUsage,
  ObservedStatus,
} from "@interface/integrations";

/**
 * Encapsula o acesso ao cluster via @kubernetes/client-node.
 *
 * Multi-cluster: cada operação recebe o kubeconfig (decifrado pela Service) no
 * KubeContext. Clients são cacheados por hash do kubeconfig. Se o kubeconfig
 * estiver vazio, opera em modo DRY-RUN (apenas log) — permitindo usar a
 * plataforma sem um cluster registrado.
 *
 * `apply` usa Server-Side Apply (idempotente) com fieldManager "capiva".
 */
@Injectable()
export class KubernetesAdapter implements IKubernetesAdapter {
  private readonly clients = new Map<string, KubernetesObjectApi>();
  private readonly configs = new Map<string, KubeConfig>();
  private readonly ensuredNs = new Set<string>();

  /**
   * Carrega o KubeConfig. O TLS (CA / client-cert / skip-verify) é aplicado pelo
   * shim de `node-fetch` (ver nodeFetchShim.ts), que converte o https.Agent do
   * client-node na opção `tls` do Bun.
   */
  private loadKc(kubeconfig: string): KubeConfig {
    const kc = new KubeConfig();
    kc.loadFromString(kubeconfig);
    return kc;
  }

  private resolve(kubeconfig: string): { kc: KubeConfig; api: KubernetesObjectApi } | null {
    if (!kubeconfig) return null;
    const key = crypto.createHash("sha256").update(kubeconfig).digest("hex");
    let api = this.clients.get(key);
    let kc = this.configs.get(key);
    if (!api || !kc) {
      kc = this.loadKc(kubeconfig);
      api = KubernetesObjectApi.makeApiClient(kc);
      this.clients.set(key, api);
      this.configs.set(key, kc);
    }
    return { kc, api };
  }

  async apply(ctx: KubeContext, manifest: K8sManifest): Promise<void> {
    const resolved = this.resolve(ctx.kubeconfig);
    const obj: K8sManifest = {
      ...manifest,
      metadata: {
        ...manifest.metadata,
        namespace: manifest.metadata.namespace ?? ctx.namespace,
        labels: { "app.kubernetes.io/managed-by": "capiva", ...(manifest.metadata.labels ?? {}) },
      },
    };

    if (!resolved) {
      console.log(`[k8s:dry-run] apply ${obj.kind}/${obj.metadata.name} @ ${obj.metadata.namespace}`);
      return;
    }

    // Garante que o namespace exista antes de aplicar recursos nele (idempotente).
    const ns = obj.metadata.namespace;
    if (ns && obj.kind !== "Namespace") await this.ensureNamespace(resolved.api, ctx.kubeconfig, ns);

    // Server-Side Apply: cria ou atualiza convergindo para o estado desejado.
    await resolved.api.patch(
      obj as KubernetesObject,
      undefined,
      undefined,
      "capiva",
      true,
      PatchStrategy.ServerSideApply,
    );
  }

  /** Cria o namespace se não existir (idempotente, cacheado por kubeconfig). */
  private async ensureNamespace(api: KubernetesObjectApi, kubeconfig: string, namespace: string): Promise<void> {
    const key = crypto.createHash("sha256").update(kubeconfig).digest("hex") + ":" + namespace;
    if (this.ensuredNs.has(key)) return;
    try {
      await api.patch(
        { apiVersion: "v1", kind: "Namespace", metadata: { name: namespace, labels: { "app.kubernetes.io/managed-by": "capiva" } } } as KubernetesObject,
        undefined,
        undefined,
        "capiva",
        true,
        PatchStrategy.ServerSideApply,
      );
    } catch {
      /* corrida/permite — segue */
    }
    this.ensuredNs.add(key);
  }

  async observe(ctx: KubeContext, apiVersion: string, kind: string, name: string): Promise<ObservedStatus> {
    const resolved = this.resolve(ctx.kubeconfig);
    if (!resolved) return { ready: true, replicas: 1, message: "dry-run" };

    try {
      const res = (await resolved.api.read({
        apiVersion,
        kind,
        metadata: { name, namespace: ctx.namespace },
      })) as { status?: Record<string, unknown> };
      const status = res.status ?? {};
      const ready =
        (status.readyReplicas as number) > 0 ||
        (status.availableReplicas as number) > 0 ||
        status.phase === "Running" ||
        status.phase === "Active";
      return {
        ready: Boolean(ready),
        replicas: (status.readyReplicas as number) ?? (status.availableReplicas as number) ?? 0,
        raw: status,
      };
    } catch (error) {
      return { ready: false, message: (error as Error).message };
    }
  }

  async remove(ctx: KubeContext, apiVersion: string, kind: string, name: string): Promise<void> {
    const resolved = this.resolve(ctx.kubeconfig);
    if (!resolved) {
      console.log(`[k8s:dry-run] delete ${kind}/${name} @ ${ctx.namespace}`);
      return;
    }
    await resolved.api.delete({ apiVersion, kind, metadata: { name, namespace: ctx.namespace } });
  }

  async testConnection(kubeconfig: string): Promise<{ ok: boolean; version?: string; message?: string }> {
    try {
      const kc = this.loadKc(kubeconfig);
      const version = await kc.makeApiClient(VersionApi).getCode();
      return { ok: true, version: version.gitVersion };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  }

  async getServiceIP(ctx: KubeContext, name: string): Promise<string | null> {
    if (!ctx.kubeconfig) return null;
    try {
      const kc = this.loadKc(ctx.kubeconfig);
      const core = kc.makeApiClient(CoreV1Api);
      const svc = await core.readNamespacedService({ name, namespace: ctx.namespace });
      return svc.spec?.clusterIP ?? null;
    } catch {
      return null;
    }
  }

  /** Cordon/uncordon: marca o nó como (não) agendável. */
  async setNodeSchedulable(kubeconfig: string, name: string, schedulable: boolean): Promise<void> {
    if (!kubeconfig) return;
    const kc = this.loadKc(kubeconfig);
    const core = kc.makeApiClient(CoreV1Api);
    await core.patchNode({ name, body: { spec: { unschedulable: !schedulable } } });
  }

  /** Remove o nó do cluster (após drain/cordon). */
  async deleteNode(kubeconfig: string, name: string): Promise<void> {
    if (!kubeconfig) return;
    const kc = this.loadKc(kubeconfig);
    await kc.makeApiClient(CoreV1Api).deleteNode({ name });
  }

  async listNodes(kubeconfig: string): Promise<NodeUsage[]> {
    if (!kubeconfig) return [];
    try {
      const kc = this.loadKc(kubeconfig);
      const core = kc.makeApiClient(CoreV1Api);
      const nodes = await core.listNode();
      return nodes.items.map((n) => ({
        name: n.metadata?.name ?? "node",
        ready: (n.status?.conditions ?? []).some((c) => c.type === "Ready" && c.status === "True"),
        cpuCapacity: n.status?.capacity?.cpu,
        memoryCapacity: n.status?.capacity?.memory,
      }));
    } catch {
      return [];
    }
  }
}
