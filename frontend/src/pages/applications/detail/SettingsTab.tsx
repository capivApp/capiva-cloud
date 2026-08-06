import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Settings2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { validateRepoPath } from "@/lib/repoPath";
import type { Application } from "@/pages/applications/hooks/useApplications";

const PROFILES = ["NANO", "SMALL", "MEDIUM", "LARGE", "XLARGE", "CUSTOM"];

interface PatchInput {
  name?: string;
  profile?: string;
  customResources?: Record<string, unknown>;
  port?: number;
  branch?: string;
  image?: string;
  healthPath?: string;
  dockerfile?: string;
  subPath?: string;
  autoDeploy?: boolean;
  watchPaths?: string[];
}

/**
 * Aba "Configurações" do detalhe da app: renomear, perfil/recursos, porta,
 * branch/imagem e health check. Salvar reconcilia. Renomear recria os recursos
 * (breve indisponibilidade) — avisado na UI.
 */
export function SettingsTab({ app }: { app: Application }) {
  const queryClient = useQueryClient();
  const cfg = app.sourceConfig ?? {};

  const [name, setName] = useState(app.name);
  const [profile, setProfile] = useState(app.profile);
  const [cpu, setCpu] = useState(String((cfg.customResources as any)?.cpu ?? (app as any).customResources?.cpu ?? ""));
  const [memory, setMemory] = useState(String((app as any).customResources?.memory ?? ""));
  const [port, setPort] = useState(app.port ?? 3000);
  const [branch, setBranch] = useState(String(cfg.branch ?? ""));
  const [image, setImage] = useState(String(cfg.image ?? ""));
  const [healthPath, setHealthPath] = useState(String(cfg.healthPath ?? "/"));
  const [dockerfile, setDockerfile] = useState(String(cfg.dockerfile ?? ""));
  const [subPath, setSubPath] = useState(String(cfg.subPath ?? ""));
  const [autoDeploy, setAutoDeploy] = useState(cfg.autoDeploy !== false);
  const [watchPaths, setWatchPaths] = useState((Array.isArray(cfg.watchPaths) ? cfg.watchPaths : []).join(", "));

  const parsedWatchPaths = watchPaths.split(",").map((p) => p.trim()).filter(Boolean);
  const buildError = [dockerfile, subPath].map(validateRepoPath).find(Boolean) ?? null;

  const patchMut = useMutation({
    mutationFn: (dto: PatchInput) => api.patch<Application>(`/applications/${app.id}`, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["application", app.id] }),
  });

  const save = async () => {
    const dto: PatchInput = {};
    if (name !== app.name) dto.name = name.trim();
    if (profile !== app.profile) dto.profile = profile;
    if (profile === "CUSTOM" && (cpu || memory)) dto.customResources = { cpu, memory };
    if (port !== app.port) dto.port = Number(port);
    if (branch !== (cfg.branch ?? "")) dto.branch = branch;
    if (image !== (cfg.image ?? "")) dto.image = image;
    if (healthPath !== (cfg.healthPath ?? "/")) dto.healthPath = healthPath;
    if (dockerfile !== (cfg.dockerfile ?? "")) dto.dockerfile = dockerfile.trim();
    if (subPath !== (cfg.subPath ?? "")) dto.subPath = subPath.trim();
    if (autoDeploy !== (cfg.autoDeploy !== false)) dto.autoDeploy = autoDeploy;
    if (parsedWatchPaths.join(",") !== (Array.isArray(cfg.watchPaths) ? cfg.watchPaths : []).join(",")) {
      dto.watchPaths = parsedWatchPaths;
    }
    if (buildError) return toast.error(buildError);
    if (Object.keys(dto).length === 0) return toast.info("Nada alterado.");
    try {
      await patchMut.mutateAsync(dto);
      toast.success("Configurações salvas. Reconciliando…");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <p className="flex items-center gap-2 text-sm font-medium"><Settings2 className="size-4" /> Configurações gerais</p>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="font-mono text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Porta</Label>
            <Input type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Perfil de recursos</Label>
            <select className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={profile} onChange={(e) => setProfile(e.target.value)}>
              {PROFILES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Health check (path)</Label>
            <Input value={healthPath} onChange={(e) => setHealthPath(e.target.value)} placeholder="/" className="font-mono text-xs" />
          </div>
        </div>

        {profile === "CUSTOM" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">CPU (ex.: 500m)</Label><Input value={cpu} onChange={(e) => setCpu(e.target.value)} className="font-mono text-xs" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Memória (ex.: 512Mi)</Label><Input value={memory} onChange={(e) => setMemory(e.target.value)} className="font-mono text-xs" /></div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Branch</Label>
            <Input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" className="font-mono text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Imagem (origem Docker)</Label>
            <Input value={image} onChange={(e) => setImage(e.target.value)} placeholder="ghcr.io/org/app:tag" className="font-mono text-xs" />
          </div>
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-sm font-medium">Build</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Dockerfile</Label>
              <Input value={dockerfile} onChange={(e) => setDockerfile(e.target.value)} placeholder="Dockerfile" className="font-mono text-xs" spellCheck={false} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Contexto de build (monorepo)</Label>
              <Input value={subPath} onChange={(e) => setSubPath(e.target.value)} placeholder="apps/api" className="font-mono text-xs" spellCheck={false} />
            </div>
          </div>
          {buildError ? (
            <p className="text-xs text-destructive">{buildError}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Caminhos relativos à raiz do repositório. Valem a partir do próximo deploy.</p>
          )}
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={autoDeploy} onChange={(e) => setAutoDeploy(e.target.checked)} className="accent-primary" />
            <span className="font-medium">Deploy automático a cada push</span>
          </label>
          <p className="text-xs text-muted-foreground">Desligado, o push é ignorado e o deploy passa a ser só manual.</p>

          {autoDeploy && (
            <div className="space-y-1.5">
              <Label className="text-xs">Caminhos observados (opcional)</Label>
              <Input value={watchPaths} onChange={(e) => setWatchPaths(e.target.value)} placeholder="apps/api, packages/shared" className="font-mono text-xs" spellCheck={false} />
              <p className="text-xs text-muted-foreground">
                Separados por vírgula. Só dispara quando o push mexer nesses caminhos — evita reconstruir todo monorepo a cada commit. Vazio = qualquer alteração dispara.
              </p>
            </div>
          )}
        </div>

        {name !== app.name && <p className="text-xs text-warning">Renomear recria os recursos no cluster (breve indisponibilidade).</p>}

        <Button variant="gradient" size="sm" onClick={save} disabled={patchMut.isPending}><Save className="size-4" /> Salvar e reconciliar</Button>
      </CardContent>
    </Card>
  );
}
