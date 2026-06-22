import { Database, Plus, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStorageProviders } from "@/hooks/useStorageProviders";

const blank = { name: "", endpoint: "", bucket: "", region: "", accessKeyId: "", secretAccessKey: "", isDefault: false };

/** Provedores de storage S3 (org), usados como destino de backups. Vários por org. */
export function StoragePage() {
  const { providers, isLoading, create, isCreating, remove } = useStorageProviders();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);

  const submit = async () => {
    if (!form.name.trim() || !form.endpoint.trim() || !form.bucket.trim() || !form.accessKeyId || !form.secretAccessKey) return toast.error("Preencha os campos obrigatórios.");
    try {
      await create({ ...form, region: form.region || undefined });
      setForm(blank);
      setOpen(false);
      toast.success("Provedor cadastrado.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Storage (S3)</h1>
          <p className="text-sm text-muted-foreground">Provedores S3 para backups de banco e de volume. Vários por organização.</p>
        </div>
        <Button variant="gradient" onClick={() => setOpen(true)}><Plus className="size-4" /> Novo provedor</Button>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-5">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && providers.length === 0 && <p className="text-sm text-muted-foreground">Nenhum provedor cadastrado.</p>}
          {providers.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm">
              <div className="flex items-center gap-2">
                <Database className="size-4 text-muted-foreground" />
                <span className="font-medium">{p.name}</span>
                <span className="font-mono text-xs text-muted-foreground">{p.endpoint}/{p.bucket}</span>
                {p.isDefault && <Badge variant="success"><Star className="mr-1 size-3" /> Padrão</Badge>}
              </div>
              <Button variant="ghost" size="icon" onClick={() => remove(p.id).then(() => toast.success("Removido")).catch((e) => toast.error((e as Error).message))}><Trash2 className="size-4" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Drawer open={open} onClose={() => setOpen(false)} title="Novo provedor S3" description="Credenciais de um bucket S3 compatível."
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button variant="gradient" onClick={submit} disabled={isCreating}>Salvar</Button></div>}>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Backups produção" /></div>
          <div className="space-y-1.5"><Label>Endpoint</Label><Input value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} placeholder="https://s3.amazonaws.com" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Bucket</Label><Input value={form.bucket} onChange={(e) => setForm({ ...form, bucket: e.target.value })} placeholder="capiva-backups" /></div>
            <div className="space-y-1.5"><Label>Região</Label><Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="us-east-1" /></div>
          </div>
          <div className="space-y-1.5"><Label>Access Key ID</Label><Input value={form.accessKeyId} onChange={(e) => setForm({ ...form, accessKeyId: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Secret Access Key</Label><Input type="password" value={form.secretAccessKey} onChange={(e) => setForm({ ...form, secretAccessKey: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-primary" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} /> Tornar provedor padrão</label>
        </div>
      </Drawer>
    </div>
  );
}
