import { ArrowLeft, RotateCcw, Rocket, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useEventSource } from "@/hooks/useEventSource";
import { useMetricsStream } from "@/hooks/useMetricsStream";
import { StatusBadge } from "@/pages/applications/components/StatusBadge";
import { ApplicationActions } from "@/pages/applications/components/ApplicationActions";
import { StrategyDrawer } from "@/pages/applications/detail/StrategyDrawer";
import { VolumesTab } from "@/pages/applications/detail/VolumesTab";
import { EnvVarsTab } from "@/pages/applications/detail/EnvVarsTab";
import { TerminalTab } from "@/pages/applications/detail/TerminalTab";
import { DomainsTab } from "@/pages/applications/detail/DomainsTab";
import { ScalingTab } from "@/pages/applications/detail/ScalingTab";
import { SettingsTab } from "@/pages/applications/detail/SettingsTab";
import { AlertsTab } from "@/pages/applications/detail/AlertsTab";
import { PreviewsTab } from "@/pages/applications/detail/PreviewsTab";
import { PreviewBadge } from "@/pages/applications/components/PreviewBadge";
import { isPreviewDisponivel } from "@/pages/applications/preview";
import { LogsTab } from "@/pages/applications/detail/LogsTab";
import { CapivaJsonNotice } from "@/pages/applications/components/CapivaJsonNotice";
import { useApplication } from "@/pages/applications/hooks/useApplication";
import { DeploymentScanBadge } from "@/pages/applications/components/scan/DeploymentScanBadge";
import { ScanPolicyCard } from "@/pages/applications/components/scan/ScanPolicyCard";
import {
  isDeploymentDestacado,
  readApplicationTab,
  readDeploymentDestacado,
  scrollIntoDeployment,
  writeApplicationTab,
} from "@/pages/applications/detail/deploymentLink";

export function ApplicationDetailPage() {
  const { id = "" } = useParams();
  const { app, deployments, refetchDeployments, deploy, isDeploying, rollback, latestDeploymentId } = useApplication(id);
  const [strategyOpen, setStrategyOpen] = useState(false);
  // A aba fica na URL para o link dos logs filtrados abrir direto nela, e o
  // `?deployment=` do status de commit no Git abre em Deploys com o deploy destacado.
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = readApplicationTab(searchParams);
  const deploymentDestacado = readDeploymentDestacado(searchParams);
  const onTabChange = (next: string) => setSearchParams((current) => writeApplicationTab(current, next), { replace: true });

  const metrics = useMetricsStream(id || null);
  const progress = useEventSource<{ label: string; progress: number; status: string; done?: boolean }>(
    latestDeploymentId ? `/streams/deployments/${latestDeploymentId}` : null,
    "progress",
  );
  const buildLogs = useEventSource<{ logs: string; done?: boolean }>(
    latestDeploymentId ? `/streams/deployments/${latestDeploymentId}/build-logs` : null,
    "build",
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
          {app && <PreviewBadge app={app} />}
          {app?.previewOf && (
            <Link to={`/applications/${app.previewOf.id}`} className="text-sm text-muted-foreground hover:text-foreground">
              de {app.previewOf.name}
            </Link>
          )}
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

      <Tabs value={tab} onValueChange={onTabChange}>
        <TabsList>
          <TabsTrigger value="deploys">Deploys</TabsTrigger>
          <TabsTrigger value="env">Variáveis</TabsTrigger>
          <TabsTrigger value="domains">Domínios</TabsTrigger>
          <TabsTrigger value="scaling">Autoscaling</TabsTrigger>
          <TabsTrigger value="volumes">Volumes</TabsTrigger>
          {app && isPreviewDisponivel(app) && <TabsTrigger value="previews">Previews</TabsTrigger>}
          <TabsTrigger value="terminal">Terminal</TabsTrigger>
          <TabsTrigger value="alerts">Alertas</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="settings">Configurações</TabsTrigger>
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
              {buildLogs?.logs && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Logs de build (Kaniko){buildLogs.done ? " · concluído" : " · ao vivo"}</p>
                  <pre className="max-h-64 overflow-auto rounded-lg bg-background p-3 font-mono text-xs leading-relaxed text-muted-foreground">{buildLogs.logs}</pre>
                </div>
              )}
              {deployments.length === 0 && <p className="text-sm text-muted-foreground">Nenhum deploy ainda.</p>}
              {(() => {
                // Apenas o deploy HEALTHY mais recente serve pods (rolling update); os
                // anteriores ficam "substituídos" (0 pods, mantidos para rollback).
                const activeId = deployments.find((d) => d.status === "HEALTHY")?.id;
                return deployments.map((d) => {
                  const isActive = d.id === activeId;
                  const superseded = d.status === "HEALTHY" && !isActive;
                  const isDestacado = isDeploymentDestacado(d.id, deploymentDestacado);
                  return (
                    <div
                      key={d.id}
                      ref={isDestacado ? scrollIntoDeployment : undefined}
                      aria-current={isDestacado || undefined}
                      className={cn(
                        "flex items-center justify-between rounded-lg border px-3 py-2 text-sm",
                        isActive ? "border-success/40" : "border-border",
                        superseded && "opacity-70",
                        isDestacado && "border-primary bg-primary/5 ring-2 ring-primary/40",
                      )}
                    >
                      <span className="font-mono text-xs">{d.version}</span>
                      <span className="text-muted-foreground">{isActive ? `${d.podCount} pods em execução` : superseded ? "inativo (0 pods)" : `${d.podCount} pods`}</span>
                      <div className="flex items-center gap-2">
                        <DeploymentScanBadge summary={d.scanSummary} version={d.version} defaultOpen={isDestacado} />
                        {isActive ? <Badge variant="success">Ativo</Badge> : superseded ? <Badge variant="muted">Substituído</Badge> : <Badge variant={d.status === "FAILED" ? "danger" : "warning"}>{d.status}</Badge>}
                        {superseded && (
                          <Button variant="ghost" size="sm" onClick={act(() => rollback(d.id), "Restaurando versão…")}>
                            <RotateCcw className="size-3.5" /> Restaurar
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="env" className="pt-5">
          {app && <CapivaJsonNotice sourceConfig={app.sourceConfig} fields={["env", "buildArgs"]} />}
          {app && <EnvVarsTab applicationId={app.id} />}
        </TabsContent>

        <TabsContent value="domains" className="pt-5">
          {app && <CapivaJsonNotice sourceConfig={app.sourceConfig} fields={["domains"]} />}
          {app && <DomainsTab applicationId={app.id} />}
        </TabsContent>

        <TabsContent value="scaling" className="pt-5">
          {app && <CapivaJsonNotice sourceConfig={app.sourceConfig} fields={["scaling", "replicas"]} />}
          {app && <ScalingTab applicationId={app.id} />}
        </TabsContent>

        <TabsContent value="volumes" className="pt-5">
          {app && <CapivaJsonNotice sourceConfig={app.sourceConfig} fields={["volumes"]} />}
          {app && <VolumesTab applicationId={app.id} />}
        </TabsContent>

        <TabsContent value="previews" className="pt-5">
          {app && <PreviewsTab app={app} />}
        </TabsContent>

        <TabsContent value="terminal" className="pt-5">
          {app && <TerminalTab applicationId={app.id} />}
        </TabsContent>

        <TabsContent value="alerts" className="pt-5">
          {app && <AlertsTab applicationId={app.id} />}
        </TabsContent>

        <TabsContent value="settings" className="pt-5">
          {app && (
            <div className="space-y-5">
              <SettingsTab app={app} />
              <ScanPolicyCard app={app} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="logs" className="pt-5">
          {app && <LogsTab applicationId={app.id} />}
        </TabsContent>
      </Tabs>

      {app && <StrategyDrawer open={strategyOpen} onClose={() => setStrategyOpen(false)} applicationId={app.id} current={app.rolloutStrategy} />}
    </div>
  );
}
