import { Clock, Cpu, Pencil, Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCronJobs } from "@/hooks/useCronJobs";
import { useWorkers } from "@/hooks/useWorkers";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

type Env = { key: string; value: string };

function EnvEditor({ env, setEnv }: { env: Env[]; setEnv: (e: Env[]) => void }) {
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <Label>Variáveis de ambiente</Label>
      {env.map((e, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input className="flex-1 font-mono text-xs" value={e.key} onChange={(ev) => setEnv(env.map((x, idx) => (idx === i ? { ...x, key: ev.target.value } : x)))} placeholder="QUEUE_URL" />
          <Input className="flex-1 font-mono text-xs" value={e.value} onChange={(ev) => setEnv(env.map((x, idx) => (idx === i ? { ...x, value: ev.target.value } : x)))} placeholder="valor" />
          <Button variant="ghost" size="icon" onClick={() => setEnv(env.filter((_, idx) => idx !== i))}><X className="size-4" /></Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => setEnv([...env, { key: "", value: "" }])}><Plus className="size-4" /> Adicionar variável</Button>
    </div>
  );
}

export function WorkloadsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Workers & Cron Jobs</h1>
        <p className="text-sm text-muted-foreground">Processos de background e tarefas agendadas, sem porta exposta.</p>
      </div>
      <Tabs defaultValue="workers">
        <TabsList>
          <TabsTrigger value="workers">Workers</TabsTrigger>
          <TabsTrigger value="cron">Cron Jobs</TabsTrigger>
        </TabsList>
        <TabsContent value="workers" className="pt-5"><WorkersTab /></TabsContent>
        <TabsContent value="cron" className="pt-5"><CronTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function WorkersTab() {
  const { projectId, environmentId } = useWorkspaceStore();
  const { workers, create, update, isCreating, refetch } = useWorkers(projectId);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", image: "", replicas: 1 });
  const [env, setEnv] = useState<Env[]>([]);

  function openNew() { setEditId(null); setF({ name: "", image: "", replicas: 1 }); setEnv([]); setOpen(true); }
  function openEdit(w: any) {
    setEditId(w.id);
    setF({ name: w.name, image: w.sourceConfig?.image ?? "", replicas: w.replicas });
    setEnv(w.sourceConfig?.env ?? []);
    setOpen(true);
  }

  async function submit() {
    if (!projectId || !environmentId) return toast.error("Selecione projeto e ambiente.");
    if (!f.name) return toast.error("Informe um nome.");
    const cleanEnv = env.filter((e) => e.key.trim());
    try {
      if (editId) await update({ id: editId, patch: { environmentId, replicas: f.replicas, image: f.image, env: cleanEnv } });
      else await create({ projectId, environmentId, name: f.name, source: "DOCKER_IMAGE", sourceConfig: { image: f.image, env: cleanEnv }, replicas: f.replicas });
      toast.success(editId ? "Worker atualizado" : "Worker criado");
      refetch(); setOpen(false);
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button variant="gradient" onClick={openNew}><Plus className="size-4" /> Novo worker</Button></div>
      {workers.length === 0 ? <Empty icon={Cpu} label="Nenhum worker ainda" /> : workers.map((w) => (
        <Card key={w.id}><CardContent className="flex items-center justify-between pt-5">
          <span className="font-medium">{w.name}</span>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{w.replicas} réplicas</span>
            <Badge variant={w.observedStatus === "running" ? "success" : "warning"}>{w.observedStatus}</Badge>
            <Button variant="ghost" size="icon" onClick={() => openEdit(w)}><Pencil className="size-4" /></Button>
          </div>
        </CardContent></Card>
      ))}
      <Drawer open={open} onClose={() => setOpen(false)} title={editId ? "Editar worker" : "Novo worker"} description="Processo de background (sem porta) — pode receber variáveis de ambiente." footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button variant="gradient" onClick={submit} disabled={isCreating}>{editId ? "Salvar" : "Criar"}</Button></div>}>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Nome</Label><Input autoFocus disabled={Boolean(editId)} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="processador" /></div>
          <div className="space-y-1.5"><Label>Imagem Docker</Label><Input value={f.image} onChange={(e) => setF({ ...f, image: e.target.value })} placeholder="ghcr.io/empresa/worker:latest" /></div>
          <div className="space-y-1.5"><Label>Réplicas</Label><Input type="number" value={f.replicas} onChange={(e) => setF({ ...f, replicas: +e.target.value })} /></div>
          <EnvEditor env={env} setEnv={setEnv} />
        </div>
      </Drawer>
    </div>
  );
}

function CronTab() {
  const { projectId, environmentId } = useWorkspaceStore();
  const { cronJobs, create, update, isCreating, refetch } = useCronJobs(projectId);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", image: "", schedule: "0 * * * *" });
  const [env, setEnv] = useState<Env[]>([]);

  function openNew() { setEditId(null); setF({ name: "", image: "", schedule: "0 * * * *" }); setEnv([]); setOpen(true); }
  function openEdit(c: any) {
    setEditId(c.id);
    setF({ name: c.name, image: c.sourceConfig?.image ?? "", schedule: c.schedule });
    setEnv(c.sourceConfig?.env ?? []);
    setOpen(true);
  }

  async function submit() {
    if (!projectId || !environmentId) return toast.error("Selecione projeto e ambiente.");
    if (!f.name) return toast.error("Informe um nome.");
    const cleanEnv = env.filter((e) => e.key.trim());
    try {
      if (editId) await update({ id: editId, patch: { environmentId, schedule: f.schedule, image: f.image, env: cleanEnv } });
      else await create({ projectId, environmentId, name: f.name, schedule: f.schedule, source: "DOCKER_IMAGE", sourceConfig: { image: f.image, env: cleanEnv } });
      toast.success(editId ? "Cron job atualizado" : "Cron job criado");
      refetch(); setOpen(false);
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button variant="gradient" onClick={openNew}><Plus className="size-4" /> Novo cron job</Button></div>
      {cronJobs.length === 0 ? <Empty icon={Clock} label="Nenhum cron job ainda" /> : cronJobs.map((c) => (
        <Card key={c.id}><CardContent className="flex items-center justify-between pt-5">
          <span className="font-medium">{c.name}</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{c.schedule}</span>
            <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="size-4" /></Button>
          </div>
        </CardContent></Card>
      ))}
      <Drawer open={open} onClose={() => setOpen(false)} title={editId ? "Editar cron job" : "Novo cron job"} description="Tarefa agendada (expressão cron)." footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button variant="gradient" onClick={submit} disabled={isCreating}>{editId ? "Salvar" : "Criar"}</Button></div>}>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Nome</Label><Input autoFocus disabled={Boolean(editId)} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="limpeza-diaria" /></div>
          <div className="space-y-1.5"><Label>Imagem Docker</Label><Input value={f.image} onChange={(e) => setF({ ...f, image: e.target.value })} placeholder="ghcr.io/empresa/job:latest" /></div>
          <div className="space-y-1.5"><Label>Agendamento (cron)</Label><Input value={f.schedule} onChange={(e) => setF({ ...f, schedule: e.target.value })} /></div>
          <EnvEditor env={env} setEnv={setEnv} />
        </div>
      </Drawer>
    </div>
  );
}

function Empty({ icon: Icon, label }: { icon: typeof Cpu; label: string }) {
  return <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground"><Icon className="size-6" /><p className="text-sm">{label}</p></CardContent></Card>;
}
