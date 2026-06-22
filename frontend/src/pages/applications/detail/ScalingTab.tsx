import { Activity, Gauge, Minus, Plus, Power, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEventSource } from "@/hooks/useEventSource";
import { useScaling, type ScalingMetric, type ScalingStatus } from "@/pages/applications/hooks/useScaling";

const metricLabel: Record<ScalingMetric, string> = { CPU: "CPU (%)", MEMORY: "Memória (%)", REQUESTS: "Requests/s" };

/**
 * Aba "Autoscaling" do detalhe da app. Mostra o estado vivo do HPA (réplicas
 * atuais/desejadas, métrica e valor vs. alvo que dispara o scale, via SSE),
 * permite configurar a política (min/max/métrica/alvo) e escalar manualmente.
 */
export function ScalingTab({ applicationId }: { applicationId: string }) {
  const { policy, isLoading, setPolicy, isSaving, disable, scale, isScaling } = useScaling(applicationId);
  const status = useEventSource<ScalingStatus>(`/streams/applications/${applicationId}/scaling`, "scaling");

  const [min, setMin] = useState(2);
  const [max, setMax] = useState(10);
  const [metric, setMetric] = useState<ScalingMetric>("CPU");
  const [target, setTarget] = useState(70);

  useEffect(() => {
    if (policy) {
      setMin(policy.minReplicas);
      setMax(policy.maxReplicas);
      setMetric(policy.metric);
      setTarget(policy.target);
    }
  }, [policy]);

  const active = status?.autoscalerActive ?? Boolean(policy);
  const current = status?.currentReplicas ?? 0;

  const save = async () => {
    if (max < min) return toast.error("Máximo deve ser ≥ mínimo.");
    try {
      await setPolicy({ minReplicas: min, maxReplicas: max, metric, target });
      toast.success("Autoscaling configurado. Reconciliando…");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const turnOff = async () => {
    try {
      await disable();
      toast.success("Autoscaling desativado.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const manualScale = async (replicas: number) => {
    if (replicas < 0) return;
    try {
      const r = await scale(replicas);
      toast.success(`Escalado para ${replicas} réplica(s).${r.autoscalerActive ? " O HPA pode sobrescrever." : ""}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      {/* Observabilidade ao vivo (SSE) */}
      <Card>
        <CardContent className="space-y-3 pt-5">
          <p className="flex items-center gap-2 text-sm font-medium"><Activity className="size-4" /> Estado do autoscaling</p>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ["Réplicas atuais", String(current)],
              ["Desejadas", status?.hpa?.desiredReplicas != null ? String(status.hpa.desiredReplicas) : "—"],
              ["Min / Max", active ? `${status?.hpa?.minReplicas ?? min} / ${status?.hpa?.maxReplicas ?? max}` : "—"],
              ["Métrica", active ? `${status?.hpa?.metric ?? metric}` : "—"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-0.5 text-lg font-bold">{value}</p>
              </div>
            ))}
          </div>
          {active && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant={status?.hpa?.exists ? "success" : "warning"}>{status?.hpa?.exists ? "HPA ativo" : "aguardando HPA"}</Badge>
              {status?.hpa?.currentMetricValue && (
                <span>Atual <strong className="text-foreground">{status.hpa.currentMetricValue}</strong> · alvo <strong className="text-foreground">{status?.hpa?.targetMetricValue ?? "—"}</strong></span>
              )}
              {status?.hpa?.lastScaleTime && <span>· último scale {new Date(status.hpa.lastScaleTime).toLocaleString()}</span>}
            </div>
          )}
          {/* Escala manual */}
          <div className="flex items-center gap-2 border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">Escala manual:</span>
            <Button variant="outline" size="icon" onClick={() => manualScale(Math.max(0, current - 1))} disabled={isScaling}><Minus className="size-4" /></Button>
            <span className="w-8 text-center text-sm font-medium">{current}</span>
            <Button variant="outline" size="icon" onClick={() => manualScale(current + 1)} disabled={isScaling}><Plus className="size-4" /></Button>
            {active && <span className="text-xs text-warning">O autoscaler pode sobrescrever — desative para fixar.</span>}
          </div>
        </CardContent>
      </Card>

      {/* Configuração da política */}
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-medium"><Gauge className="size-4" /> Política de autoscaling (HPA)</p>
            {active && <Button variant="outline" size="sm" onClick={turnOff}><Power className="size-3.5" /> Desativar</Button>}
          </div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="space-y-1.5"><Label className="text-xs">Mín. réplicas</Label><Input type="number" min={1} value={min} onChange={(e) => setMin(+e.target.value)} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Máx. réplicas</Label><Input type="number" min={1} value={max} onChange={(e) => setMax(+e.target.value)} /></div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Métrica</Label>
                  <select className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={metric} onChange={(e) => setMetric(e.target.value as ScalingMetric)}>
                    {(Object.keys(metricLabel) as ScalingMetric[]).map((m) => <option key={m} value={m}>{metricLabel[m]}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5"><Label className="text-xs">Alvo</Label><Input type="number" min={1} value={target} onChange={(e) => setTarget(+e.target.value)} /></div>
              </div>
              <p className="text-xs text-muted-foreground">Disponível para estratégia ROLLING. REQUESTS requer prometheus-adapter no cluster.</p>
              <Button variant="gradient" size="sm" onClick={save} disabled={isSaving}><Save className="size-4" /> Salvar e aplicar HPA</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
