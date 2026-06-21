import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { queryClient } from "@/query";

const FORMS = [
  { id: "URL", label: "URL completa (http://host:porta)" },
  { id: "DNS", label: "DNS interno (host)" },
  { id: "DNS_PORT", label: "DNS + porta (host:porta)" },
  { id: "IP", label: "IP (ClusterIP)" },
  { id: "IP_PORT", label: "IP + porta" },
];

interface Mapping { key: string; form: string }

/**
 * Drawer de conexão entre serviços: define QUAIS variáveis injetar na ORIGEM e
 * O QUE cada uma é (URL, DNS, DNS+porta, IP, IP+porta).
 */
export function ConnectDependencyDrawer({
  open,
  onClose,
  sourceId,
  target,
  onConnected,
}: {
  open: boolean;
  onClose: () => void;
  sourceId: string | null;
  target: { id: string; name: string } | null;
  onConnected: () => void;
}) {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && target) {
      const base = target.name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
      setMappings([{ key: `${base}_URL`, form: "URL" }]);
    }
  }, [open, target]);

  function update(i: number, patch: Partial<Mapping>) {
    setMappings((m) => m.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }

  async function submit() {
    if (!sourceId || !target) return;
    if (mappings.some((m) => !m.key.trim())) return toast.error("Toda variável precisa de um nome.");
    setBusy(true);
    try {
      await api.post(`/applications/${sourceId}/dependencies`, { targetId: target.id, mappings });
      await queryClient.invalidateQueries({ queryKey: ["dependencies"] });
      toast.success("Conectado — variáveis injetadas na origem.");
      onConnected();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Conectar serviços"
      description={target ? `Variáveis injetadas na origem apontando para ${target.name}.` : undefined}
      width="max-w-lg"
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="gradient" onClick={submit} disabled={busy}>Conectar</Button></div>}
    >
      <div className="space-y-3">
        <Label>Variáveis a injetar na origem</Label>
        {mappings.map((m, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input className="flex-1 font-mono text-xs" value={m.key} onChange={(e) => update(i, { key: e.target.value })} placeholder="DATABASE_HOST" />
            <select className="h-9 rounded-md border border-input bg-background px-2 text-xs" value={m.form} onChange={(e) => update(i, { form: e.target.value })}>
              {FORMS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
            <Button variant="ghost" size="icon" onClick={() => setMappings((x) => x.filter((_, idx) => idx !== i))}><Trash2 className="size-4" /></Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setMappings((m) => [...m, { key: "", form: "URL" }])}><Plus className="size-4" /> Adicionar variável</Button>
        <p className="text-xs text-muted-foreground">A plataforma gera o DNS interno do Kubernetes e o valor no formato escolhido (resolvendo o ClusterIP quando IP).</p>
      </div>
    </Drawer>
  );
}
