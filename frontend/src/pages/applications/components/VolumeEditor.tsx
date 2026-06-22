import { HardDrive, Plus, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { VolumeSpec } from "@/pages/applications/hooks/useApplications";

const empty: VolumeSpec = { name: "", mountPath: "", sizeGi: 1, accessMode: "RWO" };

/**
 * Editor de volumes persistentes: pasta montada no container + tamanho +
 * "compartilhado entre réplicas?" (RWX via Longhorn). Sem YAML — o usuário só
 * informa a pasta, o tamanho e se todos os pods devem ver os mesmos arquivos.
 */
export function VolumeEditor({ list, setList }: { list: VolumeSpec[]; setList: (l: VolumeSpec[]) => void }) {
  const patch = (i: number, p: Partial<VolumeSpec>) => setList(list.map((v, idx) => (idx === i ? { ...v, ...p } : v)));

  return (
    <div className="space-y-3">
      {list.map((v, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex items-center gap-2">
            <HardDrive className="size-4 text-muted-foreground" />
            <Input className="flex-1 font-mono text-xs" value={v.name} onChange={(e) => patch(i, { name: e.target.value.toLowerCase() })} placeholder="dados" />
            <Button variant="ghost" size="icon" onClick={() => setList(list.filter((_, idx) => idx !== i))}><X className="size-4" /></Button>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Pasta no container</Label>
              <Input className="font-mono text-xs" value={v.mountPath} onChange={(e) => patch(i, { mountPath: e.target.value })} placeholder="/app/uploads" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Tamanho (Gi)</Label>
              <Input type="number" min={1} className="w-24 text-xs" value={v.sizeGi} onChange={(e) => patch(i, { sizeGi: Math.max(1, +e.target.value) })} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => patch(i, { accessMode: v.accessMode === "RWX" ? "RWO" : "RWX" })}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
              v.accessMode === "RWX" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/40",
            )}
          >
            <Users className="size-4" />
            <span className="flex-1">
              <span className="font-medium">Compartilhado entre réplicas</span>
              <span className="block text-xs text-muted-foreground">
                {v.accessMode === "RWX" ? "Todos os pods veem a mesma pasta (Longhorn RWX)." : "Cada pod tem seu próprio volume (RWO)."}
              </span>
            </span>
            <span className={cn("size-4 rounded-full border", v.accessMode === "RWX" ? "border-primary bg-primary" : "border-muted-foreground")} />
          </button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => setList([...list, { ...empty }])}><Plus className="size-4" /> Adicionar volume</Button>
    </div>
  );
}
