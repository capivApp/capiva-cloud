import { Pencil, Plus, Server, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBackupConfig } from "@/hooks/useBackupConfig";
import { useClusters } from "@/hooks/useClusters";
import { useEnvironments } from "@/hooks/useEnvironments";
import { useGitConnections } from "@/hooks/useGitConnections";
import { ClusterDrawer, type ClusterEditing } from "@/pages/settings/components/ClusterDrawer";
import { ClusterNodesDrawer } from "@/pages/settings/components/ClusterNodesDrawer";
import { EnvironmentDrawer, type EnvEditing } from "@/pages/settings/components/EnvironmentDrawer";
import { GitConnectionDrawer, type GitEditing } from "@/pages/settings/components/GitConnectionDrawer";
import { ProvisionClusterDrawer } from "@/pages/settings/components/ProvisionClusterDrawer";

export function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
      <Tabs defaultValue="clusters">
        <TabsList>
          <TabsTrigger value="clusters">Clusters</TabsTrigger>
          <TabsTrigger value="environments">Ambientes</TabsTrigger>
          <TabsTrigger value="git">Git</TabsTrigger>
          <TabsTrigger value="storage">Armazenamento</TabsTrigger>
        </TabsList>
        <TabsContent value="clusters" className="pt-5"><ClustersTab /></TabsContent>
        <TabsContent value="environments" className="pt-5"><EnvironmentsTab /></TabsContent>
        <TabsContent value="git" className="pt-5"><GitTab /></TabsContent>
        <TabsContent value="storage" className="pt-5"><StorageTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <Card><CardContent className="flex items-center justify-between pt-5">{children}</CardContent></Card>;
}

function ClustersTab() {
  const { clusters, remove, refetch } = useClusters();
  const [drawer, setDrawer] = useState(false);
  const [editing, setEditing] = useState<ClusterEditing | null>(null);
  const [provision, setProvision] = useState(false);
  const [nodesOf, setNodesOf] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Conecte um cluster existente ou suba um novo do zero.</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setEditing(null); setDrawer(true); }}><Plus className="size-4" /> Conectar</Button>
          <Button variant="gradient" onClick={() => setProvision(true)}><Server className="size-4" /> Subir cluster</Button>
        </div>
      </div>
      {clusters.map((c) => (
        <Row key={c.id}>
          <span className="font-medium">{c.name} <span className="text-xs text-muted-foreground">{c.region}</span></span>
          <div className="flex items-center gap-1">
            <Badge variant={c.status === "connected" ? "success" : "warning"}>{c.status}</Badge>
            <Button variant="ghost" size="sm" onClick={() => setNodesOf(c.id)}>Nós</Button>
            <Button variant="ghost" size="icon" onClick={() => { setEditing({ id: c.id, name: c.name, region: c.region }); setDrawer(true); }}><Pencil className="size-4" /></Button>
            <Button variant="ghost" size="icon" onClick={async () => { await remove(c.id); refetch(); }}><Trash2 className="size-4" /></Button>
          </div>
        </Row>
      ))}
      <ClusterDrawer open={drawer} onClose={() => setDrawer(false)} editing={editing} onSaved={refetch} />
      <ProvisionClusterDrawer open={provision} onClose={() => setProvision(false)} onDone={refetch} />
      <ClusterNodesDrawer open={Boolean(nodesOf)} onClose={() => setNodesOf(null)} clusterId={nodesOf} />
    </div>
  );
}

function EnvironmentsTab() {
  const { environments, remove, refetch } = useEnvironments();
  const [drawer, setDrawer] = useState(false);
  const [editing, setEditing] = useState<EnvEditing | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button variant="gradient" onClick={() => { setEditing(null); setDrawer(true); }}><Plus className="size-4" /> Novo ambiente</Button></div>
      {environments.map((e) => (
        <Row key={e.id}>
          <span className="font-medium">{e.name}</span>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">{e.kind} · {e.namespace}</span>
            <Button variant="ghost" size="icon" onClick={() => { setEditing({ id: e.id, name: e.name, kind: e.kind, clusterId: e.clusterId }); setDrawer(true); }}><Pencil className="size-4" /></Button>
            <Button variant="ghost" size="icon" onClick={async () => { await remove(e.id); refetch(); }}><Trash2 className="size-4" /></Button>
          </div>
        </Row>
      ))}
      <EnvironmentDrawer open={drawer} onClose={() => setDrawer(false)} editing={editing} onSaved={refetch} />
    </div>
  );
}

function GitTab() {
  const { connections, remove, refetch } = useGitConnections();
  const [drawer, setDrawer] = useState(false);
  const [editing, setEditing] = useState<GitEditing | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button variant="gradient" onClick={() => { setEditing(null); setDrawer(true); }}><Plus className="size-4" /> Conectar provedor</Button></div>
      {connections.map((c) => (
        <Row key={c.id}>
          <span className="font-medium">{c.provider} <span className="text-xs text-muted-foreground">{c.accountLogin}</span></span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => { setEditing({ id: c.id, provider: c.provider, accountLogin: c.accountLogin }); setDrawer(true); }}><Pencil className="size-4" /></Button>
            <Button variant="ghost" size="icon" onClick={async () => { await remove(c.id); refetch(); }}><Trash2 className="size-4" /></Button>
          </div>
        </Row>
      ))}
      <GitConnectionDrawer open={drawer} onClose={() => setDrawer(false)} editing={editing} onSaved={refetch} />
    </div>
  );
}

function StorageTab() {
  const { config, save, isSaving, refetch } = useBackupConfig();
  const [f, setF] = useState({ s3Endpoint: "", s3Bucket: "", s3Region: "", accessKeyId: "", secretAccessKey: "", retentionDays: 7, schedule: "0 3 * * *" });
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });

  useEffect(() => {
    if (config) setF((s) => ({ ...s, s3Endpoint: config.s3Endpoint, s3Bucket: config.s3Bucket, s3Region: config.s3Region ?? "", retentionDays: config.retentionDays, schedule: config.schedule }));
  }, [config]);

  async function submit() {
    if (!f.s3Endpoint || !f.s3Bucket || !f.accessKeyId || !f.secretAccessKey) return toast.error("Preencha endpoint, bucket e credenciais.");
    await save({ ...f, s3Region: f.s3Region || undefined }).then(() => { toast.success("Armazenamento salvo"); refetch(); }).catch((e) => toast.error((e as Error).message));
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <p className="text-sm font-medium">Armazenamento S3 (backups globais)</p>
        <p className="text-xs text-muted-foreground">Destino dos backups de todos os bancos da organização. (Múltiplos providers chegam na Fase 3.1.)</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Endpoint</Label><Input value={f.s3Endpoint} onChange={(e) => set({ s3Endpoint: e.target.value })} placeholder="https://s3.amazonaws.com" /></div>
          <div className="space-y-1.5"><Label>Bucket</Label><Input value={f.s3Bucket} onChange={(e) => set({ s3Bucket: e.target.value })} placeholder="capiva-backups" /></div>
          <div className="space-y-1.5"><Label>Região</Label><Input value={f.s3Region} onChange={(e) => set({ s3Region: e.target.value })} placeholder="us-east-1" /></div>
          <div className="space-y-1.5"><Label>Retenção (dias)</Label><Input type="number" value={f.retentionDays} onChange={(e) => set({ retentionDays: +e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Access Key ID</Label><Input value={f.accessKeyId} onChange={(e) => set({ accessKeyId: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Secret Access Key</Label><Input type="password" value={f.secretAccessKey} onChange={(e) => set({ secretAccessKey: e.target.value })} /></div>
        </div>
        <Button variant="gradient" onClick={submit} disabled={isSaving}>Salvar armazenamento</Button>
      </CardContent>
    </Card>
  );
}
