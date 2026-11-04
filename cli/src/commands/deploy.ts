import { findApplication, requireAppArg, TERMINAL_STATUS, type Deployment } from "@core/applications";
import { readSse } from "@core/sse";
import type { ApiClient } from "@core/api";
import type { CommandContext, CommandStrategy } from "@core/context";

interface ProgressEvent {
  label?: string;
  status?: string;
  progress?: number;
  done?: boolean;
}

const isFinished = (event: { event: string; data: unknown }): boolean => {
  const data = (event.data ?? {}) as ProgressEvent;
  return Boolean(data.done) || (event.event === "snapshot" && TERMINAL_STATUS.has(data.status ?? ""));
};

/** Acompanha `/streams/deployments/:id` (SSE) até o deploy terminar. Devolve o status final. */
async function followDeployment(api: ApiClient, ctx: CommandContext, deploymentId: string): Promise<string> {
  let status = "QUEUED";
  for await (const event of readSse(await api.stream(`/streams/deployments/${deploymentId}`))) {
    const data = (event.data ?? {}) as ProgressEvent;
    status = data.status ?? status;
    if (data.label && !ctx.flags.json) ctx.out.line(`${String(data.progress ?? "").padStart(3)}%  ${data.label}`);
    if (isFinished(event)) break;
  }
  return status;
}

export const deployCommand: CommandStrategy = {
  usage: "deploy <app> [--wait]",
  summary: "Dispara um deploy (com --wait, acompanha até o fim)",
  async run(ctx) {
    const api = await ctx.api();
    const app = await findApplication(api, requireAppArg(ctx, this.usage));
    const deployment = await api.post<Deployment>(`/applications/${app.id}/deploy`);
    const humanStart = () => `Deploy ${deployment.id} enfileirado para ${app.name}.`;
    if (!ctx.flags.wait) {
      ctx.out.result(deployment, humanStart);
      return 0;
    }
    if (!ctx.flags.json) ctx.out.line(humanStart());
    const status = await followDeployment(api, ctx, deployment.id);
    if (ctx.flags.json) ctx.out.result({ ...deployment, status }, () => "");
    return status === "HEALTHY" ? 0 : 1;
  },
};
