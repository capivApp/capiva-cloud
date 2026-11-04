/**
 * NetworkPolicyService: tradução das linhas do banco (ambiente, apps e
 * dependências que chegam nele) para a entrada das funções de manifest. Sem banco.
 */
import { describe, expect, it } from "bun:test";
import { buildNetworkPolicyInput } from "@service/NetworkPolicyService";
import type { NetworkPolicyPlatform } from "@infra/kubernetes/networkPolicyManifests";

const PLATFORM: NetworkPolicyPlatform = { ingressNamespaces: ["kube-system"], monitoringNamespaces: [], operatorNamespaces: [] };

describe("buildNetworkPolicyInput", () => {
  it("usa namespace e isolamento do ambiente e lista as apps dele", () => {
    const input = buildNetworkPolicyInput({
      environment: { namespace: "ns-a", networkIsolation: false },
      apps: [{ name: "api" }, { name: "web" }],
      dependencies: [],
      platform: PLATFORM,
    });
    expect(input.namespace).toBe("ns-a");
    expect(input.enabled).toBe(false);
    expect(input.apps).toEqual(["api", "web"]);
    expect(input.platform).toBe(PLATFORM);
  });

  it("vira cada dependência em origem com o namespace do ambiente da origem", () => {
    const input = buildNetworkPolicyInput({
      environment: { namespace: "ns-a", networkIsolation: true },
      apps: [{ name: "api" }],
      dependencies: [{ source: { name: "web", environment: { namespace: "ns-b" } }, target: { name: "api" } }],
      platform: PLATFORM,
    });
    expect(input.peers).toEqual([{ target: "api", source: "web", sourceNamespace: "ns-b" }]);
  });
});
