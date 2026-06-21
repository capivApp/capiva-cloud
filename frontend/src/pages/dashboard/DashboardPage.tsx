import { Database, FolderPlus, Plus, Rocket } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CreateProjectDrawer } from "@/components/CreateProjectDrawer";
import { useDatabases } from "@/hooks/useDatabases";
import { useProjects } from "@/hooks/useProjects";
import { ServiceCard } from "@/pages/dashboard/components/ServiceCard";
import { useApplications } from "@/pages/applications/hooks/useApplications";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

export function DashboardPage() {
  const projectId = useWorkspaceStore((s) => s.projectId);
  const { projects } = useProjects();
  const { applications, refetch } = useApplications(projectId);
  const { databases } = useDatabases(projectId);
  const project = projects.find((p) => p.id === projectId);
  const [drawer, setDrawer] = useState(false);

  if (projects.length === 0) {
    return (
      <>
        <Card className="mx-auto max-w-5xl">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary"><FolderPlus className="size-6" /></div>
            <p className="font-medium">Crie seu primeiro projeto</p>
            <p className="max-w-sm text-sm text-muted-foreground">Projetos agrupam aplicações, bancos e workers.</p>
            <Button variant="gradient" className="mt-2" onClick={() => setDrawer(true)}><Plus className="size-4" /> Novo projeto</Button>
          </CardContent>
        </Card>
        <CreateProjectDrawer open={drawer} onClose={() => setDrawer(false)} />
      </>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{project?.name ?? "Visão geral"}</h1>
          <p className="text-sm text-muted-foreground">{applications.length} aplicações · {databases.length} bancos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setDrawer(true)}><FolderPlus className="size-4" /> Projeto</Button>
          <Button asChild variant="gradient"><Link to="/applications/new"><Plus className="size-4" /> Nova Aplicação</Link></Button>
        </div>
      </div>

      {applications.length === 0 && databases.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary"><Rocket className="size-6" /></div>
            <p className="font-medium">Comece criando sua primeira aplicação</p>
            <Button asChild variant="gradient" className="mt-2"><Link to="/applications/new"><Plus className="size-4" /> Nova Aplicação</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {applications.map((a) => (
            <ServiceCard key={a.id} app={a} onChange={() => refetch()} />
          ))}
          {databases.map((d) => (
            <Card key={d.id}>
              <CardContent className="space-y-2 pt-5">
                <Link to="/databases" className="flex items-center gap-2 font-medium hover:text-primary"><Database className="size-4 text-primary" />{d.name}</Link>
                <p className="text-xs text-muted-foreground">{d.kind} · {d.observedStatus}{d.highAvailability ? " · HA" : ""}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateProjectDrawer open={drawer} onClose={() => setDrawer(false)} />
    </div>
  );
}
