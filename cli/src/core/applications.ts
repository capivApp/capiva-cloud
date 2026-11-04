import { CliError } from "@core/errors";
import type { ApiClient } from "@core/api";
import type { CommandContext } from "@core/context";

export interface Project {
  id: string;
  name: string;
}

export interface Application {
  id: string;
  name: string;
  projectId: string;
  source: string;
  observedStatus?: string;
  port?: number | null;
  profile?: string;
  sourceConfig?: Record<string, unknown> | null;
}

export interface Deployment {
  id: string;
  version: string;
  status: string;
  imageRef?: string | null;
  startedAt?: string;
}

export interface ApplicationWithProject extends Application {
  project: string;
}

/** Todas as aplicações da organização da chave (projeto a projeto, endpoints existentes). */
export async function listApplications(api: ApiClient): Promise<ApplicationWithProject[]> {
  const projects = await api.get<Project[]>("/projects");
  const perProject = await Promise.all(
    projects.map(async (p) => (await api.get<Application[]>(`/applications?projectId=${encodeURIComponent(p.id)}`)).map((a) => ({ ...a, project: p.name }))),
  );
  return perProject.flat();
}

/** Resolve `<app>` por id ou por nome. Nome repetido em projetos diferentes pede o id. */
export async function findApplication(api: ApiClient, ref: string): Promise<ApplicationWithProject> {
  const matches = (await listApplications(api)).filter((a) => a.id === ref || a.name === ref);
  if (matches.length > 1) {
    throw new CliError(`Mais de uma aplicação se chama ${ref}. Use o id: ${matches.map((a) => `${a.id} (${a.project})`).join(", ")}.`);
  }
  const [app] = matches;
  if (!app) throw new CliError(`Aplicação não encontrada: ${ref}`);
  return app;
}

/** Primeiro posicional obrigatório: a aplicação. */
export function requireAppArg(ctx: CommandContext, usage: string): string {
  const ref = ctx.args[0];
  if (!ref) throw new CliError(`Informe a aplicação. Uso: capiva ${usage}`, 2);
  return ref;
}

export const TERMINAL_STATUS = new Set(["HEALTHY", "FAILED", "ROLLED_BACK"]);

/** Tabela simples alinhada por coluna. */
export function formatTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const format = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ").trimEnd();
  return [format(headers), ...rows.map(format)].join("\n");
}

/** Pares "rótulo: valor" alinhados. */
export function formatFields(pairs: [string, string][]): string {
  const width = Math.max(...pairs.map(([label]) => label.length)) + 1;
  return pairs.map(([label, value]) => `${`${label}:`.padEnd(width)} ${value}`).join("\n");
}
