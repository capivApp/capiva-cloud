import { ArrowLeft, RotateCcw, Rocket, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEventSource } from "@/hooks/useEventSource";
import { useMetricsStream } from "@/hooks/useMetricsStream";
import { StatusBadge } from "@/pages/applications/components/StatusBadge";
import { ApplicationActions } from "@/pages/applications/components/ApplicationActions";
import { StrategyDrawer } from "@/pages/applications/detail/StrategyDrawer";
import { VolumesTab } from "@/pages/applications/detail/VolumesTab";
import { useApplication } from "@/pages/applications/hooks/useApplication";

interface LogLine { ts: string; line: string }

export function ApplicationDetailPage() {
  const { id = "" } = useParams();
  const { app, deployments, refetchDeployments, deploy, isDeploying, rollback, latestDeploymentId } = useApplication(id);
  const [strategyOpen, setStrategyOpen] = useState(false);

  const metrics = useMetricsStream(id || null);
  const logs = useEventSource<LogLine[]>(id ? `/streams/applications/${id}/logs` : null, "logs");
  const progress = useEventSource<{ label: string; progress: number; status: string; done?: boolean }>(
    latestDeploymentId ? `/streams/deployments/${latestDeploymentId}` : null,
    "progress",
  );

  // Sem polling: quando o SSE de progresso conclui, re-busca a lista de deploys.
  useEffect(() => {
    if (progress?.done) refetchDeployments();
  }, [progress?.done, refetchDeployments]);

  const act = (fn: () => Promise<unknown>, ok: string) => async () => {
    try {
      await fn();
      toast.success(ok);
      refetchDeployments();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link to="/applications" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Aplicações
      </Link>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{app?.name ?? id}</h1>
          {app && <StatusBadge status={app.observedStatus} />}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setStrategyOpen(true)}><Settings2 className="size-4" /> Estratégia</Button>
          <Button variant="gradient" onClick={act(deploy, "Deploy disparado")} disabled={isDeploying}><Rocket className="size-4" /> Deploy</Button>
          {app && <ApplicationActions id={app.id} stopped={app.desiredStatus === "stopped"} />}
        </div>
      </div>

      {/* Métricas inline ao vivo (SSE) */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          ["CPU", metrics ? `${metrics.cpu}%` : "—"],
          ["Memória", metrics ? `${metrics.memoryMb} MB` : "—"],
          ["Requests/s", metrics ? `${metrics.requestsPerSec}` : "—"],
          ["Latência p95", metrics ? `${metrics.latencyP95Ms} ms` : "—"],
          ["Erros", metrics ? `${metrics.errorRate}` : "—"],
        ].map(([label, value]) => (
          <Card key={label}><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-0.5 text-xl font-bold">{value}</p></CardContent></Card>
        ))}
      </div>

      <Tabs defaultValue="deploys">
        <TabsList>
          <TabsTrigger value="deploys">Deploys</TabsTrigger>
          <TabsTrigger value="volumes">Volumes</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="deploys" className="pt-5">
          <Card>
            <CardContent className="space-y-4 pt-5">
              {progress && !progress.done && (
                <div className="flex items-center gap-3">
                  <span className="w-40 text-sm text-muted-foreground">{progress.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full gradient-bg transition-all" style={{ width: `${progress.progress}%` }} />
                  </div>
                  <span className="w-10 text-right text-xs text-muted-foreground">{progress.progress}%</span>
                </div>
              )}
              {deployments.length === 0 && <p className="text-sm text-muted-foreground">Nenhum deploy ainda.</p>}
              {deployments.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <span className="font-mono text-xs">{d.version}</span>
                  <span className="text-muted-foreground">{d.podCount} pods</span>
                  <div className="flex items-center gap-2">
                    <Badge variant={d.status === "HEALTHY" ? "success" : d.status === "FAILED" ? "danger" : "warning"}>{d.status}</Badge>
                    {d.status === "HEALTHY" && (
                      <Button variant="ghost" size="sm" onClick={act(() => rollback(d.id), "Restaurando versão…")}>
                        <RotateCcw className="size-3.5" /> Restaurar
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="volumes" className="pt-5">
          {app && <VolumesTab applicationId={app.id} />}
        </TabsContent>

        <TabsContent value="logs" className="pt-5">
          <Card>
            <CardContent className="pt-5">
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 text-success"><span className="size-1.5 animate-pulse rounded-full bg-current" /> Live</span>
              </div>
              <pre className="max-h-96 overflow-auto rounded-lg bg-background p-4 font-mono text-xs leading-relaxed text-muted-foreground">
                {(logs ?? []).map((l) => l.line).join("\n") || "Aguardando logs…"}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {app && <StrategyDrawer open={strategyOpen} onClose={() => setStrategyOpen(false)} applicationId={app.id} current={app.rolloutStrategy} />}
    </div>
  );
}
