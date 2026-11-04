import { createHash } from "node:crypto";
import { COMPOSE_PLAN_SCRIPT } from "@infra/build/composePlanScript";
import { buildJobEnvelope, buildResources, dockerConfigVolume, kanikoJobManifest } from "@infra/kubernetes/manifests";
import type { K8sManifest } from "@interface/integrations";

/**
 * Manifests dos Jobs de build, um por origem. Funções PURAS: recebem a tentativa de
 * build já resolvida (`BuildJobInput`) e devolvem o Job. Quem cria secrets, aplica,
 * espera e retenta é o `BuildJobRunner`.
 *
 * Origens sem Dockerfile seguem o mesmo desenho: initContainers preparam um emptyDir
 * em `/workspace` (clone em `/workspace/src`, depois o gerador da origem) e o container
 * principal constrói e publica a partir dali.
 */
export interface BuildJobInput {
  name: string;
  namespace: string;
  imageRef: string;
  /** Repositório SEM protocolo (`github.com/acme/api.git`): o protocolo vem da tentativa. */
  repo: string;
  branch: string;
  /** Ref completa (`refs/tags/v1.2.0`). Sem ela, o Kaniko usa `refs/heads/<branch>`. */
  gitRef?: string;
  gitPullMethod: "http" | "https";
  /** Subpasta do repositório usada como raiz do build (monorepo). */
  subPath?: string;
  pushSecret?: string;
  gitCredentialsSecret?: string;
  buildArgs: { key: string; value: string }[];
  deploymentId?: string;
  push: boolean;
  insecure: boolean;
  /** Porta da aplicação (o nginx do Static escuta nela). */
  port?: number;
  /** `sourceConfig` da aplicação: chaves específicas de cada origem. */
  config: Record<string, unknown>;
}

type EnvVar = { name: string; value: string };

const WORKSPACE = "/workspace";
const REPO_DIR = `${WORKSPACE}/src`;
const WORKSPACE_MOUNT = { name: "workspace", mountPath: WORKSPACE };
const ARG_PREFIX = "CAPIVA_ARG_";

const gitImage = () => process.env.CAPIVA_GIT_IMAGE || "alpine/git:latest";
const sourceDir = (input: BuildJobInput) => [REPO_DIR, input.subPath].filter(Boolean).join("/");
const configString = (input: BuildJobInput, key: string) => input.config[key] as string | undefined;
const isEnvName = (key: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
const validBuildArgs = (input: BuildJobInput) => input.buildArgs.filter((arg) => isEnvName(arg.key));

/**
 * Build args para scripts de shell. Os valores vão com prefixo (`CAPIVA_ARG_PATH`, não
 * `PATH`): um build arg chamado PATH ou HOME quebraria o próprio container que o lê.
 */
function buildArgEnv(input: BuildJobInput): EnvVar[] {
  const args = validBuildArgs(input);
  return [
    { name: "CAPIVA_BUILD_ARG_NAMES", value: args.map((arg) => arg.key).join(" ") },
    ...args.map((arg) => ({ name: `${ARG_PREFIX}${arg.key}`, value: arg.value })),
  ];
}

/** Trecho de shell que acrescenta `--env KEY=valor` por build arg aos argumentos posicionais. */
const APPEND_ENV_ARGS = `for k in $CAPIVA_BUILD_ARG_NAMES; do set -- "$@" --env "$k=$(printenv "${ARG_PREFIX}$k")"; done`;

/**
 * O helper lê usuário/senha do ambiente (secret efêmero) na hora do pedido de
 * autenticação. Credencial na URL ou no argumento apareceria no `kubectl describe`.
 */
const GIT_CREDENTIAL_HELPER = '!f() { echo "username=${GIT_USERNAME:-}"; echo "password=${GIT_PASSWORD:-}"; }; f';

/** initContainer que clona o repositório em `/workspace/src`. */
function cloneInitContainer(input: BuildJobInput, isWorkspaceShared = false) {
  const script = [
    "set -eu",
    `git -c credential.helper='${GIT_CREDENTIAL_HELPER}' clone --depth 1 --branch "$GIT_BRANCH" "$GIT_URL" ${REPO_DIR}`,
    // Builders que rodam sem root (Buildpacks) precisam gravar no código clonado.
    ...(isWorkspaceShared ? [`chmod -R a+rwX ${REPO_DIR}`] : []),
  ].join("\n");
  return {
    name: "clone",
    image: gitImage(),
    command: ["sh", "-c", script],
    env: [
      { name: "GIT_URL", value: `${input.gitPullMethod}://${input.repo}` },
      { name: "GIT_BRANCH", value: input.branch },
      { name: "GIT_TERMINAL_PROMPT", value: "0" },
    ],
    ...(input.gitCredentialsSecret ? { envFrom: [{ secretRef: { name: input.gitCredentialsSecret } }] } : {}),
    volumeMounts: [WORKSPACE_MOUNT],
  };
}

/** Campos comuns do Kaniko; o contexto e o Dockerfile mudam por origem. */
const kanikoBase = (input: BuildJobInput) => ({
  name: input.name,
  namespace: input.namespace,
  imageRef: input.imageRef,
  pushSecret: input.pushSecret,
  buildArgs: input.buildArgs,
  deploymentId: input.deploymentId,
  push: input.push,
  insecure: input.insecure,
});

/** Kaniko a partir do workspace preparado pelos initContainers (sem clonar de novo). */
function kanikoFromWorkspace(input: BuildJobInput, context: string, dockerfile: string, initContainers: Record<string, unknown>[]): K8sManifest {
  return kanikoJobManifest({ ...kanikoBase(input), context: `dir://${context}`, dockerfile, workspace: { initContainers } });
}

/** Git com Dockerfile: Kaniko puro, que clona o contexto `git://` sozinho. */
export function dockerfileJobManifest(input: BuildJobInput): K8sManifest {
  return kanikoJobManifest({
    ...kanikoBase(input),
    context: `git://${input.repo}#${input.gitRef ?? `refs/heads/${input.branch}`}`,
    dockerfile: configString(input, "dockerfile") ?? "Dockerfile",
    contextSubPath: input.subPath,
    gitCredentialsSecret: input.gitCredentialsSecret,
    gitPullMethod: input.gitPullMethod,
  });
}

const NIXPACKS_SCRIPT = [
  "set -eu",
  "command -v nixpacks >/dev/null 2>&1 || { apk add --no-cache bash curl >/dev/null && curl -fsSL https://nixpacks.com/install.sh | bash; }",
  "set -- build . --out .",
  '[ -z "${NIXPACKS_INSTALL_CMD:-}" ] || set -- "$@" --install-cmd "$NIXPACKS_INSTALL_CMD"',
  '[ -z "${NIXPACKS_BUILD_CMD:-}" ] || set -- "$@" --build-cmd "$NIXPACKS_BUILD_CMD"',
  '[ -z "${NIXPACKS_START_CMD:-}" ] || set -- "$@" --start-cmd "$NIXPACKS_START_CMD"',
  APPEND_ENV_ARGS,
  'nixpacks "$@"',
].join("\n");

/** Nixpacks: `nixpacks build . --out .` grava `.nixpacks/Dockerfile` e o Kaniko constrói dele. */
export function nixpacksJobManifest(input: BuildJobInput): K8sManifest {
  const dir = sourceDir(input);
  const nixpacks = {
    name: "nixpacks",
    image: process.env.CAPIVA_NIXPACKS_IMAGE || "alpine:3.20",
    command: ["sh", "-c", NIXPACKS_SCRIPT],
    workingDir: dir,
    env: [
      { name: "NIXPACKS_INSTALL_CMD", value: configString(input, "installCommand") ?? "" },
      { name: "NIXPACKS_BUILD_CMD", value: configString(input, "buildCommand") ?? "" },
      { name: "NIXPACKS_START_CMD", value: configString(input, "startCommand") ?? "" },
      ...buildArgEnv(input),
    ],
    volumeMounts: [WORKSPACE_MOUNT],
  };
  return kanikoFromWorkspace(input, dir, `${dir}/.nixpacks/Dockerfile`, [cloneInitContainer(input), nixpacks]);
}

const trimSlashes = (path: string) => path.replace(/\/+$/, "") || ".";

/** Dockerfile do Static: nginx servindo o diretório de saída. */
export function staticDockerfile(options: { outputDir: string }): string {
  return [
    `FROM ${process.env.CAPIVA_STATIC_NGINX_IMAGE || "nginx:1.27-alpine"}`,
    "COPY .capiva/nginx.conf /etc/nginx/conf.d/default.conf",
    `COPY ${trimSlashes(options.outputDir)}/ /usr/share/nginx/html/`,
    "",
  ].join("\n");
}

/** Configuração do nginx do Static. Arquivos ocultos (.git, .env) nunca são servidos. */
export function staticNginxConf(options: { port?: number; spa: boolean }): string {
  const fallback = options.spa ? "/index.html" : "=404";
  return [
    "server {",
    `  listen ${options.port ?? 80};`,
    "  root /usr/share/nginx/html;",
    "  index index.html;",
    "  location ~ /\\.(?!well-known) { deny all; }",
    `  location / { try_files $uri $uri/ ${fallback}; }`,
    "}",
    "",
  ].join("\n");
}

/** Static: build opcional por comando, depois um Dockerfile nginx gerado e o Kaniko. */
export function staticJobManifest(input: BuildJobInput): K8sManifest {
  const dir = sourceDir(input);
  const buildCommand = configString(input, "buildCommand");
  const outputDir = configString(input, "outputDir") ?? (buildCommand ? "dist" : ".");
  // O comando do usuário enxerga os build args como variáveis comuns, como num RUN.
  const build = {
    name: "static-build",
    image: configString(input, "buildImage") || process.env.CAPIVA_STATIC_BUILD_IMAGE || "node:22-alpine",
    command: ["sh", "-c", buildCommand ?? ""],
    workingDir: dir,
    env: validBuildArgs(input).map((arg) => ({ name: arg.key, value: arg.value })),
    volumeMounts: [WORKSPACE_MOUNT],
  };
  const writer = {
    name: "static-dockerfile",
    image: gitImage(),
    command: ["sh", "-c", `mkdir -p .capiva && printf '%s' "$STATIC_DOCKERFILE" > .capiva/Dockerfile && printf '%s' "$STATIC_NGINX_CONF" > .capiva/nginx.conf`],
    workingDir: dir,
    env: [
      { name: "STATIC_DOCKERFILE", value: staticDockerfile({ outputDir }) },
      { name: "STATIC_NGINX_CONF", value: staticNginxConf({ port: input.port, spa: input.config.spa === true }) },
    ],
    volumeMounts: [WORKSPACE_MOUNT],
  };
  const initContainers = [cloneInitContainer(input), ...(buildCommand ? [build] : []), writer];
  return kanikoFromWorkspace(input, dir, `${dir}/.capiva/Dockerfile`, initContainers);
}

const COMPOSE_CONTEXT = `${WORKSPACE}/context`;
const COMPOSE_DOCKERFILE = `${WORKSPACE}/Dockerfile.compose`;

/**
 * Docker Compose: constrói UM serviço (o escolhido ou o primeiro com `build`) usando o
 * `build.context`/`build.dockerfile` dele. Os demais serviços não são criados.
 */
export function composeJobManifest(input: BuildJobInput): K8sManifest {
  const plan = {
    name: "compose-plan",
    image: process.env.CAPIVA_BUN_IMAGE || "oven/bun:1-alpine",
    command: ["bun", "-e", COMPOSE_PLAN_SCRIPT],
    env: [
      { name: "REPO_DIR", value: REPO_DIR },
      { name: "COMPOSE_FILE", value: `${sourceDir(input)}/${configString(input, "compose") ?? "docker-compose.yml"}` },
      { name: "COMPOSE_SERVICE", value: configString(input, "composeService") ?? "" },
      { name: "OUT_CONTEXT", value: COMPOSE_CONTEXT },
      { name: "OUT_DOCKERFILE", value: COMPOSE_DOCKERFILE },
    ],
    volumeMounts: [WORKSPACE_MOUNT],
  };
  return kanikoFromWorkspace(input, COMPOSE_CONTEXT, COMPOSE_DOCKERFILE, [cloneInitContainer(input), plan]);
}

const RAILPACK_PLAN_DIR = `${WORKSPACE}/plan`;

const RAILPACK_SCRIPT = [
  "set -eu",
  "command -v railpack >/dev/null 2>&1 || { apk add --no-cache bash curl >/dev/null && curl -fsSL https://railpack.com/install.sh | bash; }",
  `mkdir -p ${RAILPACK_PLAN_DIR}`,
  `set -- prepare . --plan-out ${RAILPACK_PLAN_DIR}/railpack-plan.json --info-out ${RAILPACK_PLAN_DIR}/railpack-info.json`,
  APPEND_ENV_ARGS,
  'railpack "$@"',
].join("\n");

/**
 * Hash dos build args: o frontend do Railpack só invalida a camada quando um secret muda
 * se receber `secrets-hash` (a CLI calcula sozinha; usando o frontend direto, é nossa vez).
 */
function secretsHash(input: BuildJobInput): string {
  const lines = validBuildArgs(input)
    .map((arg) => `${arg.key}=${arg.value}`)
    .sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

/** Build args do Railpack: secrets do BuildKit, com o valor lido do ambiente (nunca no argumento). */
function railpackSecretArgs(input: BuildJobInput): string[] {
  const args = validBuildArgs(input);
  const secrets = args.flatMap((arg) => ["--secret", `id=${arg.key},env=${ARG_PREFIX}${arg.key}`]);
  return args.length ? [...secrets, "--opt", `build-arg:secrets-hash=${secretsHash(input)}`] : [];
}

const imageOutput = (input: BuildJobInput) =>
  `type=image,name=${input.imageRef},push=${input.push}${input.insecure ? ",registry.insecure=true" : ""}`;

/**
 * Railpack: `railpack prepare` gera o plano e o BuildKit rootless (daemonless, dentro do
 * próprio Job) constrói com o frontend do Railpack. Sem daemon compartilhado nem privilégio.
 */
export function railpackJobManifest(input: BuildJobInput): K8sManifest {
  const dir = sourceDir(input);
  const prepare = {
    name: "railpack-prepare",
    image: process.env.CAPIVA_RAILPACK_IMAGE || "alpine:3.20",
    command: ["sh", "-c", RAILPACK_SCRIPT],
    workingDir: dir,
    env: buildArgEnv(input),
    volumeMounts: [WORKSPACE_MOUNT],
  };
  const buildkit = {
    name: "buildkit",
    image: process.env.CAPIVA_BUILDKIT_IMAGE || "moby/buildkit:rootless",
    command: ["buildctl-daemonless.sh"],
    args: [
      "build",
      "--local",
      `context=${dir}`,
      "--local",
      `dockerfile=${RAILPACK_PLAN_DIR}`,
      "--frontend=gateway.v0",
      "--opt",
      `source=${process.env.CAPIVA_RAILPACK_FRONTEND || "ghcr.io/railwayapp/railpack-frontend"}`,
      "--opt",
      "filename=railpack-plan.json",
      "--output",
      imageOutput(input),
      ...railpackSecretArgs(input),
    ],
    env: [{ name: "BUILDKITD_FLAGS", value: "--oci-worker-no-process-sandbox" }, ...buildArgEnv(input)],
    // Rootless: o BuildKit precisa de seccomp/AppArmor sem confinamento, mas não de privileged.
    securityContext: {
      runAsUser: 1000,
      runAsGroup: 1000,
      seccompProfile: { type: "Unconfined" },
      appArmorProfile: { type: "Unconfined" },
    },
    resources: buildResources(),
    volumeMounts: [
      WORKSPACE_MOUNT,
      { name: "buildkitd", mountPath: "/home/user/.local/share/buildkit" },
      ...(input.pushSecret ? [{ name: "docker-config", mountPath: "/home/user/.docker" }] : []),
    ],
  };
  return buildJobEnvelope(input, {
    initContainers: [cloneInitContainer(input), prepare],
    containers: [buildkit],
    volumes: [
      { name: "workspace", emptyDir: {} },
      { name: "buildkitd", emptyDir: {} },
      ...(input.pushSecret ? [dockerConfigVolume(input.pushSecret)] : []),
    ],
  });
}

const PLATFORM_DIR = "/platform";
const PLATFORM_ENV_SCRIPT = [
  "set -eu",
  `mkdir -p ${PLATFORM_DIR}/env`,
  `for k in $CAPIVA_BUILD_ARG_NAMES; do printf '%s' "$(printenv "${ARG_PREFIX}$k")" > "${PLATFORM_DIR}/env/$k"; done`,
].join("\n");

const registryHost = (imageRef: string) => imageRef.split("/")[0] ?? imageRef;

/**
 * Cloud Native Buildpacks: o `creator` do lifecycle (dentro da imagem do builder) detecta,
 * constrói e publica direto no registry. Não usa Kaniko. Build args viram
 * `/platform/env/<KEY>`, o canal que os buildpacks leem.
 */
export function buildpacksJobManifest(input: BuildJobInput): K8sManifest {
  const platformEnv = {
    name: "platform-env",
    image: gitImage(),
    command: ["sh", "-c", PLATFORM_ENV_SCRIPT],
    env: buildArgEnv(input),
    volumeMounts: [{ name: "platform", mountPath: PLATFORM_DIR }],
  };
  const creator = {
    name: "creator",
    image: configString(input, "builder") || process.env.CAPIVA_BUILDPACKS_BUILDER || "paketobuildpacks/builder-jammy-base",
    command: ["/cnb/lifecycle/creator"],
    args: [
      `-app=${sourceDir(input)}`,
      "-layers=/layers",
      `-platform=${PLATFORM_DIR}`,
      "-cache-dir=/cache",
      "-log-level=info",
      ...(input.insecure ? [`-insecure-registry=${registryHost(input.imageRef)}`] : []),
      input.imageRef,
    ],
    env: [
      { name: "CNB_PLATFORM_API", value: process.env.CAPIVA_CNB_PLATFORM_API || "0.12" },
      ...(input.pushSecret ? [{ name: "DOCKER_CONFIG", value: "/cnb-docker" }] : []),
    ],
    resources: buildResources(),
    volumeMounts: [
      WORKSPACE_MOUNT,
      { name: "layers", mountPath: "/layers" },
      { name: "platform", mountPath: PLATFORM_DIR },
      { name: "cache", mountPath: "/cache" },
      ...(input.pushSecret ? [{ name: "docker-config", mountPath: "/cnb-docker" }] : []),
    ],
  };
  return buildJobEnvelope(input, {
    initContainers: [cloneInitContainer(input, true), ...(validBuildArgs(input).length ? [platformEnv] : [])],
    containers: [creator],
    volumes: [
      { name: "workspace", emptyDir: {} },
      { name: "layers", emptyDir: {} },
      { name: "platform", emptyDir: {} },
      { name: "cache", emptyDir: {} },
      ...(input.pushSecret ? [dockerConfigVolume(input.pushSecret)] : []),
    ],
  });
}
