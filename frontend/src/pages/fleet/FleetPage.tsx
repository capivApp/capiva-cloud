import { useQuery } from "@tanstack/react-query";
import { Server } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/useAuthStore";

interface NodeUsage { name: string; ready: boolean; cpuCapacity?: string; memoryCapacity?: string }
interface FleetCluster { id: string; name: string; region: string | null; status: string; version?: string; environments: number; nodeCount: number; nodes: NodeUsage[] }
interface FleetView { totalClusters: number; connected: number; totalEnvironments: number; clusters: FleetCluster[] }

function fmtMem(ki?: string) {
  if (!ki) return "—";
  const n = parseInt(ki);
  if (Number.isNaN(n)) return ki;
  return `${(n / 1024 / 1024).toFixed(1)} GB`;
}

export function FleetPage() {
  const organizationId = useAuthStore((s) => s.organizationId);
  const { data } = useQuery({ queryKey: ["fleet", organizationId], queryFn: () => api.get<FleetView>("/platform/fleet"), enabled: Boolean(organizationId) });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Fleet</h1>
        <p className="text-sm text-muted-foreground">Visão agregada dos seus clusters Kubernetes (multi-cluster).</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Clusters" value={data?.totalClusters ?? 0} />
        <Stat label="Conectados" value={data?.connected ?? 0} />
        <Stat label="Ambientes" value={data?.totalEnvironments ?? 0} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {(data?.clusters ?? []).map((c) => (
          <Card key={c.id}>
            <CardContent className="space-y-3 pt-5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-medium"><Server className="size-4 text-primary" />{c.name}</span>
                <Badge variant={c.status === "connected" ? "success" : "warning"}>{c.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{c.region ?? "—"} · {c.environments} ambientes · {c.nodeCount} nós{c.version ? ` · ${c.version}` : ""}</p>
              {c.nodes.length > 0 && (
                <div className="space-y-1 border-t border-border pt-2">
                  {c.nodes.map((n) => (
                    <div key={n.name} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5"><span className={`size-1.5 rounded-full ${n.ready ? "bg-success" : "bg-amber-500"}`} />{n.name}</span>
                      <span className="text-muted-foreground">{n.cpuCapacity ?? "—"} vCPU · {fmtMem(n.memoryCapacity)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {(data?.clusters ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhum cluster registrado. Adicione em Configurações → Clusters.</p>}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold tracking-tight">{value}</p></CardContent></Card>;
}
