/**
 * NetworkPolicy padrão por namespace de ambiente: deny-all de ingress, liberações
 * (mesmo namespace, ingress controller, monitoramento, operators, dependências entre
 * namespaces), egress aberto com DNS garantido e o plano aplicar/remover pelo
 * `networkIsolation` do ambiente. Funções puras, sem cluster.
 */
import { describe, expect, it } from "bun:test";
import {
  allowEgressManifest,
  allowPlatformManifest,
  allowSameNamespaceManifest,
  buildTenantNetworkPolicies,
  databaseExternalNetworkPolicyManifest,
  defaultDenyIngressManifest,
  dependencyNetworkPolicyManifest,
  planTenantNetworkPolicies,
  resolveNetworkPolicyPlatform,
  type NetworkPolicyPlatform,
} from "@infra/kubernetes/networkPolicyManifests";
import type { K8sManifest } from "@interface/integrations";

const PLATFORM: NetworkPolicyPlatform = {
  ingressNamespaces: ["kube-system"],
  monitoringNamespaces: ["monitoring"],
  operatorNamespaces: ["cnpg-system"],
};

const spec = (m: K8sManifest) => m.spec as Record<string, any>;
const namesOf = (ms: K8sManifest[]) => ms.map((m) => m.metadata.name);
const namespaceMatch = (ns: string) => ({
  namespaceSelector: { matchLabels: { "kubernetes.io/metadata.name": ns } },
});

describe("defaultDenyIngressManifest", () => {
  it("seleciona todos os pods e não libera nenhum ingress", () => {
    const m = defaultDenyIngressManifest("capiva-prod-abc123");
    expect(m.kind).toBe("NetworkPolicy");
    expect(m.apiVersion).toBe("networking.k8s.io/v1");
    expect(m.metadata.namespace).toBe("capiva-prod-abc123");
    expect(spec(m).podSelector).toEqual({});
    expect(spec(m).policyTypes).toEqual(["Ingress"]);
    expect(spec(m).ingress).toBeUndefined();
  });
});

describe("allowSameNamespaceManifest", () => {
  it("libera o tráfego vindo de qualquer pod do mesmo namespace", () => {
    const m = allowSameNamespaceManifest("ns");
    expect(spec(m).podSelector).toEqual({});
    expect(spec(m).ingress).toEqual([{ from: [{ podSelector: {} }] }]);
  });
});

describe("allowPlatformManifest", () => {
  it("libera ingress controller, monitoramento e operators por namespace", () => {
    const m = allowPlatformManifest("ns", PLATFORM);
    expect(spec(m).ingress).toEqual([
      {
        from: [
          namespaceMatch("kube-system"),
          namespaceMatch("monitoring"),
          namespaceMatch("cnpg-system"),
        ],
      },
    ]);
  });

  it("sem namespace de plataforma não gera regra (from vazio liberaria qualquer origem)", () => {
    const m = allowPlatformManifest("ns", {
      ingressNamespaces: [],
      monitoringNamespaces: [],
      operatorNamespaces: [],
    });
    expect(spec(m).ingress).toEqual([]);
  });

  it("não repete namespace citado em mais de uma categoria", () => {
    const m = allowPlatformManifest("ns", { ...PLATFORM, monitoringNamespaces: ["kube-system"] });
    expect(spec(m).ingress[0].from).toHaveLength(2);
  });
});

describe("allowEgressManifest", () => {
  it("garante DNS para o kube-dns e mantém o resto do egress aberto", () => {
    const m = allowEgressManifest("ns");
    expect(spec(m).policyTypes).toEqual(["Egress"]);
    const [dns, rest] = spec(m).egress;
    expect(dns.to).toEqual([
      { ...namespaceMatch("kube-system"), podSelector: { matchLabels: { "k8s-app": "kube-dns" } } },
    ]);
    expect(dns.ports).toEqual([
      { protocol: "UDP", port: 53 },
      { protocol: "TCP", port: 53 },
    ]);
    expect(rest).toEqual({});
  });
});

describe("dependencyNetworkPolicyManifest", () => {
  it("libera só o pod de origem no namespace de origem (AND de namespace e pod)", () => {
    const m = dependencyNetworkPolicyManifest("ns-a", "api", [
      { source: "web", sourceNamespace: "ns-b" },
    ]);
    expect(m.metadata.name).toBe("capiva-deps-api");
    expect(spec(m).podSelector).toEqual({ matchLabels: { "app.kubernetes.io/name": "api" } });
    expect(spec(m).ingress).toEqual([
      {
        from: [
          {
            ...namespaceMatch("ns-b"),
            podSelector: { matchLabels: { "app.kubernetes.io/name": "web" } },
          },
        ],
      },
    ]);
  });

  it("sem origens externas fica sem regras (não libera nada além do padrão)", () => {
    const m = dependencyNetworkPolicyManifest("ns-a", "api", []);
    expect(spec(m).ingress).toEqual([]);
  });
});

describe("buildTenantNetworkPolicies", () => {
  it("gera o conjunto padrão e uma policy de dependências por aplicação", () => {
    const ms = buildTenantNetworkPolicies({
      namespace: "ns-a",
      apps: ["api", "web"],
      peers: [],
      platform: PLATFORM,
    });
    expect(namesOf(ms)).toEqual([
      "capiva-default-deny-ingress",
      "capiva-allow-same-namespace",
      "capiva-allow-platform",
      "capiva-allow-egress",
      "capiva-deps-api",
      "capiva-deps-web",
    ]);
  });

  it("ignora dependência do mesmo namespace (já liberada) e agrupa as externas pelo destino", () => {
    const ms = buildTenantNetworkPolicies({
      namespace: "ns-a",
      apps: ["api"],
      peers: [
        { target: "api", source: "worker", sourceNamespace: "ns-a" },
        { target: "api", source: "web", sourceNamespace: "ns-b" },
      ],
      platform: PLATFORM,
    });
    const deps = ms.find((m) => m.metadata.name === "capiva-deps-api")!;
    expect(spec(deps).ingress).toHaveLength(1);
    expect(
      spec(deps).ingress[0].from[0].namespaceSelector.matchLabels["kubernetes.io/metadata.name"],
    ).toBe("ns-b");
  });

  it("marca todas as policies como geridas pela plataforma", () => {
    const ms = buildTenantNetworkPolicies({
      namespace: "ns-a",
      apps: [],
      peers: [],
      platform: PLATFORM,
    });
    for (const m of ms) expect(m.metadata.labels?.["capiva.io/network-policy"]).toBe("tenant");
  });
});

describe("planTenantNetworkPolicies", () => {
  const input = { namespace: "ns-a", apps: ["api"], peers: [], platform: PLATFORM };

  it("com isolamento ligado aplica tudo e não remove nada", () => {
    const plan = planTenantNetworkPolicies({ ...input, enabled: true });
    expect(plan.apply).toHaveLength(5);
    expect(plan.remove).toEqual([]);
  });

  it("com isolamento desligado remove as mesmas policies e não aplica nada", () => {
    const plan = planTenantNetworkPolicies({ ...input, enabled: false });
    expect(plan.apply).toEqual([]);
    expect(namesOf(plan.remove)).toEqual(namesOf(buildTenantNetworkPolicies(input)));
  });
});

describe("resolveNetworkPolicyPlatform", () => {
  it("usa Traefik no kube-system, monitoring e os operators de banco por padrão", () => {
    const p = resolveNetworkPolicyPlatform({});
    expect(p.ingressNamespaces).toEqual(["kube-system"]);
    expect(p.monitoringNamespaces).toEqual(["monitoring"]);
    expect(p.operatorNamespaces).toContain("cnpg-system");
  });

  it("aceita sobrescrever por variável de ambiente (lista separada por vírgula)", () => {
    const p = resolveNetworkPolicyPlatform({
      CAPIVA_INGRESS_NAMESPACE: "traefik",
      CAPIVA_MONITORING_NAMESPACES: "prom, loki",
      CAPIVA_OPERATOR_NAMESPACES: "",
    });
    expect(p.ingressNamespaces).toEqual(["traefik"]);
    expect(p.monitoringNamespaces).toEqual(["prom", "loki"]);
    expect(p.operatorNamespaces).toEqual([]);
  });
});

describe("databaseExternalNetworkPolicyManifest", () => {
  it("libera o acesso externo (NodePort) só na porta do banco e só nos pods dele", () => {
    const m = databaseExternalNetworkPolicyManifest("pg", "ns", { "cnpg.io/cluster": "pg" }, 5432);
    expect(m.metadata.name).toBe("pg-ext");
    expect(spec(m).podSelector).toEqual({ matchLabels: { "cnpg.io/cluster": "pg" } });
    expect(spec(m).ingress).toEqual([
      { from: [{ ipBlock: { cidr: "0.0.0.0/0" } }], ports: [{ protocol: "TCP", port: 5432 }] },
    ]);
  });
});
