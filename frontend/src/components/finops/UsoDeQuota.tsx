import {
  QUOTA_RECURSOS,
  RECURSOS_DE_QUOTA,
  formatRecurso,
  type RecursoDeQuota,
} from "@/lib/finops";
import type { QuotaDoAmbiente } from "@/hooks/useEnvironmentQuota";
import { cn } from "@/lib/utils";

const corDaBarra = (percentual: number): string => {
  if (percentual >= 100) return "bg-destructive";
  if (percentual >= 80) return "bg-amber-500";
  return "bg-primary";
};

function LinhaDeUso({ recurso, quota }: { recurso: RecursoDeQuota; quota: QuotaDoAmbiente }) {
  const limite = quota.limite[recurso];
  const uso = quota.uso[recurso];
  const percentual = limite ? Math.min(100, Math.round((uso / limite) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{RECURSOS_DE_QUOTA[recurso].rotulo}</span>
        <span className="font-medium">
          {formatRecurso(recurso, uso)} /{" "}
          {limite === null ? "sem limite" : formatRecurso(recurso, limite)}
        </span>
      </div>
      {limite !== null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", corDaBarra(percentual))}
            style={{ width: `${percentual}%` }}
          />
        </div>
      )}
    </div>
  );
}

/** Uso da quota do ambiente: usado / limite por recurso. */
export function UsoDeQuota({ quota }: { quota: QuotaDoAmbiente }) {
  return (
    <div className="space-y-2">
      {QUOTA_RECURSOS.map((recurso) => (
        <LinhaDeUso key={recurso} recurso={recurso} quota={quota} />
      ))}
    </div>
  );
}
