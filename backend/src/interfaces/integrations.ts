/**
 * Contratos (DIP) das integrações externas. Services dependem destas
 * abstrações; implementações concretas (Kubernetes, Git, Build, S3) são
 * resolvidas via Factory/Strategy — permitindo mocks e troca de provider.
 */

// --------- Kubernetes ---------
/** Alvo de uma operação no cluster. kubeconfig vazio = modo dry-run (sem cluster). */
export interface KubeContext {
  kubeconfig: string;
  namespace: string;
  clusterName?: string;
}

export interface K8sManifest {
  apiVersion: string;
  kind: string;
  metadata: { name: string; namespace?: string; labels?: Record<string, string>; [k: string]: unknown };
  [k: string]: unknown;
}

export interface ObservedStatus {
  ready: boolean;
  replicas?: number;
  message?: string;
  raw?: Record<string, unknown>;
}

export interface IKubernetesAdapter {
  /** Aplica (server-side apply, idempotente) o estado desejado. */
  apply(ctx: KubeContext, manifest: K8sManifest): Promise<void>;
  /** Lê o estado observado de um recurso. */
  observe(ctx: KubeContext, apiVersion: string, kind: string, name: string): Promise<ObservedStatus>;
  /** Remove um recurso. */
  remove(ctx: KubeContext, apiVersion: string, kind: string, name: string): Promise<void>;
  /** Testa conectividade com um cluster (kubeconfig YAML decifrado). */
  testConnection(kubeconfig: string): Promise<{ ok: boolean; version?: string; message?: string }>;
  /** ClusterIP de um Service (para variáveis no formato IP). null se indisponível. */
  getServiceIP(ctx: KubeContext, name: string): Promise<string | null>;
  /** Capacidade/uso de recursos dos nós do cluster (para a Fleet view). */
  listNodes(kubeconfig: string): Promise<NodeUsage[]>;
  /** Todos os pods do cluster com nó, fase e portas (visão cluster-wide). */
  listClusterPods(kubeconfig: string): Promise<ClusterPod[]>;
}

/** Porta exposta por um container de um pod. */
export interface PodPort {
  name?: string;
  containerPort: number;
  protocol: string;
}

/**
 * Pod visto na escala do cluster (todos os namespaces): onde roda, fase, portas
 * e labels — base das telas "todos os pods" e "todos os bancos".
 */
export interface ClusterPod {
  name: string;
  namespace: string;
  node: string;
  phase: string;
  ready: boolean;
  restarts: number;
  podIP: string | null;
  ports: PodPort[];
  labels: Record<string, string>;
}

export interface NodeUsage {
  name: string;
  ready: boolean;
  cpuCapacity?: string;
  memoryCapacity?: string;
  cpuUsage?: string;
  memoryUsage?: string;
}

// --------- Monitoring (metrics.k8s.io) ---------
export interface PodMetricUsage {
  name: string;
  namespace: string;
  node: string;
  cpuMillicores: number;
  memoryMib: number;
}

export interface NodeMetricUsage {
  name: string;
  role: "control-plane" | "worker";
  ready: boolean;
  cpuCapacityM: number;
  cpuUsedM: number;
  memCapacityMib: number;
  memUsedMib: number;
  pods: PodMetricUsage[];
  /** Saúde individual do nó: versão do kubelet, IP e condições problemáticas. */
  internalIP?: string;
  kubeletVersion?: string;
  /** Condições negativas ativas (DiskPressure/MemoryPressure/PIDPressure/NetworkUnavailable). */
  warnings: string[];
}

/** Estado vivo do HorizontalPodAutoscaler (observabilidade do autoscaling). */
export interface HpaLiveStatus {
  exists: boolean;
  currentReplicas?: number;
  desiredReplicas?: number;
  minReplicas?: number;
  maxReplicas?: number;
  lastScaleTime?: string;
  metric?: string;
  /** Valor atual da métrica (ex.: "42%" ou "12" req/s). */
  currentMetricValue?: string;
  /** Alvo configurado (ex.: "70%" ou "100"). */
  targetMetricValue?: string;
  conditions?: { type: string; status: string; reason?: string; message?: string }[];
}

// --------- Reconciler (Strategy por tipo de recurso) ---------
export interface IResourceReconciler<TEntity = unknown> {
  reconcile(entity: TEntity, ctx: KubeContext): Promise<ObservedStatus>;
  destroy(entity: TEntity, ctx: KubeContext): Promise<void>;
}

// --------- Git providers (Strategy) ---------
export interface GitRepo {
  id: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
  /** URL HTTP(S) de clone — vira sourceConfig.repoUrl no build. */
  cloneUrl: string;
}

export interface StackDetection {
  dockerfiles: string[];
  signals: string[];
}

export interface IGitProvider {
  listRepos(): Promise<GitRepo[]>;
  listBranches(repo: string): Promise<string[]>;
  detectStack(repo: string, branch: string): Promise<StackDetection>;
  verifyWebhook(signature: string | undefined, rawBody: Buffer | string): boolean;
}

// --------- Build (Strategy) ---------
export interface BuildRequest {
  source: string;
  config: Record<string, unknown>;
  imageRef: string;
  ctx: KubeContext;
  /** Nome da app e id do deploy → labels do Job (lookup dos logs de build). */
  app?: string;
  deploymentId?: string;
  /** Credenciais para clonar repositório privado (Git → Kaniko). */
  gitAuth?: { username: string; password: string };
  /** Registry de destino do push. `insecure` = HTTP/sem TLS; sem `credentials` = registry aberto. */
  push?: {
    insecure: boolean;
    credentials?: { url: string; username: string; password: string };
  };
}

export interface IBuildStrategy {
  supports(source: string): boolean;
  build(req: BuildRequest): Promise<{ imageRef: string; manifest?: K8sManifest }>;
}

// --------- Storage (S3) ---------
export interface IStorageAdapter {
  put(key: string, body: Buffer | string): Promise<void>;
  getUrl(key: string): string;
}
