import { findApplication, requireAppArg } from "@core/applications";
import { readSse } from "@core/sse";
import type { CommandContext, CommandStrategy } from "@core/context";

interface LogLine {
  ts: string;
  line: string;
}

const keyOf = (l: LogLine) => `${l.ts}|${l.line}`;

const printLine = (ctx: CommandContext, l: LogLine): void => {
  if (ctx.flags.json) return ctx.out.line(JSON.stringify(l));
  ctx.out.line(l.line);
};

/**
 * `/streams/applications/:id/logs` reenvia a janela recente a cada poucos segundos.
 * Sem -f, imprime a primeira janela e sai; com -f, segue imprimindo só as linhas novas.
 */
export const logsCommand: CommandStrategy = {
  usage: "logs <app> [-f]",
  summary: "Mostra os logs da aplicação (-f segue em tempo real)",
  async run(ctx) {
    const api = await ctx.api();
    const app = await findApplication(api, requireAppArg(ctx, this.usage));
    const abort = new AbortController();
    let seen = new Set<string>();
    for await (const event of readSse(
      await api.stream(`/streams/applications/${app.id}/logs`, abort.signal),
    )) {
      const batch = Array.isArray(event.data) ? (event.data as LogLine[]) : [];
      batch.filter((l) => !seen.has(keyOf(l))).forEach((l) => printLine(ctx, l));
      seen = new Set(batch.map(keyOf));
      if (!ctx.flags.follow) break;
    }
    abort.abort();
  },
};
