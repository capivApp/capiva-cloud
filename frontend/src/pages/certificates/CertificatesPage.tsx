import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTlsCertificates } from "@/hooks/useTlsCertificates";

/**
 * Página de Certificados TLS da organização. Cadastro por drawer (cert + key
 * PEM); usados por aplicações com TLS "uploaded". Sem YAML, sem expor material.
 */
export function CertificatesPage() {
  const { certificates, isLoading, create, isCreating, remove } = useTlsCertificates();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", cert: "", key: "" });

  const submit = async () => {
    if (!form.name.trim() || !form.cert.includes("BEGIN") || !form.key.includes("BEGIN")) {
      return toast.error("Informe nome, certificado e chave em formato PEM.");
    }
    try {
      await create(form);
      setForm({ name: "", cert: "", key: "" });
      setOpen(false);
      toast.success("Certificado cadastrado.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const del = async (id: string) => {
    try {
      await remove(id);
      toast.success("Certificado removido.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Certificados TLS</h1>
          <p className="text-sm text-muted-foreground">Certificados enviados, usados por domínios com TLS "uploaded".</p>
        </div>
        <Button variant="gradient" onClick={() => setOpen(true)}><Plus className="size-4" /> Novo certificado</Button>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-5">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && certificates.length === 0 && <p className="text-sm text-muted-foreground">Nenhum certificado cadastrado.</p>}
          {certificates.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-success" />
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => del(c.id)}><Trash2 className="size-4" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Drawer open={open} onClose={() => setOpen(false)} title="Novo certificado TLS" description="Cole o certificado e a chave privada (PEM)." width="max-w-lg"
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button variant="gradient" onClick={submit} disabled={isCreating}>Salvar</Button></div>}>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="empresa.com wildcard" /></div>
          <div className="space-y-1.5">
            <Label>Certificado (PEM)</Label>
            <textarea className="h-32 w-full rounded-md border border-border bg-background p-2 font-mono text-xs" value={form.cert} onChange={(e) => setForm({ ...form, cert: e.target.value })} placeholder="-----BEGIN CERTIFICATE-----" />
          </div>
          <div className="space-y-1.5">
            <Label>Chave privada (PEM)</Label>
            <textarea className="h-32 w-full rounded-md border border-border bg-background p-2 font-mono text-xs" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="-----BEGIN PRIVATE KEY-----" />
          </div>
        </div>
      </Drawer>
    </div>
  );
}
