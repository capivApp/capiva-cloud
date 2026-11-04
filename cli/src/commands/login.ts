import { createApiClient } from "@core/api";
import { normalizeApiUrl } from "@core/config";
import { CliError } from "@core/errors";
import type { CommandContext, CommandStrategy } from "@core/context";

const readFlag = (ctx: CommandContext, flag: string, question: string): string => {
  const value = ctx.flags[flag];
  if (typeof value === "string" && value.trim()) return value.trim();
  const answer = ctx.deps.prompt(question)?.trim();
  if (!answer) throw new CliError(`Informe --${flag}.`, 2);
  return answer;
};

const requireApiKey = (token: string): void => {
  if (token.startsWith("cap_")) return;
  throw new CliError("A chave de API começa com cap_. Crie uma em Organização, API Keys.");
};

/** `capiva login`: valida a chave na API e grava em ~/.config/capiva/config.json (600). */
export const loginCommand: CommandStrategy = {
  usage: "login [--token cap_...] [--api-url https://...]",
  summary: "Grava a chave de API e a URL do Capiva",
  async run(ctx) {
    const apiUrl = normalizeApiUrl(readFlag(ctx, "api-url", "URL do Capiva (ex.: https://capiva.suaempresa.com): "));
    const token = readFlag(ctx, "token", "Chave de API (cap_...): ");
    requireApiKey(token);
    await createApiClient({ token, apiUrl }, ctx.deps.fetch).get("/projects");
    await ctx.deps.configStore.save({ token, apiUrl });
    ctx.out.result({ apiUrl, configPath: ctx.deps.configStore.path }, () => `Login feito em ${apiUrl}. Configuração em ${ctx.deps.configStore.path}.`);
  },
};
