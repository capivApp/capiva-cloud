import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOrganizations } from "@/hooks/useOrganizations";
import { useAuthStore } from "@/stores/useAuthStore";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

/** Seletor de organização (abaixo do logo). Suporta múltiplas orgs + criar nova. */
export function OrgSwitcher() {
  const { organizations, create, refetch } = useOrganizations();
  const organizationId = useAuthStore((s) => s.organizationId);
  const setOrganization = useAuthStore((s) => s.setOrganization);
  const resetWorkspace = useWorkspaceStore((s) => s.setProject);
  const [newOrg, setNewOrg] = useState(false);
  const [name, setName] = useState("");

  const active = organizations.find((o) => o.id === organizationId);

  function switchTo(id: string) {
    setOrganization(id);
    resetWorkspace(null); // reseta projeto ao trocar de org
  }

  async function createOrg() {
    if (!name.trim()) return toast.error("Informe um nome.");
    try {
      const org = await create(name.trim());
      await refetch();
      switchTo(org.id);
      toast.success("Organização criada");
      setName("");
      setNewOrg(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent/40">
            <span className="flex items-center gap-2 truncate">
              <span className="grid size-6 shrink-0 place-items-center rounded-md gradient-bg text-[10px] font-bold text-white">
                {(active?.name ?? "?").slice(0, 1).toUpperCase()}
              </span>
              <span className="truncate text-sm font-medium">{active?.name ?? "Selecionar org"}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {organizations.map((o) => (
            <DropdownMenuItem key={o.id} onClick={() => switchTo(o.id)}>
              <span className="truncate">{o.name}</span>
              {o.id === organizationId && <Check className="ml-auto size-4 text-primary" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setNewOrg(true)}>
            <Plus className="size-4" /> Adicionar organização
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Drawer
        open={newOrg}
        onClose={() => setNewOrg(false)}
        title="Nova organização"
        description="Um tenant isolado com seus próprios projetos, clusters e membros."
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setNewOrg(false)}>Cancelar</Button><Button variant="gradient" onClick={createOrg}>Criar</Button></div>}
      >
        <div className="space-y-1.5">
          <Label>Nome</Label>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Minha Empresa" onKeyDown={(e) => e.key === "Enter" && createOrg()} />
        </div>
      </Drawer>
    </>
  );
}
