import { join } from "path";
import { findApplication, requireAppArg, type Application } from "@core/applications";
import { CliError } from "@core/errors";
import type { EnvVarView } from "@command/env";
import type { CommandStrategy } from "@core/context";

interface ScalingPolicy {
  minReplicas: number;
  maxReplicas: number;
  metric: string;
  target: number;
}

interface Volume {
  name: string;
  mountPath: string;
  sizeGi: number;
  accessMode: string;
}

export interface InitSources {
  app: Application;
  env: EnvVarView[];
  domains: { host: string }[];
  volumes: Volume[];
  scaling: ScalingPolicy | null;
}

type Json = Record<string, unknown>;

/** Remove chaves vazias: o arquivo só declara o que a aplicação de fato tem. */
const compact = (obj: Json): Json | undefined => {
  const entries = Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== "");
  return entries.length ? Object.fromEntries(entries) : undefined;
};

const nonEmpty = <T>(list: T[]): T[] | undefined => (list.length ? list : undefined);

const buildArgsOf = (cfg: Json): Json | undefined => {
  const args = (cfg.buildArgs as { key: string; value: string }[] | undefined) ?? [];
  return args.length ? Object.fromEntries(args.map((a) => [a.key, a.value])) : undefined;
};

/** Cada seção do capiva.json e de onde ela vem na aplicação atual. */
const SECTIONS: Record<string, (s: InitSources, cfg: Json) => unknown> = {
  build: (s, cfg) =>
    compact({
      type: s.app.source,
      dockerfile: cfg.dockerfile,
      context: cfg.subPath,
      compose: cfg.compose,
      buildCommand: cfg.buildCommand,
      startCommand: cfg.startCommand,
      args: buildArgsOf(cfg),
    }),
  port: (s) => s.app.port ?? undefined,
  healthcheck: (_s, cfg) => compact({ path: cfg.healthPath }),
  profile: (s) => s.app.profile,
  replicas: (_s, cfg) => cfg.replicas,
  autoscaling: (s) =>
    s.scaling && {
      min: s.scaling.minReplicas,
      max: s.scaling.maxReplicas,
      metric: s.scaling.metric,
      target: s.scaling.target,
    },
  // Segredos e variáveis injetadas por dependência ficam fora do arquivo versionado.
  env: (s) =>
    compact(
      Object.fromEntries(
        s.env.filter((v) => v.source === "MANUAL" && !v.secret).map((v) => [v.key, v.value]),
      ),
    ),
  volumes: (s) =>
    nonEmpty(
      s.volumes.map((v) => ({
        name: v.name,
        mountPath: v.mountPath,
        sizeGi: v.sizeGi,
        accessMode: v.accessMode,
      })),
    ),
  domains: (s) => nonEmpty(s.domains.map((d) => d.host)),
};

/** Monta o capiva.json equivalente à configuração atual da aplicação. */
export function buildCapivaJson(sources: InitSources, apiUrl: string): Json {
  const cfg = (sources.app.sourceConfig ?? {}) as Json;
  const sections = Object.entries(SECTIONS).map(
    ([key, read]) => [key, read(sources, cfg)] as const,
  );
  return { $schema: `${apiUrl}/schemas/capiva.json`, ...compact(Object.fromEntries(sections)) };
}

export const initCommand: CommandStrategy = {
  usage: "init <app> [--force] [--json]",
  summary: "Gera o capiva.json a partir da aplicação existente",
  async run(ctx) {
    const api = await ctx.api();
    const ref = await findApplication(api, requireAppArg(ctx, this.usage));
    const base = `/applications/${ref.id}`;
    const [app, env, domains, volumes, scaling] = await Promise.all([
      api.get<Application>(base),
      api.get<EnvVarView[]>(`${base}/env`),
      api.get<{ host: string }[]>(`${base}/domains`),
      api.get<Volume[]>(`${base}/volumes`),
      api.get<ScalingPolicy | null>(`${base}/scaling`),
    ]);
    const content = buildCapivaJson({ app, env, domains, volumes, scaling }, api.apiUrl);
    if (ctx.flags.json) return ctx.out.result(content, () => "");

    const path = join(ctx.deps.cwd, "capiva.json");
    if ((await ctx.deps.files.exists(path)) && !ctx.flags.force)
      throw new CliError(`${path} já existe. Use --force para sobrescrever.`);
    await ctx.deps.files.write(path, `${JSON.stringify(content, null, 2)}\n`);
    ctx.out.line(`capiva.json gerado em ${path}. Commite o arquivo para valer no próximo deploy.`);
  },
};
