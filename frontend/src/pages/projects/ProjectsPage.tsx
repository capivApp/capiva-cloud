import { FolderGit2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreateProjectDrawer } from "@/components/CreateProjectDrawer";
import { useProjects } from "@/hooks/useProjects";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

export function ProjectsPage() {
  const { projects, isLoading, update, remove, refetch } = useProjects();
  const setProject = useWorkspaceStore((s) => s.setProject);
  const [creating, setCreating] = useState(false);
  const [edit, setEdit] = useState<{ id: string; name: string } | null>(null);

  async function saveEdit() {
    if (!edit?.name.trim()) return toast.error("Informe um nome.");
    await update({ id: edit.id, name: edit.name.trim() }).then(() => { toast.success("Projeto atualizado"); refetch(); setEdit(null); }).catch((e) => toast.error((e as Error).message));
  }

  async function del(id: string) {
    await remove(id).then(() => { toast.success("Projeto removido"); refetch(); }).catch((e) => toast.error((e as Error).message));
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projetos</h1>
          <p className="text-sm text-muted-foreground">Agrupam aplicações, bancos, workers e cron jobs.</p>
        </div>
        <Button variant="gradient" onClick={() => setCreating(true)}><Plus className="size-4" /> Novo projeto</Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : projects.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-16 text-center"><div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary"><FolderGit2 className="size-6" /></div><p className="font-medium">Nenhum projeto ainda</p><Button variant="gradient" className="mt-2" onClick={() => setCreating(true)}><Plus className="size-4" /> Novo projeto</Button></CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {projects.map((p) => (
            <Card key={p.id} className="transition-colors hover:border-primary/40">
              <CardContent className="flex items-center justify-between pt-5">
                <button className="flex items-center gap-2 font-medium hover:text-primary" onClick={() => setProject(p.id)}>
                  <FolderGit2 className="size-4 text-primary" /> {p.name}
                </button>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setEdit({ id: p.id, name: p.name })}><Pencil className="size-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => del(p.id)}><Trash2 className="size-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateProjectDrawer open={creating} onClose={() => setCreating(false)} />
      <Drawer open={Boolean(edit)} onClose={() => setEdit(null)} title="Renomear projeto" footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button><Button variant="gradient" onClick={saveEdit}>Salvar</Button></div>}>
        <div className="space-y-1.5">
          <Label>Nome</Label>
          <Input autoFocus value={edit?.name ?? ""} onChange={(e) => setEdit((s) => (s ? { ...s, name: e.target.value } : s))} onKeyDown={(e) => e.key === "Enter" && saveEdit()} />
        </div>
      </Drawer>
    </div>
  );
}
