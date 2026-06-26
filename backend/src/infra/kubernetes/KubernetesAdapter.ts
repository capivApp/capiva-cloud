import {
  AuthorizationV1Api,
  CoreV1Api,
  Exec,
  KubeConfig,
  KubernetesObjectApi,
  Metrics,
  PatchStrategy,
  VersionApi,
  type KubernetesObject,
  type V1Status,
} from "@kubernetes/client-node";
import crypto from "crypto";
import stream from "stream";
import { Injectable } from "@di/index";
import { cpuToMillicores, memoryToMib } from "@functions/quantity";
import type {
  ClusterPod,
  HpaLiveStatus,
  IKubernetesAdapter,
  K8sManifest,
  KubeContext,
  NodeMetricUsage,
  NodeUsage,
  ObservedStatus,
  PodMetricUsage,
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
   * Carrega o KubeConfig. Sob Bun, o TLS (CA / client-cert / skip-verify) do
   * https.Agent do client-node é convertido na opção `tls` do `fetch` nativo
   * pelo shim instalado no preload (ver nodeFetchShim.ts) — sem ele, o
   * certificado de cliente não é enviado e o API server responde 401.
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

  /**
   * Server-Side Apply. `fieldManager` isola a "intenção" de cada chamador: o
   * reconciler usa "capiva" (dono do objeto inteiro); aplicações parciais (ex.:
   * só `spec.replicas` no scale) DEVEM usar outro manager, senão o SSA poda os
   * campos que "capiva" tinha (selector/template) → Deployment inválido (422).
   */
  async apply(ctx: KubeContext, manifest: K8sManifest, fieldManager = "capiva"): Promise<void> {
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
      fieldManager,
      true,
      PatchStrategy.ServerSideApply,
    );
  }

  /**
   * Aplica um objeto k8s COMO ESTÁ (sem injetar namespace/labels). Para bundles
   * de operators que misturam recursos cluster-scoped (CRD/ClusterRole) e
   * namespaced (já com namespace próprio). Server-side apply idempotente.
   */
  async applyRaw(ctx: KubeContext, obj: KubernetesObject): Promise<void> {
    const resolved = this.resolve(ctx.kubeconfig);
    if (!resolved) {
      console.log(`[k8s:dry-run] applyRaw ${(obj as { kind?: string }).kind}/${obj.metadata?.name}`);
      return;
    }
    await resolved.api.patch(obj, undefined, undefined, "capiva", true, PatchStrategy.ServerSideApply);
  }

  /** Existe um CustomResourceDefinition com este nome? (checagem de operator instalado). */
  async crdExists(ctx: KubeContext, crdName: string): Promise<boolean> {
    const resolved = this.resolve(ctx.kubeconfig);
    if (!resolved) return false;
    try {
      await resolved.api.read({ apiVersion: "apiextensions.k8s.io/v1", kind: "CustomResourceDefinition", metadata: { name: crdName } });
      return true;
    } catch {
      return false;
    }
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
    try {
      await resolved.api.delete({ apiVersion, kind, metadata: { name, namespace: ctx.namespace } });
    } catch (error) {
      // Delete idempotente: remover algo que não existe é no-op, não erro.
      if ((error as { code?: number }).code === 404) return;
      throw error;
    }
  }

  async testConnection(kubeconfig: string): Promise<{ ok: boolean; version?: string; message?: string }> {
    try {
      const kc = this.loadKc(kubeconfig);
      const version = await kc.makeApiClient(VersionApi).getCode();
      // /version costuma responder anônimo — um token inválido passaria. O
      // SelfSubjectAccessReview exige um usuário autenticado, então credencial
      // inválida/expirada retorna 401 aqui em vez de falhar só no deploy.
      await kc.makeApiClient(AuthorizationV1Api).createSelfSubjectAccessReview({
        body: { spec: { resourceAttributes: { verb: "create", resource: "deployments", group: "apps" } } },
      });
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

  /**
   * Uso de CPU/memória por nó (capacidade vs usado) e pods agrupados por nó com
   * seu uso. Requer metrics-server (metrics.k8s.io). Usado pela Monitoring view.
   */
  async topNodes(kubeconfig: string): Promise<NodeMetricUsage[]> {
    if (!kubeconfig) return [];
    try {
      const kc = this.loadKc(kubeconfig);
      const core = kc.makeApiClient(CoreV1Api);
      const metrics = new Metrics(kc);
      const [nodeList, nodeMetrics, pods] = await Promise.all([
        core.listNode(),
        metrics.getNodeMetrics(),
        this.topPods(kubeconfig),
      ]);

      const usageByNode = new Map(nodeMetrics.items.map((m) => [m.metadata.name, m.usage]));
      const podsByNode = new Map<string, PodMetricUsage[]>();
      for (const pod of pods) {
        if (!podsByNode.has(pod.node)) podsByNode.set(pod.node, []);
        podsByNode.get(pod.node)!.push(pod);
      }

      return nodeList.items.map((n) => {
        const name = n.metadata?.name ?? "node";
        const isControlPlane =
          "node-role.kubernetes.io/control-plane" in (n.metadata?.labels ?? {}) ||
          "node-role.kubernetes.io/master" in (n.metadata?.labels ?? {});
        const usage = usageByNode.get(name);
        const conditions = n.status?.conditions ?? [];
        // Pressões de recurso e indisponibilidade têm status "True" quando há problema.
        const warnings = conditions
          .filter((c) => c.type !== "Ready" && c.status === "True")
          .map((c) => c.type ?? "")
          .filter(Boolean);
        return {
          name,
          role: isControlPlane ? ("control-plane" as const) : ("worker" as const),
          ready: conditions.some((c) => c.type === "Ready" && c.status === "True"),
          cpuCapacityM: cpuToMillicores(n.status?.capacity?.cpu),
          cpuUsedM: cpuToMillicores(usage?.cpu),
          memCapacityMib: memoryToMib(n.status?.capacity?.memory),
          memUsedMib: memoryToMib(usage?.memory),
          internalIP: (n.status?.addresses ?? []).find((a) => a.type === "InternalIP")?.address,
          kubeletVersion: n.status?.nodeInfo?.kubeletVersion,
          warnings,
          pods: (podsByNode.get(name) ?? []).sort((a, b) => b.cpuMillicores - a.cpuMillicores),
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Logs do primeiro pod que casa com o labelSelector (ex.: Job de build Kaniko).
   * Retorna o texto atual (não-follow); o SSE faz o polling. "" se não houver pod.
   */
  async podLogsByLabel(ctx: KubeContext, labelSelector: string, tailLines = 1000): Promise<string> {
    if (!ctx.kubeconfig) return "";
    try {
      const kc = this.loadKc(ctx.kubeconfig);
      const core = kc.makeApiClient(CoreV1Api);
      const pods = await core.listNamespacedPod({ namespace: ctx.namespace, labelSelector });
      const podName = pods.items[0]?.metadata?.name;
      if (!podName) return "";
      return await core.readNamespacedPodLog({ name: podName, namespace: ctx.namespace, tailLines });
    } catch {
      return "";
    }
  }

  /**
   * Ajusta as réplicas do Deployment (escala manual) via server-side apply
   * PARCIAL — usa o fieldManager dedicado "capiva-scale" para coexistir com o
   * "capiva" (dono de selector/template) sem podar esses campos.
   */
  async scaleDeployment(ctx: KubeContext, name: string, replicas: number): Promise<void> {
    await this.apply(
      ctx,
      { apiVersion: "apps/v1", kind: "Deployment", metadata: { name, namespace: ctx.namespace }, spec: { replicas } },
      "capiva-scale",
    );
  }

  /**
   * Estado vivo do HPA (observabilidade do autoscaling): réplicas atuais/desejadas,
   * min/max, métrica e valor atual vs. alvo que dispara o scale, e condições.
   */
  async getHpaStatus(ctx: KubeContext, name: string): Promise<HpaLiveStatus> {
    const resolved = this.resolve(ctx.kubeconfig);
    if (!resolved) return { exists: false };
    try {
      const hpa = (await resolved.api.read({
        apiVersion: "autoscaling/v2",
        kind: "HorizontalPodAutoscaler",
        metadata: { name, namespace: ctx.namespace },
      })) as { spec?: Record<string, any>; status?: Record<string, any> };
      const spec = hpa.spec ?? {};
      const status = hpa.status ?? {};

      const specMetric = (spec.metrics ?? [])[0] ?? {};
      const curMetric = (status.currentMetrics ?? [])[0] ?? {};
      const metricName =
        specMetric.type === "Pods" ? specMetric.pods?.metric?.name : specMetric.resource?.name ?? "cpu";
      const targetValue =
        specMetric.type === "Pods"
          ? specMetric.pods?.target?.averageValue
          : specMetric.resource?.target?.averageUtilization != null
            ? `${specMetric.resource.target.averageUtilization}%`
            : undefined;
      const currentValue =
        curMetric.type === "Pods"
          ? curMetric.pods?.current?.averageValue
          : curMetric.resource?.current?.averageUtilization != null
            ? `${curMetric.resource.current.averageUtilization}%`
            : undefined;

      return {
        exists: true,
        currentReplicas: status.currentReplicas,
        desiredReplicas: status.desiredReplicas,
        minReplicas: spec.minReplicas,
        maxReplicas: spec.maxReplicas,
        lastScaleTime: status.lastScaleTime,
        metric: metricName,
        currentMetricValue: currentValue,
        targetMetricValue: targetValue,
        conditions: (status.conditions ?? []).map((c: any) => ({ type: c.type, status: c.status, reason: c.reason, message: c.message })),
      };
    } catch {
      return { exists: false };
    }
  }

  /**
   * Saúde dos pods de uma aplicação: total, prontos e os motivos de quem não
   * subiu (ImagePullBackOff, CrashLoopBackOff, Pending/unschedulable...). Dá
   * visibilidade do "porquê" quando o Deployment não fica ready.
   */
  async podHealth(ctx: KubeContext, appName: string): Promise<{ total: number; ready: number; issues: string[] }> {
    const resolved = this.resolve(ctx.kubeconfig);
    if (!resolved) return { total: 0, ready: 0, issues: [] };
    const core = resolved.kc.makeApiClient(CoreV1Api);
    const pods = await core.listNamespacedPod({ namespace: ctx.namespace, labelSelector: `app.kubernetes.io/name=${appName}` });
    let ready = 0;
    const issues: string[] = [];
    for (const p of pods.items) {
      const name = p.metadata?.name ?? "pod";
      if ((p.status?.conditions ?? []).some((c) => c.type === "Ready" && c.status === "True")) {
        ready++;
        continue;
      }
      const states = p.status?.containerStatuses ?? [];
      for (const cs of states) {
        const w = cs.state?.waiting;
        if (w?.reason) issues.push(`${name}: ${w.reason}${w.message ? ` — ${w.message}` : ""}`);
        const t = cs.state?.terminated;
        if (t?.reason && t.reason !== "Completed") issues.push(`${name}: ${t.reason}${t.message ? ` — ${t.message}` : ""}`);
      }
      // Sem containerStatuses → pod pendente (ex.: unschedulable): usa a condição negativa.
      if (states.length === 0) {
        const cond = (p.status?.conditions ?? []).find((c) => c.status === "False" && c.reason);
        issues.push(`${name}: ${cond?.reason ?? p.status?.phase ?? "Pending"}${cond?.message ? ` — ${cond.message}` : ""}`);
      }
    }
    return { total: pods.items.length, ready, issues: [...new Set(issues)] };
  }

  /** IP de um nó do cluster (preferindo ExternalIP) — base da URL de acesso externo. */
  async nodeIP(kubeconfig: string): Promise<string | null> {
    if (!kubeconfig) return null;
    try {
      const core = this.loadKc(kubeconfig).makeApiClient(CoreV1Api);
      const nodes = await core.listNode();
      const addresses = nodes.items.flatMap((n) => n.status?.addresses ?? []);
      return (
        addresses.find((a) => a.type === "ExternalIP")?.address ??
        addresses.find((a) => a.type === "InternalIP")?.address ??
        null
      );
    } catch {
      return null;
    }
  }

  /** nodePort atribuído a um Service NodePort (null se não existir/não for NodePort). */
  async serviceNodePort(ctx: KubeContext, name: string): Promise<number | null> {
    if (!ctx.kubeconfig) return null;
    try {
      const core = this.loadKc(ctx.kubeconfig).makeApiClient(CoreV1Api);
      const svc = await core.readNamespacedService({ name, namespace: ctx.namespace });
      return svc.spec?.ports?.[0]?.nodePort ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Primeiro pod (preferindo Running) de uma aplicação, pelo selector padrão
   * `app.kubernetes.io/name=<nome>`. Usado pelo terminal web (exec).
   */
  async firstRunningPod(kubeconfig: string, namespace: string, appName: string): Promise<{ pod: string; container: string } | null> {
    if (!kubeconfig) return null;
    const kc = this.loadKc(kubeconfig);
    const core = kc.makeApiClient(CoreV1Api);
    const pods = await core.listNamespacedPod({ namespace, labelSelector: `app.kubernetes.io/name=${appName}` });
    const chosen = pods.items.find((p) => p.status?.phase === "Running") ?? pods.items[0];
    const podName = chosen?.metadata?.name;
    if (!podName) return null;
    return { pod: podName, container: chosen?.spec?.containers?.[0]?.name ?? appName };
  }

  /**
   * Abre um shell interativo (TTY) num container via exec do client-node (WS para
   * o API server). Retorna handles para escrever stdin, redimensionar e fechar —
   * a camada de transporte (gateway) liga isso ao WebSocket do browser.
   */
  async execShell(opts: {
    kubeconfig: string;
    namespace: string;
    pod: string;
    container: string;
    command?: string[];
    onData: (chunk: Buffer) => void;
    onClose: (status?: V1Status) => void;
  }): Promise<{ write: (data: string) => void; resize: (cols: number, rows: number) => void; close: () => void }> {
    const kc = this.loadKc(opts.kubeconfig);
    const exec = new Exec(kc);
    const stdin = new stream.PassThrough();
    const sink = new stream.Writable({
      write(chunk, _enc, cb) {
        opts.onData(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        cb();
      },
    });

    const command = opts.command ?? ["/bin/sh", "-c", "exec /bin/bash 2>/dev/null || exec /bin/sh"];
    const ws = await exec.exec(opts.namespace, opts.pod, opts.container, command, sink, sink, stdin, true, (status) => opts.onClose(status));
    ws.on("close", () => opts.onClose());
    ws.on("error", () => opts.onClose());

    return {
      write: (data) => stdin.write(data),
      // Canal 4 do protocolo de exec do k8s = resize ({Width,Height}).
      resize: (cols, rows) => {
        try {
          ws.send(Buffer.concat([Buffer.from([4]), Buffer.from(JSON.stringify({ Width: cols, Height: rows }))]));
        } catch {
          /* ws ainda não pronto/fechado */
        }
      },
      close: () => {
        try {
          stdin.end();
          ws.close();
        } catch {
          /* já fechado */
        }
      },
    };
  }

  /**
   * Todos os pods do cluster (todos os namespaces) com nó, fase, reinícios e as
   * portas declaradas pelos containers. Base das telas "todos os pods" e, por
   * label, "todos os bancos". Não depende do metrics-server.
   */
  async listClusterPods(kubeconfig: string): Promise<ClusterPod[]> {
    if (!kubeconfig) return [];
    try {
      const core = this.loadKc(kubeconfig).makeApiClient(CoreV1Api);
      const pods = await core.listPodForAllNamespaces();
      return pods.items.map((p) => {
        const statuses = p.status?.containerStatuses ?? [];
        const ports = (p.spec?.containers ?? []).flatMap((c) =>
          (c.ports ?? []).map((port) => ({ name: port.name, containerPort: port.containerPort, protocol: port.protocol ?? "TCP" })),
        );
        return {
          name: p.metadata?.name ?? "pod",
          namespace: p.metadata?.namespace ?? "default",
          node: p.spec?.nodeName ?? "",
          phase: p.status?.phase ?? "Unknown",
          ready: (p.status?.conditions ?? []).some((c) => c.type === "Ready" && c.status === "True"),
          restarts: statuses.reduce((sum, s) => sum + (s.restartCount ?? 0), 0),
          podIP: p.status?.podIP ?? null,
          ports,
          labels: p.metadata?.labels ?? {},
        };
      });
    } catch {
      return [];
    }
  }

  /** Uso de CPU/memória por pod (somando containers), com o nó onde roda. */
  async topPods(kubeconfig: string, namespace?: string): Promise<PodMetricUsage[]> {
    if (!kubeconfig) return [];
    try {
      const kc = this.loadKc(kubeconfig);
      const core = kc.makeApiClient(CoreV1Api);
      const metrics = new Metrics(kc);
      const [podMetrics, podList] = await Promise.all([
        metrics.getPodMetrics(namespace),
        namespace ? core.listNamespacedPod({ namespace }) : core.listPodForAllNamespaces(),
      ]);
      const nodeByPod = new Map(podList.items.map((p) => [`${p.metadata?.namespace}/${p.metadata?.name}`, p.spec?.nodeName ?? ""]));

      return podMetrics.items.map((m) => {
        const cpuMillicores = m.containers.reduce((sum, c) => sum + cpuToMillicores(c.usage.cpu), 0);
        const memoryMib = m.containers.reduce((sum, c) => sum + memoryToMib(c.usage.memory), 0);
        return {
          name: m.metadata.name,
          namespace: m.metadata.namespace,
          node: nodeByPod.get(`${m.metadata.namespace}/${m.metadata.name}`) ?? "",
          cpuMillicores,
          memoryMib,
        };
      });
    } catch {
      return [];
    }
  }
}
