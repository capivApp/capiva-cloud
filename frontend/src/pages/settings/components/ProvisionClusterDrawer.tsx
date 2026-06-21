import { Copy, Plus, Terminal, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useClusterProvisioning, type SshNode } from "@/hooks/useClusterProvisioning";

/**
 * Provisiona um cluster Kubernetes do zero (k3s) — o usuário não instala nada.
 * Copy-paste: cola um comando no nó. SSH: a plataforma instala nos nós.
 */
export function ProvisionClusterDrawer({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { copyPaste, provisionSsh } = useClusterProvisioning();
  const [name, setName] = useState("");
  const [script, setScript] = useState<string | null>(null);
  const [nodes, setNodes] = useState<SshNode[]>([{ host: "", sshUser: "root", role: "CONTROL_PLANE", privateKey: "" }]);
  const [busy, setBusy] = useState(false);

  async function genCopyPaste() {
    if (!name.trim()) return toast.error("Informe um nome.");
    setBusy(true);
    try {
      const res = await copyPaste(name.trim());
      setScript(res.serverScript);
      toast.success("Comando gerado. Cole no nó control plane.");
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runSsh() {
    if (!name.trim()) return toast.error("Informe um nome.");
    if (!nodes.some((n) => n.role === "CONTROL_PLANE")) return toast.error("Inclua ao menos um control plane.");
    if (nodes.some((n) => !n.host || !n.sshUser)) return toast.error("Preencha host e usuário de todos os nós.");
    setBusy(true);
    try {
      await provisionSsh({ name: name.trim(), nodes });
      toast.success("Provisionamento iniciado — acompanhe o status dos nós.");
      onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Subir um cluster Kubernetes" description="Sem saber Kubernetes — k3s instalado automaticamente." width="max-w-xl">
      <div className="space-y-4">
        <div className="space-y-1.5"><Label>Nome do cluster</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="meu-cluster" /></div>

        <Tabs defaultValue="copy">
          <TabsList>
            <TabsTrigger value="copy">Copiar e colar</TabsTrigger>
            <TabsTrigger value="ssh">Via SSH</TabsTrigger>
          </TabsList>

          <TabsContent value="copy" className="space-y-3 pt-4">
            <p className="text-sm text-muted-foreground">Geramos um comando. Cole no terminal do nó que será o <b>control plane</b>. Ele se registra sozinho aqui.</p>
            {!script ? (
              <Button variant="gradient" onClick={genCopyPaste} disabled={busy}><Terminal className="size-4" /> Gerar comando</Button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between"><Label>Comando do control plane</Label><Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(script); toast.success("Copiado"); }}><Copy className="size-4" /> Copiar</Button></div>
                <pre className="max-h-48 overflow-auto rounded-lg bg-background p-3 font-mono text-xs text-muted-foreground">{script}</pre>
                <p className="text-xs text-muted-foreground">Após rodar, o cluster aparece como “conectado”. Adicione workers depois em “Nós”.</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="ssh" className="space-y-3 pt-4">
            <p className="text-sm text-muted-foreground">Informe o SSH dos nós. A plataforma instala o control plane, junta os workers e registra tudo.</p>
            {nodes.map((n, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={n.role} onChange={(e) => setNodes((s) => s.map((x, idx) => idx === i ? { ...x, role: e.target.value as any } : x))}>
                    <option value="CONTROL_PLANE">Control plane</option>
                    <option value="WORKER">Worker</option>
                  </select>
                  {nodes.length > 1 && <Button variant="ghost" size="icon" onClick={() => setNodes((s) => s.filter((_, idx) => idx !== i))}><X className="size-4" /></Button>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="host/IP" value={n.host} onChange={(e) => setNodes((s) => s.map((x, idx) => idx === i ? { ...x, host: e.target.value } : x))} />
                  <Input placeholder="usuário SSH" value={n.sshUser} onChange={(e) => setNodes((s) => s.map((x, idx) => idx === i ? { ...x, sshUser: e.target.value } : x))} />
                </div>
                <textarea className={cn("h-20 w-full rounded-md border border-input bg-background p-2 font-mono text-xs")} placeholder="chave privada SSH (PEM) — ou deixe vazio e use senha" value={n.privateKey} onChange={(e) => setNodes((s) => s.map((x, idx) => idx === i ? { ...x, privateKey: e.target.value } : x))} />
                <Input type="password" placeholder="senha SSH (opcional)" value={n.password ?? ""} onChange={(e) => setNodes((s) => s.map((x, idx) => idx === i ? { ...x, password: e.target.value } : x))} />
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setNodes((s) => [...s, { host: "", sshUser: "root", role: "WORKER", privateKey: "" }])}><Plus className="size-4" /> Adicionar nó</Button>
            <div><Button variant="gradient" onClick={runSsh} disabled={busy}>Provisionar via SSH</Button></div>
          </TabsContent>
        </Tabs>
      </div>
    </Drawer>
  );
}
