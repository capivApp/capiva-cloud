import { findApplication, requireAppArg, type Deployment } from "@core/applications";
import { CliError } from "@core/errors";
import type { CommandStrategy } from "@core/context";

/** Alvo padrão: o deploy saudável com imagem mais recente DEPOIS do atual (lista vem do mais novo). */
export function pickRollbackTarget(deployments: Deployment[]): Deployment {
  const restorable = deployments.filter((d) => d.status === "HEALTHY" && d.imageRef);
  const current = deployments.find((d) => d.status === "HEALTHY");
  const target = restorable.find((d) => d.id !== current?.id);
  if (!target) throw new CliError("Não há deploy anterior para restaurar.");
  return target;
}

export const rollbackCommand: CommandStrategy = {
  usage: "rollback <app> [deployId]",
  summary: "Volta para um deploy anterior (sem rebuild)",
  async run(ctx) {
    const api = await ctx.api();
    const app = await findApplication(api, requireAppArg(ctx, this.usage));
    const deploymentId = ctx.args[1] ?? pickRollbackTarget(await api.get<Deployment[]>(`/applications/${app.id}/deployments`)).id;
    const rollback = await api.post<Deployment>(`/applications/${app.id}/rollback`, { deploymentId });
    ctx.out.result(rollback, () => `Rollback de ${app.name} para o deploy ${deploymentId} iniciado (${rollback.id}).`);
  },
};
