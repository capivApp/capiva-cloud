import { FolderGit2, Layers, Plus, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CreateProjectDrawer } from "@/components/CreateProjectDrawer";
import { useWorkspace } from "@/hooks/useWorkspace";
import { cn } from "@/lib/utils";

function Select({
  value,
  onChange,
  options,
  icon: Icon,
}: {
  value: string | null;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
  icon: LucideIcon;
}) {
  return (
    <div className="relative flex items-center">
      <Icon className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground" />
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-8 cursor-pointer appearance-none rounded-md bg-accent/40 pl-7 pr-7 text-sm font-medium text-foreground",
          "focus:outline-none focus:ring-2 focus:ring-ring",
        )}
      >
        {options.length === 0 && <option value="">—</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Seletor de organização / projeto / ambiente no topo da aplicação. */
export function WorkspaceSwitcher() {
  const { projects, environments, projectId, environmentId, setProject, setEnvironment } = useWorkspace();
  const [newProject, setNewProject] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <Select icon={FolderGit2} value={projectId} onChange={setProject} options={projects.map((p) => ({ id: p.id, label: p.name }))} />
      <Button variant="ghost" size="icon" className="size-7" title="Novo projeto" onClick={() => setNewProject(true)}>
        <Plus className="size-4" />
      </Button>
      <span className="text-muted-foreground">/</span>
      <Select icon={Layers} value={environmentId} onChange={setEnvironment} options={environments.map((e) => ({ id: e.id, label: e.name }))} />
      <CreateProjectDrawer open={newProject} onClose={() => setNewProject(false)} />
    </div>
  );
}
