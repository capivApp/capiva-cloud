import { Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useCosts } from "@/hooks/useCosts";
import { formatCustoMensal } from "@/lib/finops";

/** Card do dashboard: custo mensal estimado da organização e por ambiente. */
export function CostCard() {
  const { relatorio, isLoading } = useCosts();
  if (isLoading || !relatorio) return null;

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-medium"><Wallet className="size-4" /> Custo mensal estimado</p>
          <span className="text-lg font-bold">{formatCustoMensal(relatorio.total, relatorio.currency)}</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {relatorio.ambientes.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded border border-border px-2 py-1 text-xs">
              <span className="font-medium">{a.name}</span>
              <span className="text-muted-foreground">{formatCustoMensal(a.custo, relatorio.currency)}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Estimativa pela tabela de preços da plataforma. Não é cobrança.</p>
      </CardContent>
    </Card>
  );
}
