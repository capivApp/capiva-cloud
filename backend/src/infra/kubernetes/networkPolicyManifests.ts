import type { K8sManifest } from "@interface/integrations";

/**
 * NetworkPolicy padrão de um namespace de ambiente. O namespace nasce com
 * deny-all de ingress e só recebe tráfego do próprio namespace, do ingress
 * controller, do monitoramento, dos operators de banco e das dependências
 * declaradas que vêm de OUTRO namespace. Egress fica aberto, com DNS garantido
 * numa regra própria (se alguém fechar o egress depois, a resolução de nomes
 * continua de pé). NetworkPolicies são aditivas: cada policy abaixo só libera.
 */
export interface NetworkPolicyPlatform {
  ingressNamespaces: string[];
  monitoringNamespaces: string[];
  operatorNamespaces: string[];
}

/** Aplicação de outro namespace que depende de `target` (ServiceDependency). */
export interface CrossNamespacePeer {
  target: string;
  source: string;
  sourceNamespace: string;
}

export interface TenantNetworkPolicyInput {
  namespace: string;
  apps: string[];
  peers: CrossNamespacePeer[];
  platform: NetworkPolicyPlatform;
}

export interface TenantNetworkPolicyPlan {
  apply: K8sManifest[];
  remove: K8sManifest[];
}

const NETWORK_POLICY_LABELS = {
  "app.kubernetes.io/part-of": "capiva",
  "capiva.io/network-policy": "tenant",
};

/** Operators que conversam com os pods dos bancos (status, failover). */
const DEFAULT_OPERATOR_NAMESPACES = "cnpg-system,mysql-operator,rabbitmq-system,elastic-system";

const ALL_PODS = {};

const appSelector = (name: string) => ({ matchLabels: { "app.kubernetes.io/name": name } });
const namespaceSelector = (namespace: string) => ({
  namespaceSelector: { matchLabels: { "kubernetes.io/metadata.name": namespace } },
});

const networkPolicy = (
  name: string,
  namespace: string,
  spec: Record<string, unknown>,
): K8sManifest => ({
  apiVersion: "networking.k8s.io/v1",
  kind: "NetworkPolicy",
  metadata: { name, namespace, labels: NETWORK_POLICY_LABELS },
  spec,
});

const parseList = (raw: string): string[] =>
  raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export function defaultDenyIngressManifest(namespace: string): K8sManifest {
  return networkPolicy("capiva-default-deny-ingress", namespace, {
    podSelector: ALL_PODS,
    policyTypes: ["Ingress"],
  });
}

export function allowSameNamespaceManifest(namespace: string): K8sManifest {
  return networkPolicy("capiva-allow-same-namespace", namespace, {
    podSelector: ALL_PODS,
    policyTypes: ["Ingress"],
    ingress: [{ from: [{ podSelector: ALL_PODS }] }],
  });
}

export function allowPlatformManifest(
  namespace: string,
  platform: NetworkPolicyPlatform,
): K8sManifest {
  const namespaces = [
    ...new Set([
      ...platform.ingressNamespaces,
      ...platform.monitoringNamespaces,
      ...platform.operatorNamespaces,
    ]),
  ];
  // `from: []` numa regra libera QUALQUER origem: sem namespace, nenhuma regra.
  const rules = namespaces.length ? [{ from: namespaces.map(namespaceSelector) }] : [];
  return networkPolicy("capiva-allow-platform", namespace, {
    podSelector: ALL_PODS,
    policyTypes: ["Ingress"],
    ingress: rules,
  });
}

export function allowEgressManifest(namespace: string): K8sManifest {
  const dns = {
    to: [
      {
        ...namespaceSelector("kube-system"),
        podSelector: { matchLabels: { "k8s-app": "kube-dns" } },
      },
    ],
    ports: [
      { protocol: "UDP", port: 53 },
      { protocol: "TCP", port: 53 },
    ],
  };
  return networkPolicy("capiva-allow-egress", namespace, {
    podSelector: ALL_PODS,
    policyTypes: ["Egress"],
    egress: [dns, {}],
  });
}

/**
 * Uma policy por aplicação, mesmo sem origem externa: o nome é fixo, então
 * remover a última dependência sobrescreve a policy com zero regras em vez de
 * deixar uma liberação órfã no cluster.
 */
export function dependencyNetworkPolicyManifest(
  namespace: string,
  target: string,
  peers: Pick<CrossNamespacePeer, "source" | "sourceNamespace">[],
): K8sManifest {
  return networkPolicy(`capiva-deps-${target}`, namespace, {
    podSelector: appSelector(target),
    policyTypes: ["Ingress"],
    ingress: peers.map((peer) => ({
      from: [{ ...namespaceSelector(peer.sourceNamespace), podSelector: appSelector(peer.source) }],
    })),
  });
}

export function buildTenantNetworkPolicies(input: TenantNetworkPolicyInput): K8sManifest[] {
  const { namespace, apps, platform } = input;
  const externalPeers = input.peers.filter((peer) => peer.sourceNamespace !== namespace);
  const peersOf = (app: string) => externalPeers.filter((peer) => peer.target === app);
  return [
    defaultDenyIngressManifest(namespace),
    allowSameNamespaceManifest(namespace),
    allowPlatformManifest(namespace, platform),
    allowEgressManifest(namespace),
    ...apps.map((app) => dependencyNetworkPolicyManifest(namespace, app, peersOf(app))),
  ];
}

const PLAN_BY_ISOLATION: Record<
  "true" | "false",
  (manifests: K8sManifest[]) => TenantNetworkPolicyPlan
> = {
  true: (manifests) => ({ apply: manifests, remove: [] }),
  false: (manifests) => ({ apply: [], remove: manifests }),
};

/** Isolamento desligado remove o conjunto inteiro: nomes fixos, nada fica para trás. */
export function planTenantNetworkPolicies(
  input: TenantNetworkPolicyInput & { enabled: boolean },
): TenantNetworkPolicyPlan {
  return PLAN_BY_ISOLATION[`${input.enabled}`](buildTenantNetworkPolicies(input));
}

/** Namespaces da plataforma no cluster. Traefik do k3s roda no kube-system. */
export function resolveNetworkPolicyPlatform(
  env: Record<string, string | undefined> = process.env,
): NetworkPolicyPlatform {
  return {
    ingressNamespaces: parseList(env.CAPIVA_INGRESS_NAMESPACE || "kube-system"),
    monitoringNamespaces: parseList(env.CAPIVA_MONITORING_NAMESPACES ?? "monitoring"),
    operatorNamespaces: parseList(env.CAPIVA_OPERATOR_NAMESPACES ?? DEFAULT_OPERATOR_NAMESPACES),
  };
}

/**
 * Acesso externo ao banco (Service NodePort `<db>-ext`). Sem esta liberação o
 * deny-all do namespace derruba a conexão vinda de fora do cluster.
 */
export function databaseExternalNetworkPolicyManifest(
  name: string,
  namespace: string,
  selector: Record<string, string>,
  port: number,
): K8sManifest {
  return networkPolicy(`${name}-ext`, namespace, {
    podSelector: { matchLabels: selector },
    policyTypes: ["Ingress"],
    ingress: [{ from: [{ ipBlock: { cidr: "0.0.0.0/0" } }], ports: [{ protocol: "TCP", port }] }],
  });
}
