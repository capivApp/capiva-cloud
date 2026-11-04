import { Wallet } from "lucide-react";
import { formatCustoMensal, type FaixaDeCusto } from "@/lib/finops";
import { cn } from "@/lib/utils";

/** Custo mensal estimado em linha (listas de aplicações e projetos). */
export function CustoIndicador({ custo, currency, className }: { custo?: FaixaDeCusto; currency?: string; className?: string }) {
  if (!custo || !currency) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground", className)} title="Custo mensal estimado">
      <Wallet className="size-3" /> {formatCustoMensal(custo, currency)}
    </span>
  );
}
