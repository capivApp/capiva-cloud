import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProjects } from "@/hooks/useProjects";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

/** Drawer de criação de projeto — substitui o prompt nativo. */
export function CreateProjectDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { create, isCreating } = useProjects();
  const setProject = useWorkspaceStore((s) => s.setProject);
  const [name, setName] = useState("");

  async function submit() {
    if (!name.trim()) return toast.error("Informe um nome.");
    try {
      const project = await create(name.trim());
      setProject(project.id); // já seleciona o novo projeto
      toast.success("Projeto criado");
      setName("");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Novo projeto"
      description="Projetos agrupam aplicações, bancos e workers relacionados."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="gradient" onClick={submit} disabled={isCreating}>Criar projeto</Button>
        </div>
      }
    >
      <div className="space-y-1.5">
        <Label>Nome do projeto</Label>
        <Input autoFocus placeholder="vendas-online" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
      </div>
    </Drawer>
  );
}
