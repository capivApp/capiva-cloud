import {
  findApplication,
  formatFields,
  formatTable,
  listApplications,
  requireAppArg,
  type Deployment,
} from "@core/applications";
import type { CommandStrategy } from "@core/context";

export const appsListCommand: CommandStrategy = {
  usage: "apps list",
  summary: "Lista as aplicações da organização",
  async run(ctx) {
    const apps = await listApplications(await ctx.api());
    ctx.out.result(apps, () =>
      formatTable(
        ["NOME", "PROJETO", "STATUS", "ORIGEM", "ID"],
        apps.map((a) => [a.name, a.project, a.observedStatus ?? "", a.source, a.id]),
      ),
    );
  },
};

const describeDeploy = (d: Deployment | undefined): string =>
  d ? `${d.version} (${d.status}${d.startedAt ? `, ${d.startedAt}` : ""})` : "nenhum";

export const appsStatusCommand: CommandStrategy = {
  usage: "apps status <app>",
  summary: "Mostra o estado da aplicação e o último deploy",
  async run(ctx) {
    const api = await ctx.api();
    const ref = await findApplication(api, requireAppArg(ctx, this.usage));
    const [app, deployments] = await Promise.all([
      api.get<typeof ref>(`/applications/${ref.id}`),
      api.get<Deployment[]>(`/applications/${ref.id}/deployments`),
    ]);
    const lastDeploy = deployments[0];
    ctx.out.result({ ...app, project: ref.project, lastDeploy: lastDeploy ?? null }, () =>
      formatFields([
        ["Aplicação", `${app.name} (${app.id})`],
        ["Projeto", ref.project],
        ["Status", app.observedStatus ?? ""],
        ["Origem", app.source],
        ["Porta", String(app.port ?? "")],
        ["Perfil", app.profile ?? ""],
        ["Último deploy", describeDeploy(lastDeploy)],
      ]),
    );
  },
};
