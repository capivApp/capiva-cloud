import { findApplication, requireAppArg } from "@core/applications";
import { CliError } from "@core/errors";
import type { CommandContext, CommandStrategy } from "@core/context";

export interface EnvVarView {
  key: string;
  value: string;
  secret: boolean;
  source: "MANUAL" | "INJECTED";
}

interface EnvVarInput {
  key: string;
  value: string;
  secret: boolean;
}

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const parsePair = (pair: string): EnvVarInput => {
  const index = pair.indexOf("=");
  const key = pair.slice(0, index);
  if (index < 1 || !KEY_RE.test(key)) throw new CliError(`Use KEY=VALUE (recebido: ${pair}).`, 2);
  return { key, value: pair.slice(index + 1), secret: false };
};

/**
 * O PUT do editor substitui TODAS as variáveis MANUAL. Por isso o set mescla com as
 * atuais: segredo vai com valor vazio (o backend mantém o cifrado) e INJECTED
 * (dependências) fica de fora. Com `--secret`, as chaves informadas viram segredo.
 */
export function mergeEnvVars(
  current: EnvVarView[],
  updates: EnvVarInput[],
  secret: boolean,
): EnvVarInput[] {
  const byKey = new Map(updates.map((u) => [u.key, { ...u, secret }]));
  const kept = current
    .filter((v) => v.source === "MANUAL")
    .map(
      (v) => byKey.get(v.key) ?? { key: v.key, value: v.secret ? "" : v.value, secret: v.secret },
    );
  const added = [...byKey.values()].filter(
    (u) => !current.some((v) => v.source === "MANUAL" && v.key === u.key),
  );
  return [...kept, ...added];
}

const formatEnv = (vars: EnvVarView[]): string =>
  vars
    .map(
      (v) =>
        `${v.key}=${v.secret ? "******" : v.value}${v.source === "INJECTED" ? "  (dependência)" : ""}`,
    )
    .join("\n");

const appOf = async (ctx: CommandContext, usage: string) => {
  const api = await ctx.api();
  return { api, app: await findApplication(api, requireAppArg(ctx, usage)) };
};

export const envListCommand: CommandStrategy = {
  usage: "env list <app>",
  summary: "Lista as variáveis de ambiente (segredos mascarados)",
  async run(ctx) {
    const { api, app } = await appOf(ctx, this.usage);
    const vars = await api.get<EnvVarView[]>(`/applications/${app.id}/env`);
    ctx.out.result(vars, () => formatEnv(vars) || "Nenhuma variável.");
  },
};

export const envSetCommand: CommandStrategy = {
  usage: "env set <app> KEY=VALUE... [--secret]",
  summary: "Cria ou altera variáveis",
  async run(ctx) {
    const updates = ctx.args.slice(1).map(parsePair);
    if (!updates.length)
      throw new CliError(`Informe ao menos um KEY=VALUE. Uso: capiva ${this.usage}`, 2);
    const { api, app } = await appOf(ctx, this.usage);
    const current = await api.get<EnvVarView[]>(`/applications/${app.id}/env`);
    const vars = await api.put<EnvVarView[]>(`/applications/${app.id}/env`, {
      vars: mergeEnvVars(current, updates, Boolean(ctx.flags.secret)),
    });
    ctx.out.result(
      vars,
      () => `Variáveis atualizadas em ${app.name}: ${updates.map((u) => u.key).join(", ")}.`,
    );
  },
};

export const envUnsetCommand: CommandStrategy = {
  usage: "env unset <app> KEY",
  summary: "Remove uma variável",
  async run(ctx) {
    const key = ctx.args[1];
    if (!key) throw new CliError(`Informe a chave. Uso: capiva ${this.usage}`, 2);
    const { api, app } = await appOf(ctx, this.usage);
    await api.delete(`/applications/${app.id}/env/${encodeURIComponent(key)}`);
    ctx.out.result({ removed: key }, () => `Variável ${key} removida de ${app.name}.`);
  },
};
