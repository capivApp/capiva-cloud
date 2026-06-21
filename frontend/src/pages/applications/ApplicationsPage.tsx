import { Boxes, FolderPlus, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CreateProjectDrawer } from "@/components/CreateProjectDrawer";
import { useProjects } from "@/hooks/useProjects";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";
import { ServiceCard } from "@/pages/dashboard/components/ServiceCard";
import { useApplications } from "@/pages/applications/hooks/useApplications";

export function ApplicationsPage() {
  const projectId = useWorkspaceStore((s) => s.projectId);
  const { projects } = useProjects();
  const { applications, isLoading, refetch } = useApplications(projectId);
  const [drawer, setDrawer] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const allTags = Array.from(new Set(applications.flatMap((a) => a.tags ?? [])));
  const filtered = tagFilter ? applications.filter((a) => (a.tags ?? []).includes(tagFilter)) : applications;

  if (projects.length === 0) {
    return (
      <>
        <EmptyState icon={FolderPlus} title="Crie seu primeiro projeto" description="Projetos agrupam aplicações, bancos e workers."
          action={<Button variant="gradient" onClick={() => setDrawer(true)}><Plus className="size-4" /> Novo projeto</Button>} />
        <CreateProjectDrawer open={drawer} onClose={() => setDrawer(false)} />
      </>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Aplicações</h1>
          <p className="text-sm text-muted-foreground">Crie e gerencie seus serviços sem tocar em Kubernetes.</p>
        </div>
        <Button asChild variant="gradient"><Link to="/applications/new"><Plus className="size-4" /> Nova Aplicação</Link></Button>
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => setTagFilter(null)} className={`rounded-full px-2.5 py-0.5 text-xs ${!tagFilter ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>todas</button>
          {allTags.map((t) => (
            <button key={t} onClick={() => setTagFilter(t)} className={`rounded-full px-2.5 py-0.5 text-xs ${tagFilter === t ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary"}`}>#{t}</button>
          ))}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Boxes} title="Nenhuma aplicação ainda" description="Comece a partir do GitHub, uma imagem Docker ou Nixpacks."
          action={<Button asChild variant="gradient"><Link to="/applications/new"><Plus className="size-4" /> Nova Aplicação</Link></Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((app) => (
            <ServiceCard key={app.id} app={app} onChange={() => refetch()} />
          ))}
        </div>
      )}

      <CreateProjectDrawer open={drawer} onClose={() => setDrawer(false)} />
    </div>
  );
}

function EmptyState({ icon: Icon, title, description, action }: { icon: typeof Boxes; title: string; description: string; action: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-6" /></div>
          <p className="font-medium">{title}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
          <div className="mt-2">{action}</div>
        </CardContent>
      </Card>
    </div>
  );
}
