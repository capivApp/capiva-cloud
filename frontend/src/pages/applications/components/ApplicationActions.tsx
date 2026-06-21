import { MoreVertical, Play, RotateCw, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useApplications } from "@/pages/applications/hooks/useApplications";

/** Menu de ações de uma aplicação: parar / iniciar / reiniciar / remover. */
export function ApplicationActions({ id, stopped, onRemoved }: { id: string; stopped?: boolean; onRemoved?: () => void }) {
  const { stop, start, restart, remove } = useApplications();

  const run = (fn: () => Promise<unknown>, ok: string) => async () => {
    try {
      await fn();
      toast.success(ok);
      onRemoved?.();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Ações">
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {stopped ? (
          <DropdownMenuItem onClick={run(() => start(id), "Aplicação iniciada")}>
            <Play className="size-4" /> Iniciar
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={run(() => stop(id), "Aplicação parada")}>
            <Square className="size-4" /> Parar
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={run(() => restart(id), "Reiniciando…")}>
          <RotateCw className="size-4" /> Reiniciar
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onClick={run(() => remove(id), "Aplicação removida")}>
          <Trash2 className="size-4" /> Remover
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
