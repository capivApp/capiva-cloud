import { AlertTriangle, Cpu, Database, MemoryStick, Server } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useClusters } from "@/hooks/useClusters";
import { useMonitoring, type NodeMetric } from "@/hooks/useMonitoring";
import { useClusterResources, type ClusterPod, type DatabaseView } from "@/hooks/useClusterResources";

const fmtPorts = (ports: { containerPort: number; protocol: string }[]) =>
  ports.length ? ports.map((p) => `${p.containerPort}/${p.protocol}`).join(", ") : "—";

const phaseBadge = (phase: string, ready: boolean): "success" | "warning" | "danger" =>
  ready && phase === "Running" ? "success" : phase === "Running" || phase === "Pending" ? "warning" : "danger";

const pct = (used: number, cap: number) => (cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0);
const fmtCpu = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} vCPU` : `${m}m`);
const fmtMem = (mib: number) => (mib >= 1024 ? `${(mib / 1024).toFixed(1)} GiB` : `${mib} MiB`);
const fmtBps = (bps: number) => (bps >= 1e6 ? `${(bps / 1e6).toFixed(1)} MB/s` : bps >= 1e3 ? `${(bps / 1e3).toFixed(0)} KB/s` : `${Math.round(bps)} B/s`);

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
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {node.internalIP && <span className="font-mono">{node.internalIP}</span>}
          {node.kubeletVersion && <span>kubelet {node.kubeletVersion}</span>}
        </div>
        {node.warnings.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {node.warnings.map((w) => (
              <Badge key={w} variant="warning" className="gap-1"><AlertTriangle className="size-3" />{w}</Badge>
            ))}
          </div>
        )}
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
  const { pods, databases } = useClusterResources(clusterId);

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
            ["Disco", data.totals.diskUsedPct != null ? `${Math.round(data.totals.diskUsedPct)}%` : "—"],
            ["Rede", data.totals.netRxBps != null ? `↓${fmtBps(data.totals.netRxBps)} ↑${fmtBps(data.totals.netTxBps ?? 0)}` : "—"],
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

      {databases && databases.databases.length > 0 && <DatabasesSection databases={databases.databases} />}

      {pods && <PodsSection pods={pods.pods} />}
    </div>
  );
}

/** Todos os bancos do cluster: instâncias com papel (primário/réplica), nó e portas. */
function DatabasesSection({ databases }: { databases: DatabaseView[] }) {
  return (
    <div className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Database className="size-4 text-primary" /> Bancos de dados</h2>
      <div className="grid gap-3 lg:grid-cols-2">
        {databases.map((db) => (
          <Card key={`${db.namespace}/${db.name}`}>
            <CardContent className="space-y-2 pt-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">{db.name}</span>
                <Badge variant="muted">{db.engine}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{db.namespace} · {db.instances.length} instância(s)</p>
              <div className="space-y-1">
                {db.instances.map((i) => (
                  <div key={i.pod} className="flex items-center justify-between rounded border border-border px-2 py-1 text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className={`size-1.5 rounded-full ${i.ready ? "bg-success" : "bg-amber-500"}`} />
                      <span className="font-mono">{i.pod}</span>
                      {i.role !== "instance" && <Badge variant={i.role === "primary" ? "default" : "muted"}>{i.role}</Badge>}
                    </span>
                    <span className="text-muted-foreground">{i.node || "—"} · {fmtPorts(i.ports)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

const CATEGORY_LABEL: Record<ClusterPod["category"], string> = { database: "banco", platform: "capiva", system: "sistema", app: "app" };

/** Todos os pods do cluster: nome, namespace, nó, fase e portas. */
function PodsSection({ pods }: { pods: ClusterPod[] }) {
  const [filter, setFilter] = useState("");
  const visible = pods.filter((p) => !filter || `${p.namespace}/${p.name}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Pods do cluster ({pods.length})</h2>
        <input
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          placeholder="Filtrar por nome…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Pod</th>
                <th className="px-3 py-2 text-left font-medium">Namespace</th>
                <th className="px-3 py-2 text-left font-medium">Nó</th>
                <th className="px-3 py-2 text-left font-medium">Fase</th>
                <th className="px-3 py-2 text-left font-medium">Portas</th>
                <th className="px-3 py-2 text-left font-medium">Tipo</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr key={`${p.namespace}/${p.name}`} className="border-b border-border/50 last:border-0">
                  <td className="px-3 py-1.5 font-mono text-xs">{p.name}{p.restarts > 0 && <span className="ml-1 text-amber-500">↻{p.restarts}</span>}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{p.namespace}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{p.node || "—"}</td>
                  <td className="px-3 py-1.5"><Badge variant={phaseBadge(p.phase, p.ready)}>{p.phase}</Badge></td>
                  <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{fmtPorts(p.ports)}</td>
                  <td className="px-3 py-1.5"><Badge variant="muted">{CATEGORY_LABEL[p.category]}</Badge></td>
                </tr>
              ))}
              {visible.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-sm text-muted-foreground">Nenhum pod.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
