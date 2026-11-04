/**
 * Strategies de build por origem, o resolver (Factory) e o executor de Jobs: secrets
 * efêmeros, fallback de protocolo de clone e limpeza. KubernetesAdapter falso, sem cluster.
 */
import { describe, expect, it } from "bun:test";
import { BuildJobRunner } from "@infra/build/BuildJobRunner";
import {
  BuildConfigError,
  BuildStrategyResolver,
  BuildpacksBuildStrategy,
  DockerComposeBuildStrategy,
  DockerfileBuildStrategy,
  DockerImageBuildStrategy,
  NixpacksBuildStrategy,
  RailpackBuildStrategy,
  StaticBuildStrategy,
} from "@infra/build/strategies";
import type { KubernetesAdapter } from "@infra/kubernetes/KubernetesAdapter";
import type { BuildRequest, K8sManifest } from "@interface/integrations";

type JobOutcome = "succeeded" | "failed";

/** KubernetesAdapter falso: grava o que foi aplicado/removido e responde o status dos Jobs em ordem. */
const makeK8s = (outcomes: JobOutcome[] = ["succeeded"], logs = "") => {
  const applied: K8sManifest[] = [];
  const removed: string[] = [];
  const logRequests: { selector: string; container?: string }[] = [];
  const queue = [...outcomes];
  const fake = {
    apply: async (_ctx: unknown, manifest: K8sManifest) => {
      applied.push(manifest);
    },
    observe: async () => ({ ready: false, raw: { [queue.shift() ?? "succeeded"]: 1 } }),
    remove: async (_ctx: unknown, _api: string, kind: string, name: string) => {
      removed.push(`${kind}/${name}`);
    },
    podLogsByLabel: async (_ctx: unknown, selector: string, _tail?: number, container?: string) => {
      logRequests.push({ selector, container });
      return logs;
    },
  };
  return { k8s: fake as unknown as KubernetesAdapter, applied, removed, logRequests };
};

const baseRequest: BuildRequest = {
  source: "NIXPACKS",
  config: { repoUrl: "https://github.com/acme/api.git", branch: "main" },
  imageRef: "registry.local/api:1.0.0",
  ctx: { kubeconfig: "k", namespace: "prod" },
  deploymentId: "dep_1",
  push: { insecure: false },
};

const jobs = (applied: K8sManifest[]) => applied.filter((m) => m.kind === "Job");
const firstContainer = (job: K8sManifest | undefined) =>
  (job as unknown as { spec: { template: { spec: { initContainers?: { name: string; env?: { name: string; value: string }[] }[] } } } }).spec.template.spec;

describe("BuildStrategyResolver", () => {
  const resolver = new BuildStrategyResolver(new BuildJobRunner(makeK8s().k8s));

  it.each([
    ["DOCKER_IMAGE", DockerImageBuildStrategy],
    ["GITHUB", DockerfileBuildStrategy],
    ["GITLAB", DockerfileBuildStrategy],
    ["GITEA", DockerfileBuildStrategy],
    ["NIXPACKS", NixpacksBuildStrategy],
    ["RAILPACK", RailpackBuildStrategy],
    ["BUILDPACKS", BuildpacksBuildStrategy],
    ["STATIC", StaticBuildStrategy],
    ["DOCKER_COMPOSE", DockerComposeBuildStrategy],
  ])("resolve %s para a strategy própria", (source, strategy) => {
    expect(resolver.resolve(source)).toBeInstanceOf(strategy);
  });

  it("recusa origem desconhecida", () => {
    expect(() => resolver.resolve("SVN")).toThrow("SVN");
  });
});

describe("DockerImageBuildStrategy", () => {
  it("não constrói nada e devolve a imagem informada", async () => {
    const built = await new DockerImageBuildStrategy().build({ ...baseRequest, source: "DOCKER_IMAGE", config: { image: "nginx:1.27" } });
    expect(built.imageRef).toBe("nginx:1.27");
  });
});

describe("BuildJobRunner via strategies", () => {
  it("cada origem aplica o Job da sua estratégia", async () => {
    const { k8s, applied } = makeK8s();
    await new NixpacksBuildStrategy(new BuildJobRunner(k8s)).build(baseRequest);
    expect(firstContainer(jobs(applied)[0]).initContainers?.map((c) => c.name)).toEqual(["clone", "nixpacks"]);
  });

  it("repositório sem URL falha antes de criar qualquer recurso", async () => {
    const { k8s, applied } = makeK8s();
    const strategy = new NixpacksBuildStrategy(new BuildJobRunner(k8s));
    await expect(strategy.build({ ...baseRequest, config: {} })).rejects.toBeInstanceOf(BuildConfigError);
    expect(applied).toHaveLength(0);
  });

  it("retenta com o outro protocolo quando o clone falha por conexão", async () => {
    const { k8s, applied, logRequests } = makeK8s(["failed", "succeeded"], "fatal: unable to access 'https://github.com/': Failed to connect");
    await new NixpacksBuildStrategy(new BuildJobRunner(k8s)).build(baseRequest);
    const urls = jobs(applied).map((job) => firstContainer(job).initContainers?.[0]?.env?.find((e) => e.name === "GIT_URL")?.value);
    expect(urls).toEqual(["https://github.com/acme/api.git", "http://github.com/acme/api.git"]);
    expect(logRequests[0]?.container).toBe("clone");
  });

  it("não retenta quando a falha não é de clone", async () => {
    const { k8s, applied } = makeK8s(["failed", "succeeded"], "npm ERR! missing script: build");
    const strategy = new NixpacksBuildStrategy(new BuildJobRunner(k8s));
    await expect(strategy.build(baseRequest)).rejects.toThrow();
    expect(jobs(applied)).toHaveLength(1);
  });

  it("Kaniko puro lê os logs do próprio container", async () => {
    const { k8s, logRequests } = makeK8s(["failed", "succeeded"], "dial tcp: connection refused");
    await new DockerfileBuildStrategy(new BuildJobRunner(k8s)).build({ ...baseRequest, source: "GITHUB" });
    expect(logRequests[0]?.container).toBeUndefined();
  });

  it("começa pelo protocolo da URL do repositório", async () => {
    const { k8s, applied } = makeK8s();
    await new NixpacksBuildStrategy(new BuildJobRunner(k8s)).build({ ...baseRequest, config: { repoUrl: "http://gitea.local/acme/api.git" } });
    const env = firstContainer(jobs(applied)[0]).initContainers?.[0]?.env;
    expect(env?.find((e) => e.name === "GIT_URL")?.value).toBe("http://gitea.local/acme/api.git");
  });

  it("cria e remove os secrets efêmeros de push e de clone", async () => {
    const { k8s, applied, removed } = makeK8s();
    await new RailpackBuildStrategy(new BuildJobRunner(k8s)).build({
      ...baseRequest,
      source: "RAILPACK",
      gitAuth: { username: "bot", password: "tok" },
      push: { insecure: false, credentials: { url: "registry.local", username: "u", password: "p" } },
    });
    const secrets = applied.filter((m) => m.kind === "Secret").map((m) => m.metadata.name);
    expect(secrets).toHaveLength(2);
    expect(removed.sort()).toEqual(secrets.map((name) => `Secret/${name}`).sort());
  });

  it("remove os secrets mesmo quando o build falha", async () => {
    const { k8s, removed } = makeK8s(["failed"]);
    const strategy = new StaticBuildStrategy(new BuildJobRunner(k8s));
    await expect(strategy.build({ ...baseRequest, source: "STATIC", gitAuth: { username: "bot", password: "tok" } })).rejects.toThrow();
    expect(removed).toHaveLength(1);
  });

  it("Static recebe a porta da aplicação", async () => {
    const { k8s, applied } = makeK8s();
    await new StaticBuildStrategy(new BuildJobRunner(k8s)).build({ ...baseRequest, source: "STATIC", port: 8080 });
    const writer = firstContainer(jobs(applied)[0]).initContainers?.find((c) => c.name === "static-dockerfile");
    expect(writer?.env?.find((e) => e.name === "STATIC_NGINX_CONF")?.value).toContain("listen 8080;");
  });

  // O creator só exporta para registry: sem destino de push não há onde a imagem parar.
  it("Buildpacks exige registry de destino", async () => {
    const { k8s, applied } = makeK8s();
    const strategy = new BuildpacksBuildStrategy(new BuildJobRunner(k8s));
    await expect(strategy.build({ ...baseRequest, source: "BUILDPACKS", push: undefined })).rejects.toBeInstanceOf(BuildConfigError);
    expect(applied).toHaveLength(0);
  });
});
