import { Database, Plus, Settings2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDatabases } from "@/hooks/useDatabases";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";
import { CreateDatabaseDrawer } from "@/pages/databases/components/CreateDatabaseDrawer";
import { DatabaseDetailDrawer } from "@/pages/databases/components/DatabaseDetailDrawer";

export function DatabasesPage() {
  const projectId = useWorkspaceStore((s) => s.projectId);
  const { databases, isLoading } = useDatabases(projectId);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bancos de Dados</h1>
          <p className="text-sm text-muted-foreground">Gerenciados com HA, backups e monitoramento automáticos.</p>
        </div>
        <Button variant="gradient" onClick={() => setCreateOpen(true)}><Plus className="size-4" /> Novo banco</Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : databases.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-16 text-center"><div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary"><Database className="size-6" /></div><p className="font-medium">Nenhum banco ainda</p><Button variant="gradient" className="mt-2" onClick={() => setCreateOpen(true)}><Plus className="size-4" /> Novo banco</Button></CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {databases.map((db) => (
            <Card key={db.id} className="cursor-pointer transition-colors hover:border-primary/40" onClick={() => setDetailId(db.id)}>
              <CardContent className="space-y-2 pt-5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-medium"><Database className="size-4 text-primary" />{db.name}</span>
                  {db.highAvailability && <Badge>HA</Badge>}
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                  <span className="rounded bg-muted px-1.5 py-0.5">{db.kind}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5">{db.size}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5">{db.observedStatus}</span>
                </div>
                <span className="inline-flex items-center gap-1 text-xs text-primary"><Settings2 className="size-3" /> Configurar</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateDatabaseDrawer open={createOpen} onClose={() => setCreateOpen(false)} />
      <DatabaseDetailDrawer open={Boolean(detailId)} onClose={() => setDetailId(null)} id={detailId} />
    </div>
  );
}
