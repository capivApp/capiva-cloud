import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useApplication } from "@/pages/applications/hooks/useApplication";

const STRATEGIES = [
  { id: "ROLLING", label: "Rolling Update", desc: "Substituição gradual dos pods" },
  { id: "BLUE_GREEN", label: "Blue/Green", desc: "Troca instantânea após validação" },
  { id: "CANARY", label: "Canary", desc: "Tráfego progressivo com análise" },
];

export function StrategyDrawer({ open, onClose, applicationId, current }: { open: boolean; onClose: () => void; applicationId: string; current: string }) {
  const { updateStrategy } = useApplication(applicationId);
  const [strategy, setStrategy] = useState(current);
  const [initialTraffic, setInitialTraffic] = useState(10);
  const [increment, setIncrement] = useState(20);
  const [intervalMinutes, setIntervalMinutes] = useState(5);
  const [autoRollback, setAutoRollback] = useState(true);

  async function save() {
    try {
      await updateStrategy({ strategy, config: { initialTraffic, increment, intervalMinutes, autoRollback } });
      toast.success("Estratégia atualizada");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Estratégia de deploy"
      description="Como novas versões substituem as antigas — sem downtime."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="gradient" onClick={save}>Salvar</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          {STRATEGIES.map((s) => (
            <button
              key={s.id}
              onClick={() => setStrategy(s.id)}
              className={cn(
                "flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                strategy === s.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/40",
              )}
            >
              <span className="font-medium">{s.label}</span>
              <span className="text-xs text-muted-foreground">{s.desc}</span>
            </button>
          ))}
        </div>

        {strategy === "CANARY" && (
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3">
            <div className="space-y-1.5"><Label>Tráfego inicial (%)</Label><Input type="number" value={initialTraffic} onChange={(e) => setInitialTraffic(+e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Incremento (%)</Label><Input type="number" value={increment} onChange={(e) => setIncrement(+e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Intervalo (min)</Label><Input type="number" value={intervalMinutes} onChange={(e) => setIntervalMinutes(+e.target.value)} /></div>
          </div>
        )}

        {strategy !== "ROLLING" && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={autoRollback} onChange={(e) => setAutoRollback(e.target.checked)} className="accent-primary" />
            Rollback automático ao detectar erros/latência
          </label>
        )}
      </div>
    </Drawer>
  );
}
