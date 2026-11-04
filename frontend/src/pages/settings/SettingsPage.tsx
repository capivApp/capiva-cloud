import { Gauge, Pencil, Plus, Server, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useClusters } from "@/hooks/useClusters";
import { useEnvironments } from "@/hooks/useEnvironments";
import { useGitConnections } from "@/hooks/useGitConnections";
import { ClusterDrawer, type ClusterEditing } from "@/pages/settings/components/ClusterDrawer";
import { ClusterNodesDrawer } from "@/pages/settings/components/ClusterNodesDrawer";
import { EnvironmentDrawer, type EnvEditing } from "@/pages/settings/components/EnvironmentDrawer";
import { GitConnectionDrawer, type GitEditing } from "@/pages/settings/components/GitConnectionDrawer";
import { SecretStoreDrawer } from "@/pages/settings/components/SecretStoreDrawer";
import { SECRET_STORE_PROVIDERS, useSecretStores } from "@/hooks/useSecretStores";
import { ProvisionClusterDrawer } from "@/pages/settings/components/ProvisionClusterDrawer";
import { QuotaDrawer } from "@/pages/settings/components/QuotaDrawer";

export function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
      <Tabs defaultValue="clusters">
        <TabsList>
          <TabsTrigger value="clusters">Clusters</TabsTrigger>
          <TabsTrigger value="environments">Ambientes</TabsTrigger>
          <TabsTrigger value="git">Git</TabsTrigger>
          <TabsTrigger value="secret-stores">Cofres externos</TabsTrigger>
        </TabsList>
        <TabsContent value="clusters" className="pt-5"><ClustersTab /></TabsContent>
        <TabsContent value="environments" className="pt-5"><EnvironmentsTab /></TabsContent>
        <TabsContent value="git" className="pt-5"><GitTab /></TabsContent>
        <TabsContent value="secret-stores" className="pt-5"><SecretStoresTab /></TabsContent>
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
  const [quotaOf, setQuotaOf] = useState<{ id: string; name: string } | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button variant="gradient" onClick={() => { setEditing(null); setDrawer(true); }}><Plus className="size-4" /> Novo ambiente</Button></div>
      {environments.map((e) => (
        <Row key={e.id}>
          <span className="font-medium">{e.name}</span>
          <div className="flex items-center gap-1">
            {!e.networkIsolation && <Badge variant="warning">Rede aberta</Badge>}
            <span className="text-xs text-muted-foreground">{e.kind} · {e.namespace}</span>
            <Button variant="ghost" size="sm" onClick={() => setQuotaOf({ id: e.id, name: e.name })}><Gauge className="size-4" /> Quota</Button>
            <Button variant="ghost" size="icon" onClick={() => { setEditing({ id: e.id, name: e.name, kind: e.kind, clusterId: e.clusterId, networkIsolation: e.networkIsolation }); setDrawer(true); }}><Pencil className="size-4" /></Button>
            <Button variant="ghost" size="icon" onClick={async () => { await remove(e.id); refetch(); }}><Trash2 className="size-4" /></Button>
          </div>
        </Row>
      ))}
      <EnvironmentDrawer open={drawer} onClose={() => setDrawer(false)} editing={editing} onSaved={refetch} />
      <QuotaDrawer environment={quotaOf} onClose={() => setQuotaOf(null)} />
    </div>
  );
}

function SecretStoresTab() {
  const { stores, isLoading, remove } = useSecretStores();
  const [drawer, setDrawer] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button variant="gradient" onClick={() => setDrawer(true)}><Plus className="size-4" /> Novo cofre</Button></div>
      {!isLoading && stores.length === 0 && <p className="text-sm text-muted-foreground">Nenhum cofre cadastrado. Cadastre um para ler variáveis do AWS Secrets Manager, Vault ou GCP.</p>}
      {stores.map((s) => (
        <Row key={s.id}>
          <span className="font-medium">{s.name}</span>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">{SECRET_STORE_PROVIDERS[s.provider]}</span>
            <Button variant="ghost" size="icon" onClick={() => remove(s.id)}><Trash2 className="size-4" /></Button>
          </div>
        </Row>
      ))}
      <SecretStoreDrawer open={drawer} onClose={() => setDrawer(false)} />
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
