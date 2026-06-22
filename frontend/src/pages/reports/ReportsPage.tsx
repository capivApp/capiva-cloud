import { Activity, Play, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useApplications } from "@/pages/applications/hooks/useApplications";
import { useReports } from "@/hooks/useReports";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

/** Reports: uptime %, quedas e latência média por aplicação (sondas HTTP). */
export function ReportsPage() {
  const { projectId } = useWorkspaceStore();
  const { applications } = useApplications(projectId);
  const [appId, setAppId] = useState<string | null>(null);
  useEffect(() => {
    if (!appId && applications.length > 0) setAppId(applications[0].id);
  }, [applications, appId]);

  const { checks, reports, create, isCreating, run, remove } = useReports(appId);
  const [url, setUrl] = useState("");

  const reportFor = (checkId: string) => reports.find((r) => r.checkId === checkId);
  const act = (fn: () => Promise<unknown>, ok: string) => fn().then(() => toast.success(ok)).catch((e) => toast.error((e as Error).message));

  const add = async () => {
    if (!/^https?:\/\//.test(url)) return toast.error("Informe uma URL http(s).");
    try {
      await create({ url });
      setUrl("");
      toast.success("Verificação criada.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">Disponibilidade (uptime), quedas e latência por aplicação.</p>
        </div>
        {applications.length > 0 && (
          <select className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={appId ?? ""} onChange={(e) => setAppId(e.target.value)}>
            {applications.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
      </div>

      {!projectId && <Card><CardContent className="pt-5 text-sm text-muted-foreground">Selecione um projeto no topo.</CardContent></Card>}

      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-center gap-2">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.empresa.com/health" />
            <Button variant="gradient" onClick={add} disabled={isCreating || !appId}><Plus className="size-4" /> Monitorar</Button>
          </div>
          {checks.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma verificação. Adicione uma URL para monitorar.</p>}
          {checks.map((c) => {
            const r = reportFor(c.id);
            return (
              <div key={c.id} className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 font-mono text-xs"><Activity className="size-4 text-muted-foreground" />{c.url}</span>
                  <div className="flex items-center gap-1">
                    {r && <Badge variant={r.lastStatus === "up" ? "success" : r.lastStatus === "down" ? "danger" : "muted"}>{r.lastStatus}</Badge>}
                    <Button variant="ghost" size="icon" title="Sondar agora" onClick={() => act(() => run(c.id), "Sondado")}><Play className="size-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => act(() => remove(c.id), "Removido")}><Trash2 className="size-4" /></Button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div><p className="text-lg font-bold">{r ? `${r.uptimePercent}%` : "—"}</p><p className="text-xs text-muted-foreground">Uptime</p></div>
                  <div><p className="text-lg font-bold">{r ? r.downtimeCount : "—"}</p><p className="text-xs text-muted-foreground">Quedas</p></div>
                  <div><p className="text-lg font-bold">{r ? `${r.avgLatencyMs}ms` : "—"}</p><p className="text-xs text-muted-foreground">Latência média</p></div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
