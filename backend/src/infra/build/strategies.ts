import { Injectable } from "@di/index";
import { BuildConfigError } from "@infra/build/BuildConfigError";
import { BuildJobRunner, type BuildJobPlan } from "@infra/build/BuildJobRunner";
import {
  buildpacksJobManifest,
  composeJobManifest,
  dockerfileJobManifest,
  nixpacksJobManifest,
  railpackJobManifest,
  staticJobManifest,
} from "@infra/kubernetes/buildManifests";
import type { BuildRequest, IBuildStrategy } from "@interface/integrations";

export { BuildConfigError } from "@infra/build/BuildConfigError";

/** Origem "imagem pronta": nada para construir, apenas referenciar a imagem. */
export class DockerImageBuildStrategy implements IBuildStrategy {
  readonly sources = ["DOCKER_IMAGE"];

  async build(req: BuildRequest): Promise<{ imageRef: string }> {
    const image = (req.config.image as string | undefined) ?? req.imageRef;
    return { imageRef: image };
  }
}

/**
 * Origem por código: um Job de build in-cluster. Cada subclasse só declara as origens
 * que atende e o plano do Job (manifest puro + onde ler falha de clone).
 */
abstract class JobBuildStrategy implements IBuildStrategy {
  abstract readonly sources: readonly string[];
  protected abstract readonly plan: BuildJobPlan;

  constructor(protected readonly runner: BuildJobRunner) {}

  build(req: BuildRequest): Promise<{ imageRef: string }> {
    return this.runner.run(req, this.plan);
  }
}

/** Initcontainer que clona o repositório nas origens sem Dockerfile. */
const CLONE_CONTAINER = "clone";

/** Git com Dockerfile: Kaniko puro, que clona o contexto sozinho. */
export class DockerfileBuildStrategy extends JobBuildStrategy {
  readonly sources = ["GITHUB", "GITLAB", "GITEA"];
  protected readonly plan = { manifest: dockerfileJobManifest };
}

/** Nixpacks gera `.nixpacks/Dockerfile`; o Kaniko constrói dele. */
export class NixpacksBuildStrategy extends JobBuildStrategy {
  readonly sources = ["NIXPACKS"];
  protected readonly plan = { manifest: nixpacksJobManifest, cloneLogContainer: CLONE_CONTAINER };
}

/** Railpack prepara o plano; BuildKit rootless constrói com o frontend do Railpack. */
export class RailpackBuildStrategy extends JobBuildStrategy {
  readonly sources = ["RAILPACK"];
  protected readonly plan = { manifest: railpackJobManifest, cloneLogContainer: CLONE_CONTAINER };
}

/** Site estático: build opcional e nginx servindo o diretório de saída. */
export class StaticBuildStrategy extends JobBuildStrategy {
  readonly sources = ["STATIC"];
  protected readonly plan = { manifest: staticJobManifest, cloneLogContainer: CLONE_CONTAINER };
}

/** Docker Compose: constrói um serviço do compose com o contexto e o Dockerfile dele. */
export class DockerComposeBuildStrategy extends JobBuildStrategy {
  readonly sources = ["DOCKER_COMPOSE"];
  protected readonly plan = { manifest: composeJobManifest, cloneLogContainer: CLONE_CONTAINER };
}

/** Cloud Native Buildpacks: o lifecycle `creator` constrói e publica, sem Kaniko. */
export class BuildpacksBuildStrategy extends JobBuildStrategy {
  readonly sources = ["BUILDPACKS"];
  protected readonly plan = { manifest: buildpacksJobManifest, cloneLogContainer: CLONE_CONTAINER };

  override build(req: BuildRequest): Promise<{ imageRef: string }> {
    // O creator só exporta para registry: sem destino de push a imagem não teria onde parar.
    if (!req.push) return Promise.reject(new BuildConfigError("Configure um registry padrão para construir com Buildpacks."));
    return super.build(req);
  }
}

/** Factory: todas as strategies de build, prontas para o resolver indexar por origem. */
export const createBuildStrategies = (runner: BuildJobRunner): IBuildStrategy[] => [
  new DockerImageBuildStrategy(),
  new DockerfileBuildStrategy(runner),
  new NixpacksBuildStrategy(runner),
  new RailpackBuildStrategy(runner),
  new StaticBuildStrategy(runner),
  new DockerComposeBuildStrategy(runner),
  new BuildpacksBuildStrategy(runner),
];

/**
 * Resolver (Factory + Strategy): escolhe a estratégia de build pela origem.
 * Services dependem deste resolver, nunca das implementações concretas.
 */
@Injectable()
export class BuildStrategyResolver {
  private readonly bySource: Map<string, IBuildStrategy>;

  constructor(runner: BuildJobRunner) {
    const strategies = createBuildStrategies(runner);
    this.bySource = new Map(strategies.flatMap((strategy) => strategy.sources.map((source) => [source, strategy] as const)));
  }

  resolve(source: string): IBuildStrategy {
    const strategy = this.bySource.get(source);
    if (!strategy) throw new BuildConfigError(`Origem de build não suportada: ${source}`);
    return strategy;
  }
}
