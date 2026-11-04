import { zodResolver } from "@hookform/resolvers/zod";
import { BellRing, Plus, Power, Trash2 } from "lucide-react";
import { useForm, useWatch, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import {
  ALERT_METRICS,
  ALERT_OPERATORS,
  useAlertRules,
  type AlertMetric,
  type AlertOperator,
  type AlertRule,
} from "@/pages/applications/hooks/useAlertRules";

const METRIC_INFO: Record<AlertMetric, { label: string; unit: string; hint?: string }> = {
  CPU: { label: "CPU", unit: "%" },
  MEMORY: { label: "Memória", unit: " MiB" },
  ERROR_RATE_5XX: { label: "Taxa de 5xx", unit: "%", hint: "Requer domínio configurado." },
  LATENCY_P95: { label: "Latência p95", unit: " ms", hint: "Requer domínio configurado." },
};

const OPERATOR_LABELS: Record<AlertOperator, string> = { GT: "acima de", LT: "abaixo de" };

const STATE_BADGE: Record<"OK" | "FIRING" | "OFF", { label: string; variant: "success" | "danger" | "muted" }> = {
  OK: { label: "Normal", variant: "success" },
  FIRING: { label: "Disparado", variant: "danger" },
  OFF: { label: "Desligado", variant: "muted" },
};

const schema = z.object({
  metric: z.enum(ALERT_METRICS, "Escolha a métrica."),
  operator: z.enum(ALERT_OPERATORS, "Escolha acima ou abaixo."),
  threshold: z.number("Informe o limite.").min(0, "O limite não pode ser negativo."),
  windowMinutes: z
    .number("Informe a janela em minutos.")
    .int("Use minutos inteiros.")
    .min(1, "A janela mínima é de 1 minuto.")
    .max(60, "A janela máxima é de 60 minutos."),
});
type FormData = z.infer<typeof schema>;

const DEFAULTS: FormData = { metric: "CPU", operator: "GT", threshold: 80, windowMinutes: 5 };

const formatValue = (value: number, unit: string) => `${Math.round(value * 10) / 10}${unit}`;

const stateOf = (rule: AlertRule) => (rule.enabled ? rule.state : "OFF");

interface ApiIssue {
  path: (string | number)[];
  message: string;
}

/** Itens de validação devolvidos pela API (422), para voltar ao campo certo. */
const readIssues = (error: unknown): ApiIssue[] => {
  if (!(error instanceof ApiError)) return [];
  return ((error.body as { issues?: ApiIssue[] } | undefined)?.issues ?? []).filter((i) => i.path.length > 0);
};

function RuleRow({ rule, onToggle, onRemove }: { rule: AlertRule; onToggle: () => void; onRemove: () => void }) {
  const info = METRIC_INFO[rule.metric];
  const badge = STATE_BADGE[stateOf(rule)];
  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm">
      <div className="flex items-center gap-2">
        <BellRing className="size-4 text-muted-foreground" />
        <span className="font-medium">{info.label}</span>
        <span className="text-muted-foreground">
          {OPERATOR_LABELS[rule.operator]} {formatValue(rule.threshold, info.unit)} em {rule.windowMinutes} min
        </span>
      </div>
      <div className="flex items-center gap-2">
        {rule.lastValue !== null && <span className="font-mono text-xs text-muted-foreground">{formatValue(rule.lastValue, info.unit)}</span>}
        <Badge variant={badge.variant}>{badge.label}</Badge>
        <Button variant="ghost" size="icon" onClick={onToggle} title={rule.enabled ? "Desligar" : "Ligar"}>
          <Power className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onRemove} title="Remover">
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Aba "Alertas" do detalhe da aplicação. Regras por métrica (CPU, memória, 5xx,
 * latência p95) com limite e janela. A notificação vai para os canais que escutam
 * os eventos de alerta, configurados na tela de notificações.
 */
export function AlertsTab({ applicationId }: { applicationId: string }) {
  const { rules, isLoading, create, isCreating, update, remove } = useAlertRules(applicationId);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    control,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: DEFAULTS });

  const metric = useWatch({ control, name: "metric" });
  const info = METRIC_INFO[metric];

  const onSubmit = async (data: FormData) => {
    try {
      await create(data);
      reset(DEFAULTS);
      toast.success("Regra de alerta criada.");
    } catch (e) {
      readIssues(e).forEach((i) => setError(i.path.join(".") as FieldPath<FormData>, { message: i.message }));
      toast.error((e as Error).message);
    }
  };

  const toggle = async (rule: AlertRule) => {
    try {
      await update({ id: rule.id, enabled: !rule.enabled });
      toast.success(rule.enabled ? "Regra desligada." : "Regra ligada.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const del = async (id: string) => {
    try {
      await remove(id);
      toast.success("Regra removida.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-3 pt-5">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando regras…</p>}
          {!isLoading && rules.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma regra de alerta.</p>}
          {rules.map((r) => (
            <RuleRow key={r.id} rule={r} onToggle={() => toggle(r)} onRemove={() => del(r.id)} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <p className="text-sm font-medium">Nova regra</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Métrica</Label>
                <select className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" {...register("metric")}>
                  {ALERT_METRICS.map((m) => (
                    <option key={m} value={m}>{METRIC_INFO[m].label}</option>
                  ))}
                </select>
                {errors.metric && <p className="text-xs text-destructive">{errors.metric.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Condição</Label>
                <select className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" {...register("operator")}>
                  {ALERT_OPERATORS.map((o) => (
                    <option key={o} value={o}>{OPERATOR_LABELS[o]}</option>
                  ))}
                </select>
                {errors.operator && <p className="text-xs text-destructive">{errors.operator.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Limite ({info.unit.trim()})</Label>
                <Input type="number" step="any" {...register("threshold", { valueAsNumber: true })} />
                {errors.threshold && <p className="text-xs text-destructive">{errors.threshold.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Janela (min)</Label>
                <Input type="number" {...register("windowMinutes", { valueAsNumber: true })} />
                {errors.windowMinutes && <p className="text-xs text-destructive">{errors.windowMinutes.message}</p>}
              </div>
            </div>
            {info.hint && <p className="text-xs text-muted-foreground">{info.hint}</p>}
            <p className="text-xs text-muted-foreground">Os avisos vão para os canais com os eventos de alerta marcados em Notificações.</p>
            <Button type="submit" variant="gradient" size="sm" disabled={isCreating}>
              <Plus className="size-4" /> Criar regra
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
