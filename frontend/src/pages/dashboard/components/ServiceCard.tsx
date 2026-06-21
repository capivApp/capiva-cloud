import { Activity, Boxes, Cpu, Globe, MemoryStick } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { useMetricsStream } from "@/hooks/useMetricsStream";
import { StatusBadge } from "@/pages/applications/components/StatusBadge";
import { ApplicationActions } from "@/pages/applications/components/ApplicationActions";
import type { Application } from "@/pages/applications/hooks/useApplications";

/**
 * Card de serviço no dashboard: status, réplicas, domínio e uso de CPU/memória
 * AO VIVO (SSE, sem clicar) + menu de ações (parar/reiniciar/remover).
 */
export function ServiceCard({ app, onChange }: { app: Application; onChange?: () => void }) {
  const metrics = useMetricsStream(app.id);
  const domain = (app.sourceConfig?.domain as string) || null;
  const stopped = app.desiredStatus === "stopped";

  return (
    <Card className="transition-colors hover:border-primary/40">
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-start justify-between">
          <Link to={`/applications/${app.id}`} className="flex items-center gap-2 font-semibold hover:text-primary">
            <Boxes className="size-4 text-primary" /> {app.name}
          </Link>
          <div className="flex items-center gap-1">
            <StatusBadge status={app.observedStatus} />
            <ApplicationActions id={app.id} stopped={stopped} onRemoved={onChange} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <Metric icon={Cpu} label="CPU" value={metrics ? `${metrics.cpu}%` : "—"} />
          <Metric icon={MemoryStick} label="Mem" value={metrics ? `${metrics.memoryMb} MB` : "—"} />
          <Metric icon={Activity} label="Req/s" value={metrics ? `${metrics.requestsPerSec}` : "—"} />
          <Metric icon={Activity} label="p95" value={metrics ? `${metrics.latencyP95Ms} ms` : "—"} />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className="rounded bg-muted px-1.5 py-0.5">{app.rolloutStrategy}</span>
          {domain && (
            <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
              <Globe className="size-3" /> {domain}
            </span>
          )}
          {(app.tags ?? []).map((t) => (
            <span key={t} className="rounded-full bg-primary/15 px-2 py-0.5 text-primary">#{t}</span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Cpu; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5">
      <Icon className="size-3.5 text-primary" />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-medium text-foreground">{value}</span>
    </div>
  );
}
