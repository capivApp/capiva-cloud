import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

interface ReleaseRow { id: string; applicationName: string; version: string; status: string; durationSeconds: number | null; startedAt: string }
interface ReleaseSummary { totalDeploys: number; successRate: number; rollbacks: number; avgDeploySeconds: number | null; recent: ReleaseRow[] }

export function DeploysPage() {
  const projectId = useWorkspaceStore((s) => s.projectId);
  const { data } = useQuery({
    queryKey: ["releases", projectId],
    queryFn: () => api.get<ReleaseSummary>(`/platform/releases?projectId=${projectId}`),
    enabled: Boolean(projectId),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Deploys</h1>
        <p className="text-sm text-muted-foreground">Rastreabilidade e histórico de releases do projeto.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Total" value={data?.totalDeploys ?? 0} />
        <Stat label="Sucesso" value={`${data?.successRate ?? 0}%`} />
        <Stat label="Rollbacks" value={data?.rollbacks ?? 0} />
        <Stat label="Tempo médio" value={data?.avgDeploySeconds != null ? `${data.avgDeploySeconds}s` : "—"} />
      </div>

      <Card>
        <CardContent className="space-y-2 pt-5">
          {(data?.recent ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhum deploy ainda.</p>}
          {(data?.recent ?? []).map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
              <span className="font-medium">{r.applicationName}</span>
              <span className="font-mono text-xs text-muted-foreground">{r.version}</span>
              <span className="text-xs text-muted-foreground">{r.durationSeconds != null ? `${r.durationSeconds}s` : "—"}</span>
              <Badge variant={r.status === "HEALTHY" ? "success" : r.status === "FAILED" ? "danger" : "warning"}>{r.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold tracking-tight">{value}</p></CardContent></Card>;
}
