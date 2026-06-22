import { Activity, Boxes, Database, GitBranch, Layers, Server, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { usePlatformOverview } from "@/hooks/usePlatformOverview";

const statusVariant = (s: string) => (s === "running" ? "success" : s === "error" ? "danger" : "warning");
const deployVariant = (s: string) => (s === "HEALTHY" ? "success" : s === "FAILED" ? "danger" : "warning");

/**
 * Banda de visão geral da organização no dashboard: contagens de recursos,
 * saúde das aplicações, frota de clusters e atividade recente (deploys/audits).
 * Dados de `GET /platform/overview`.
 */
export function OverviewSection() {
  const { overview, isLoading } = usePlatformOverview();
  if (isLoading || !overview) return null;

  const { counts, health, cluster, recentDeploys, recentAudits } = overview;
  const stats = [
    { label: "Aplicações", value: counts.applications, icon: Boxes },
    { label: "Bancos", value: counts.databases, icon: Database },
    { label: "Workers", value: counts.workers, icon: Layers },
    { label: "Ambientes", value: counts.environments, icon: GitBranch },
    { label: "Clusters", value: `${cluster.connected}/${cluster.totalClusters}`, icon: Server },
    { label: "Nós", value: cluster.totalNodes, icon: ShieldCheck },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-muted-foreground"><s.icon className="size-4" /><span className="text-xs">{s.label}</span></div>
              <p className="mt-0.5 text-2xl font-bold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {Object.keys(health).length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Saúde das aplicações:</span>
          {Object.entries(health).map(([status, n]) => (
            <Badge key={status} variant={statusVariant(status)}>{status}: {n}</Badge>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-2 pt-5">
            <p className="flex items-center gap-2 text-sm font-medium"><Activity className="size-4" /> Deploys recentes</p>
            {recentDeploys.length === 0 && <p className="text-xs text-muted-foreground">Nenhum deploy ainda.</p>}
            {recentDeploys.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded border border-border px-2 py-1 text-xs">
                <span className="font-medium">{d.application}</span>
                <span className="font-mono text-muted-foreground">{d.version}</span>
                <Badge variant={deployVariant(d.status)}>{d.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 pt-5">
            <p className="text-sm font-medium">Atividade recente</p>
            {recentAudits.length === 0 && <p className="text-xs text-muted-foreground">Sem registros.</p>}
            {recentAudits.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded border border-border px-2 py-1 text-xs">
                <span className="font-mono">{a.event}</span>
                <span className="text-muted-foreground">{new Date(a.at).toLocaleString()}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
