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
import { isCapivaManaged, readCapivaMarker } from "@/lib/capivaJson";
import { CapivaJsonBadge, CapivaJsonNotice } from "@/pages/applications/components/CapivaJsonNotice";
import type { Application } from "@/pages/applications/hooks/useApplications";
import { isPreviewDisponivel } from "@/pages/applications/preview";

const PROFILES = ["NANO", "SMALL", "MEDIUM", "LARGE", "XLARGE", "CUSTOM"];

/** O que dispara o deploy automático (sourceConfig.deployTrigger). */
const DEPLOY_TRIGGERS = [
  { value: "branch", label: "Push na branch" },
  { value: "tag", label: "Nova tag" },
  { value: "release", label: "Release publicada" },
] as const;
type DeployTrigger = (typeof DEPLOY_TRIGGERS)[number]["value"];

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
  previewsEnabled?: boolean;
  deployTrigger?: DeployTrigger;
  tagPattern?: string;
}

/**
 * Aba "Configurações" do detalhe da app: renomear, perfil/recursos, porta,
 * branch/imagem e health check. Salvar reconcilia. Renomear recria os recursos
 * (breve indisponibilidade) — avisado na UI.
 */
export function SettingsTab({ app }: { app: Application }) {
  const queryClient = useQueryClient();
  const cfg = app.sourceConfig ?? {};
  // Campos declarados pelo capiva.json: o próximo deploy sobrescreveria a edição.
  const marker = readCapivaMarker(cfg);
  const managed = (field: string) => isCapivaManaged(marker, field);

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
  const previewsSalvos = (cfg.previews as { enabled?: boolean } | undefined)?.enabled === true;
  const [previewsEnabled, setPreviewsEnabled] = useState(previewsSalvos);
  const savedTrigger = (cfg.deployTrigger as DeployTrigger | undefined) ?? "branch";
  const [deployTrigger, setDeployTrigger] = useState<DeployTrigger>(savedTrigger);
  const [tagPattern, setTagPattern] = useState(String(cfg.tagPattern ?? ""));

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
    if (previewsEnabled !== previewsSalvos) dto.previewsEnabled = previewsEnabled;
    if (deployTrigger !== savedTrigger) dto.deployTrigger = deployTrigger;
    if (tagPattern.trim() !== (cfg.tagPattern ?? "")) dto.tagPattern = tagPattern.trim();
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
        <CapivaJsonNotice sourceConfig={cfg} fields={["port", "profile", "healthPath", "dockerfile", "subPath"]} />

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="font-mono text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Porta<CapivaJsonBadge sourceConfig={cfg} field="port" /></Label>
            <Input type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} disabled={managed("port")} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Perfil de recursos<CapivaJsonBadge sourceConfig={cfg} field="profile" /></Label>
            <select className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm disabled:opacity-50" value={profile} onChange={(e) => setProfile(e.target.value)} disabled={managed("profile")}>
              {PROFILES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Health check (path)<CapivaJsonBadge sourceConfig={cfg} field="healthPath" /></Label>
            <Input value={healthPath} onChange={(e) => setHealthPath(e.target.value)} placeholder="/" className="font-mono text-xs" disabled={managed("healthPath")} />
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
              <Label className="text-xs">Dockerfile<CapivaJsonBadge sourceConfig={cfg} field="dockerfile" /></Label>
              <Input value={dockerfile} onChange={(e) => setDockerfile(e.target.value)} placeholder="Dockerfile" className="font-mono text-xs" spellCheck={false} disabled={managed("dockerfile")} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Contexto de build (monorepo)<CapivaJsonBadge sourceConfig={cfg} field="subPath" /></Label>
              <Input value={subPath} onChange={(e) => setSubPath(e.target.value)} placeholder="apps/api" className="font-mono text-xs" spellCheck={false} disabled={managed("subPath")} />
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
            <span className="font-medium">Deploy automático</span>
          </label>
          <p className="text-xs text-muted-foreground">Desligado, o deploy passa a ser só manual.</p>

          {autoDeploy && (
            <div className="space-y-1.5">
              <Label className="text-xs">Disparar com</Label>
              <select className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={deployTrigger} onChange={(e) => setDeployTrigger(e.target.value as DeployTrigger)}>
                {DEPLOY_TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          )}

          {autoDeploy && deployTrigger !== "branch" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Padrão de tag (opcional)</Label>
              <Input value={tagPattern} onChange={(e) => setTagPattern(e.target.value)} placeholder="v*" className="font-mono text-xs" spellCheck={false} />
              <p className="text-xs text-muted-foreground">Use * e ?. Vazio aceita qualquer tag.</p>
            </div>
          )}

          {autoDeploy && deployTrigger === "branch" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Caminhos observados (opcional)</Label>
              <Input value={watchPaths} onChange={(e) => setWatchPaths(e.target.value)} placeholder="apps/api, packages/shared" className="font-mono text-xs" spellCheck={false} />
              <p className="text-xs text-muted-foreground">
                Separados por vírgula. Só dispara quando o push mexer nesses caminhos. Vazio: qualquer alteração dispara.
              </p>
            </div>
          )}
        </div>

        {isPreviewDisponivel(app) && (
          <div className="space-y-1.5 border-t border-border pt-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={previewsEnabled} onChange={(e) => setPreviewsEnabled(e.target.checked)} className="accent-primary" />
              <span className="font-medium">Ambientes de preview por PR</span>
            </label>
            <p className="text-xs text-muted-foreground">
              Cada PR para a branch {String(cfg.branch ?? "main")} ganha um ambiente próprio. Ele é removido quando o PR é fechado.
            </p>
          </div>
        )}

        {name !== app.name && <p className="text-xs text-warning">Renomear recria os recursos no cluster (breve indisponibilidade).</p>}

        <Button variant="gradient" size="sm" onClick={save} disabled={patchMut.isPending}><Save className="size-4" /> Salvar e reconciliar</Button>
      </CardContent>
    </Card>
  );
}
