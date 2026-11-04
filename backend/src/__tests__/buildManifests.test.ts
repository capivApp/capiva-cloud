/**
 * Manifests dos Jobs de build por origem (Dockerfile, Nixpacks, Railpack, Buildpacks,
 * Static, Docker Compose). Funções puras: nada de cluster, só o objeto gerado.
 */
import { describe, expect, it } from "bun:test";
import {
  buildpacksJobManifest,
  composeJobManifest,
  dockerfileJobManifest,
  nixpacksJobManifest,
  railpackJobManifest,
  staticDockerfile,
  staticJobManifest,
  staticNginxConf,
  type BuildJobInput,
} from "@infra/kubernetes/buildManifests";

const baseInput: BuildJobInput = {
  name: "build-abc-0",
  namespace: "prod",
  imageRef: "registry.local/api:1.0.0",
  repo: "github.com/acme/api.git",
  branch: "main",
  gitPullMethod: "https",
  buildArgs: [],
  deploymentId: "dep_1",
  push: true,
  insecure: false,
  config: {},
};

type Container = {
  name: string;
  image: string;
  command?: string[];
  args?: string[];
  workingDir?: string;
  env?: { name: string; value: string }[];
  envFrom?: { secretRef: { name: string } }[];
  volumeMounts?: { name: string; mountPath: string }[];
};

/** Atalhos de leitura do pod spec (o manifest é um objeto solto por design). */
const podSpec = (m: unknown) =>
  (m as { spec: { template: { spec: { initContainers?: Container[]; containers: Container[]; volumes?: { name: string }[] } } } }).spec.template.spec;
const initNamed = (m: unknown, name: string) => podSpec(m).initContainers?.find((c) => c.name === name);
const mainContainer = (m: unknown) => podSpec(m).containers[0];
const envOf = (c: Container | undefined, name: string) => c?.env?.find((e) => e.name === name)?.value;

describe("dockerfileJobManifest — Git com Dockerfile continua no Kaniko puro", () => {
  it("usa o contexto git:// sem initContainers", () => {
    const job = dockerfileJobManifest({ ...baseInput, subPath: "apps/api", config: { dockerfile: "Dockerfile.prod" } });
    const kaniko = mainContainer(job);
    expect(podSpec(job).initContainers).toBeUndefined();
    expect(kaniko.args).toContain("--context=git://github.com/acme/api.git#refs/heads/main");
    expect(kaniko.args).toContain("--dockerfile=Dockerfile.prod");
    expect(kaniko.args).toContain("--context-sub-path=apps/api");
    expect(envOf(kaniko, "GIT_PULL_METHOD")).toBe("https");
  });

  it("entrega as credenciais Git ao próprio Kaniko", () => {
    const job = dockerfileJobManifest({ ...baseInput, gitCredentialsSecret: "build-abc-git" });
    expect(mainContainer(job).envFrom).toEqual([{ secretRef: { name: "build-abc-git" } }]);
  });
});

describe("clone do repositório (origens sem Dockerfile)", () => {
  it("clona pelo protocolo da tentativa e com as credenciais do secret", () => {
    const job = nixpacksJobManifest({ ...baseInput, gitPullMethod: "http", gitCredentialsSecret: "build-abc-git" });
    const clone = initNamed(job, "clone");
    expect(envOf(clone, "GIT_URL")).toBe("http://github.com/acme/api.git");
    expect(envOf(clone, "GIT_BRANCH")).toBe("main");
    expect(clone?.envFrom).toEqual([{ secretRef: { name: "build-abc-git" } }]);
  });

  // Senha no argumento ou na URL apareceria no `kubectl describe` e nos logs.
  it("nunca põe a credencial na URL nem nos argumentos", () => {
    const job = nixpacksJobManifest({ ...baseInput, gitCredentialsSecret: "build-abc-git" });
    expect(JSON.stringify(initNamed(job, "clone"))).not.toContain("@github.com");
  });
});

describe("nixpacksJobManifest", () => {
  it("gera o Dockerfile com o nixpacks e o Kaniko constrói a partir dele", () => {
    const job = nixpacksJobManifest({ ...baseInput, subPath: "apps/api" });
    const nixpacks = initNamed(job, "nixpacks");
    const kaniko = mainContainer(job);
    expect(nixpacks?.workingDir).toBe("/workspace/src/apps/api");
    expect(nixpacks?.command?.join(" ")).toContain("--out .");
    expect(kaniko.args).toContain("--context=dir:///workspace/src/apps/api");
    expect(kaniko.args).toContain("--dockerfile=/workspace/src/apps/api/.nixpacks/Dockerfile");
    expect(kaniko.volumeMounts).toContainEqual({ name: "workspace", mountPath: "/workspace" });
  });

  it("repassa os comandos de install, build e start configurados", () => {
    const job = nixpacksJobManifest({ ...baseInput, config: { installCommand: "pnpm i", buildCommand: "pnpm build", startCommand: "node dist" } });
    const nixpacks = initNamed(job, "nixpacks");
    expect(envOf(nixpacks, "NIXPACKS_INSTALL_CMD")).toBe("pnpm i");
    expect(envOf(nixpacks, "NIXPACKS_BUILD_CMD")).toBe("pnpm build");
    expect(envOf(nixpacks, "NIXPACKS_START_CMD")).toBe("node dist");
  });

  it("passa os build args como variáveis do plano sem sobrescrever o ambiente do container", () => {
    const job = nixpacksJobManifest({ ...baseInput, buildArgs: [{ key: "PATH", value: "x" }, { key: "NODE_ENV", value: "production" }] });
    const nixpacks = initNamed(job, "nixpacks");
    expect(envOf(nixpacks, "CAPIVA_ARG_NODE_ENV")).toBe("production");
    expect(envOf(nixpacks, "PATH")).toBeUndefined();
    expect(envOf(nixpacks, "CAPIVA_BUILD_ARG_NAMES")).toBe("PATH NODE_ENV");
  });

  it("não deixa o Kaniko clonar de novo: o contexto já está no volume", () => {
    const job = nixpacksJobManifest({ ...baseInput, gitCredentialsSecret: "build-abc-git" });
    expect(mainContainer(job).envFrom).toBeUndefined();
    expect(envOf(mainContainer(job), "GIT_PULL_METHOD")).toBeUndefined();
  });
});

describe("staticJobManifest", () => {
  it("sem comando de build, serve o diretório informado sem rodar build", () => {
    const job = staticJobManifest({ ...baseInput, port: 8080, config: { outputDir: "public" } });
    expect(initNamed(job, "static-build")).toBeUndefined();
    const writer = initNamed(job, "static-dockerfile");
    expect(envOf(writer, "STATIC_DOCKERFILE")).toContain("COPY public/ /usr/share/nginx/html/");
    expect(envOf(writer, "STATIC_NGINX_CONF")).toContain("listen 8080;");
    expect(mainContainer(job).args).toContain("--dockerfile=/workspace/src/.capiva/Dockerfile");
  });

  it("com comando de build, roda o build antes e serve dist por padrão", () => {
    const job = staticJobManifest({ ...baseInput, config: { buildCommand: "npm ci && npm run build", buildImage: "node:20-alpine" } });
    const build = initNamed(job, "static-build");
    expect(build?.image).toBe("node:20-alpine");
    expect(build?.command).toEqual(["sh", "-c", "npm ci && npm run build"]);
    expect(envOf(initNamed(job, "static-dockerfile"), "STATIC_DOCKERFILE")).toContain("COPY dist/ ");
  });

  it("o build roda antes de escrever o Dockerfile", () => {
    const job = staticJobManifest({ ...baseInput, config: { buildCommand: "make" } });
    expect(podSpec(job).initContainers?.map((c) => c.name)).toEqual(["clone", "static-build", "static-dockerfile"]);
  });
});

describe("staticDockerfile e staticNginxConf", () => {
  it("o nginx escuta na porta da aplicação, 80 por padrão", () => {
    expect(staticNginxConf({ port: 3000, spa: false })).toContain("listen 3000;");
    expect(staticNginxConf({ spa: false })).toContain("listen 80;");
  });

  it("modo SPA devolve o index.html para rotas desconhecidas", () => {
    expect(staticNginxConf({ spa: true })).toContain("try_files $uri $uri/ /index.html;");
    expect(staticNginxConf({ spa: false })).toContain("try_files $uri $uri/ =404;");
  });

  // Servir a raiz do repositório exporia o `.git` (histórico inteiro) na internet.
  it("bloqueia arquivos ocultos como .git", () => {
    expect(staticNginxConf({ spa: false })).toContain("location ~ /\\.(?!well-known)");
  });

  it("copia a configuração do nginx e o diretório de saída", () => {
    const dockerfile = staticDockerfile({ outputDir: "." });
    expect(dockerfile).toContain("COPY .capiva/nginx.conf /etc/nginx/conf.d/default.conf");
    expect(dockerfile).toContain("COPY ./ /usr/share/nginx/html/");
  });
});

describe("composeJobManifest", () => {
  it("resolve o serviço do compose e constrói o contexto dele", () => {
    const job = composeJobManifest({ ...baseInput, subPath: "deploy", config: { compose: "compose.prod.yml", composeService: "web" } });
    const plan = initNamed(job, "compose-plan");
    expect(envOf(plan, "COMPOSE_FILE")).toBe("/workspace/src/deploy/compose.prod.yml");
    expect(envOf(plan, "COMPOSE_SERVICE")).toBe("web");
    expect(mainContainer(job).args).toContain("--context=dir:///workspace/context");
    expect(mainContainer(job).args).toContain("--dockerfile=/workspace/Dockerfile.compose");
  });

  it("usa docker-compose.yml e o primeiro serviço com build por padrão", () => {
    const plan = initNamed(composeJobManifest(baseInput), "compose-plan");
    expect(envOf(plan, "COMPOSE_FILE")).toBe("/workspace/src/docker-compose.yml");
    expect(envOf(plan, "COMPOSE_SERVICE")).toBe("");
  });
});

describe("railpackJobManifest", () => {
  it("prepara o plano com o railpack e constrói com BuildKit rootless", () => {
    const job = railpackJobManifest({ ...baseInput, subPath: "apps/api" });
    const prepare = initNamed(job, "railpack-prepare");
    const buildkit = mainContainer(job);
    expect(prepare?.workingDir).toBe("/workspace/src/apps/api");
    expect(buildkit.command).toEqual(["buildctl-daemonless.sh"]);
    expect(buildkit.args).toContain("context=/workspace/src/apps/api");
    expect(buildkit.args).toContain("dockerfile=/workspace/plan");
    expect(buildkit.args).toContain("--frontend=gateway.v0");
    expect(buildkit.args).toContain("type=image,name=registry.local/api:1.0.0,push=true");
    expect(envOf(buildkit, "BUILDKITD_FLAGS")).toBe("--oci-worker-no-process-sandbox");
  });

  it("registry sem TLS e build sem push refletem na saída da imagem", () => {
    const job = railpackJobManifest({ ...baseInput, push: false, insecure: true });
    expect(mainContainer(job).args).toContain("type=image,name=registry.local/api:1.0.0,push=false,registry.insecure=true");
  });

  it("build args viram secrets do BuildKit, com hash para invalidar a camada", () => {
    const job = railpackJobManifest({ ...baseInput, buildArgs: [{ key: "API_KEY", value: "s3cr3t" }] });
    const args = mainContainer(job).args ?? [];
    expect(args).toContain("id=API_KEY,env=CAPIVA_ARG_API_KEY");
    expect(args.some((a) => a.startsWith("build-arg:secrets-hash="))).toBe(true);
    expect(args.join(" ")).not.toContain("s3cr3t");
  });

  it("monta as credenciais de push no docker config do usuário rootless", () => {
    const job = railpackJobManifest({ ...baseInput, pushSecret: "build-abc-push" });
    expect(mainContainer(job).volumeMounts).toContainEqual({ name: "docker-config", mountPath: "/home/user/.docker" });
  });
});

describe("buildpacksJobManifest", () => {
  it("roda o lifecycle creator do builder padrão e publica sem Kaniko", () => {
    const job = buildpacksJobManifest({ ...baseInput, subPath: "apps/api" });
    const creator = mainContainer(job);
    expect(creator.image).toBe("paketobuildpacks/builder-jammy-base");
    expect(creator.command).toEqual(["/cnb/lifecycle/creator"]);
    expect(creator.args).toContain("-app=/workspace/src/apps/api");
    expect(creator.args?.at(-1)).toBe("registry.local/api:1.0.0");
    expect(JSON.stringify(job)).not.toContain("kaniko");
  });

  it("aceita outro builder", () => {
    const job = buildpacksJobManifest({ ...baseInput, config: { builder: "heroku/builder:24" } });
    expect(mainContainer(job).image).toBe("heroku/builder:24");
  });

  it("registry sem TLS libera o host no creator", () => {
    const job = buildpacksJobManifest({ ...baseInput, insecure: true });
    expect(mainContainer(job).args).toContain("-insecure-registry=registry.local");
  });

  it("credenciais de push vão pelo DOCKER_CONFIG", () => {
    const job = buildpacksJobManifest({ ...baseInput, pushSecret: "build-abc-push" });
    expect(envOf(mainContainer(job), "DOCKER_CONFIG")).toBe("/cnb-docker");
    expect(mainContainer(job).volumeMounts).toContainEqual({ name: "docker-config", mountPath: "/cnb-docker" });
  });

  it("build args viram o diretório de ambiente da plataforma", () => {
    const job = buildpacksJobManifest({ ...baseInput, buildArgs: [{ key: "BP_NODE_VERSION", value: "22" }] });
    const platformEnv = initNamed(job, "platform-env");
    expect(envOf(platformEnv, "CAPIVA_ARG_BP_NODE_VERSION")).toBe("22");
    expect(mainContainer(job).volumeMounts).toContainEqual({ name: "platform", mountPath: "/platform" });
  });

  // O builder roda com o usuário do CNB, não root: o clone precisa ficar gravável por ele.
  it("libera o código clonado para o usuário do builder", () => {
    const job = buildpacksJobManifest(baseInput);
    expect(initNamed(job, "clone")?.command?.join(" ")).toContain("chmod -R a+rwX /workspace/src");
  });
});
