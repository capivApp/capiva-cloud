import { Cpu, MemoryStick, Server } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useClusters } from "@/hooks/useClusters";
import { useMonitoring, type NodeMetric } from "@/hooks/useMonitoring";

const pct = (used: number, cap: number) => (cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0);
const fmtCpu = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} vCPU` : `${m}m`);
const fmtMem = (mib: number) => (mib >= 1024 ? `${(mib / 1024).toFixed(1)} GiB` : `${mib} MiB`);

function UsageBar({ label, icon: Icon, used, cap, unit }: { label: string; icon: typeof Cpu; used: number; cap: number; unit: (n: number) => string }) {
  const p = pct(used, cap);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1 text-muted-foreground"><Icon className="size-3.5" /> {label}</span>
        <span className="font-mono">{unit(used)} / {unit(cap)} ({p}%)</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full transition-all", p > 85 ? "bg-danger" : p > 60 ? "bg-warning" : "gradient-bg")} style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

function NodeCard({ node }: { node: NodeMetric }) {
  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="size-4 text-muted-foreground" />
            <span className="font-medium">{node.name}</span>
            <Badge variant={node.role === "control-plane" ? "default" : "muted"}>{node.role}</Badge>
          </div>
          <Badge variant={node.ready ? "success" : "danger"}>{node.ready ? "Ready" : "NotReady"}</Badge>
        </div>
        <UsageBar label="CPU" icon={Cpu} used={node.cpuUsedM} cap={node.cpuCapacityM} unit={fmtCpu} />
        <UsageBar label="Memória" icon={MemoryStick} used={node.memUsedMib} cap={node.memCapacityMib} unit={fmtMem} />
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{node.pods.length} pods</p>
          <div className="max-h-48 space-y-1 overflow-auto">
            {node.pods.map((p) => (
              <div key={`${p.namespace}/${p.name}`} className="flex items-center justify-between rounded border border-border px-2 py-1 text-xs">
                <span className="truncate font-mono" title={`${p.namespace}/${p.name}`}>{p.name}</span>
                <span className="ml-2 shrink-0 text-muted-foreground">{fmtCpu(p.cpuMillicores)} · {fmtMem(p.memoryMib)}</span>
              </div>
            ))}
            {node.pods.length === 0 && <p className="text-xs text-muted-foreground">Sem métricas de pod.</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Monitoring: uso de CPU/memória por nó e pods por nó (metrics-server). */
export function MonitoringPage() {
  const { clusters } = useClusters();
  const [clusterId, setClusterId] = useState<string | null>(null);
  useEffect(() => {
    if (!clusterId && clusters.length > 0) setClusterId(clusters[0].id);
  }, [clusters, clusterId]);

  const { data, isLoading } = useMonitoring(clusterId);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Monitoring</h1>
          <p className="text-sm text-muted-foreground">Uso de recursos por nó e pod (metrics-server).</p>
        </div>
        {clusters.length > 0 && (
          <select className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={clusterId ?? ""} onChange={(e) => setClusterId(e.target.value)}>
            {clusters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {clusters.length === 0 && <Card><CardContent className="pt-5 text-sm text-muted-foreground">Nenhum cluster registrado.</CardContent></Card>}

      {data && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Nós", `${data.nodes.length}`],
            ["Pods", `${data.totals.pods}`],
            ["CPU", `${fmtCpu(data.totals.cpuUsedM)} / ${fmtCpu(data.totals.cpuCapacityM)}`],
            ["Memória", `${fmtMem(data.totals.memUsedMib)} / ${fmtMem(data.totals.memCapacityMib)}`],
          ].map(([label, value]) => (
            <Card key={label}><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-0.5 text-lg font-bold">{value}</p></CardContent></Card>
          ))}
        </div>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Carregando métricas…</p>}
      {data && data.nodes.length === 0 && !isLoading && (
        <Card><CardContent className="pt-5 text-sm text-muted-foreground">Sem métricas. O metrics-server está instalado e pronto no cluster?</CardContent></Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {data?.nodes.map((n) => <NodeCard key={n.name} node={n} />)}
      </div>
    </div>
  );
}
