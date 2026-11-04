import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useClusters } from "@/hooks/useClusters";
import { useEnvironments, type Environment } from "@/hooks/useEnvironments";

export interface EnvEditing {
  id: string;
  name: string;
  kind: string;
  clusterId: string | null;
  networkIsolation: boolean;
}

type EnvironmentFormProps = {
  onClose: () => void;
  editing?: EnvEditing | null;
  onSaved: () => void;
};

/** Montado só com o drawer aberto: cada abertura começa com o formulário do registro em edição. */
export function EnvironmentDrawer({ open, ...props }: { open: boolean } & EnvironmentFormProps) {
  if (!open) return null;
  return <EnvironmentForm key={props.editing?.id ?? "new"} {...props} />;
}

function EnvironmentForm({ onClose, editing, onSaved }: EnvironmentFormProps) {
  const { create, update, isCreating } = useEnvironments();
  const { clusters } = useClusters();
  const [f, setF] = useState(() => ({
    name: editing?.name ?? "",
    kind: editing?.kind ?? "PRODUCTION",
    clusterId: editing?.clusterId ?? "",
    networkIsolation: editing?.networkIsolation ?? true,
  }));

  async function submit() {
    if (!f.name) return toast.error("Informe um nome.");
    try {
      const kind = f.kind as Environment["kind"];
      if (editing)
        await update({
          id: editing.id,
          patch: {
            name: f.name,
            kind,
            clusterId: f.clusterId || null,
            networkIsolation: f.networkIsolation,
          },
        });
      else
        await create({
          name: f.name,
          kind,
          clusterId: f.clusterId || undefined,
          networkIsolation: f.networkIsolation,
        });
      toast.success(editing ? "Ambiente atualizado" : "Ambiente criado");
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={editing ? "Editar ambiente" : "Novo ambiente"}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="gradient" onClick={submit} disabled={isCreating}>
            {editing ? "Salvar" : "Criar"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Nome</Label>
          <Input
            autoFocus
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            placeholder="Produção"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={f.kind}
            onChange={(e) => setF({ ...f, kind: e.target.value })}
          >
            <option value="DEVELOPMENT">Dev</option>
            <option value="STAGING">Homolog</option>
            <option value="PRODUCTION">Produção</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Cluster</Label>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={f.clusterId}
            onChange={(e) => setF({ ...f, clusterId: e.target.value })}
          >
            <option value="">(nenhum)</option>
            {clusters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={f.networkIsolation}
              onChange={(e) => setF({ ...f, networkIsolation: e.target.checked })}
              className="accent-primary"
            />{" "}
            Isolamento de rede
          </label>
          <p className="text-xs text-muted-foreground">
            Bloqueia o acesso vindo de outros ambientes. As dependências conectadas continuam
            liberadas.
          </p>
        </div>
      </div>
    </Drawer>
  );
}
