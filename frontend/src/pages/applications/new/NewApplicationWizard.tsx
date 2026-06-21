import { Box, Check, ChevronLeft, ChevronRight, Container, FileCode, Github, Gitlab, Globe, Plus, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";
import { useApplications } from "@/pages/applications/hooks/useApplications";

const STEPS = ["Origem", "Build", "Recursos", "Variáveis", "Rede"] as const;

const SOURCES = [
  { id: "GITHUB", label: "GitHub", icon: Github, build: "dockerfile" },
  { id: "GITLAB", label: "GitLab", icon: Gitlab, build: "dockerfile" },
  { id: "GITEA", label: "Gitea", icon: FileCode, build: "dockerfile" },
  { id: "DOCKER_IMAGE", label: "Docker Image", icon: Container, build: "image" },
  { id: "DOCKER_COMPOSE", label: "Docker Compose", icon: Box, build: "compose" },
  { id: "NIXPACKS", label: "Nixpacks", icon: Box, build: "auto" },
  { id: "BUILDPACKS", label: "Buildpacks", icon: Box, build: "auto" },
  { id: "STATIC", label: "Static", icon: Globe, build: "auto" },
];

const PROFILES = [
  { id: "NANO", label: "Nano", spec: "0.1 vCPU · 128MB" },
  { id: "SMALL", label: "Small", spec: "0.25 vCPU · 512MB" },
  { id: "MEDIUM", label: "Medium", spec: "0.5 vCPU · 1GB" },
  { id: "LARGE", label: "Large", spec: "1 vCPU · 2GB" },
  { id: "XLARGE", label: "XLarge", spec: "2 vCPU · 4GB" },
];

const STRATEGIES = [
  { id: "ROLLING", label: "Rolling Update", desc: "Substituição gradual" },
  { id: "BLUE_GREEN", label: "Blue/Green", desc: "Troca após validação" },
  { id: "CANARY", label: "Canary", desc: "Tráfego progressivo" },
];

type KV = { key: string; value: string };

function KVEditor({ list, setList, kPlaceholder }: { list: KV[]; setList: (l: KV[]) => void; kPlaceholder: string }) {
  return (
    <div className="space-y-2">
      {list.map((e, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input className="flex-1 font-mono text-xs" value={e.key} onChange={(ev) => setList(list.map((x, idx) => (idx === i ? { ...x, key: ev.target.value } : x)))} placeholder={kPlaceholder} />
          <Input className="flex-1 font-mono text-xs" value={e.value} onChange={(ev) => setList(list.map((x, idx) => (idx === i ? { ...x, value: ev.target.value } : x)))} placeholder="valor" />
          <Button variant="ghost" size="icon" onClick={() => setList(list.filter((_, idx) => idx !== i))}><X className="size-4" /></Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => setList([...list, { key: "", value: "" }])}><Plus className="size-4" /> Adicionar</Button>
    </div>
  );
}

export function NewApplicationWizard() {
  const navigate = useNavigate();
  const { create, isCreating } = useApplications();
  const { projectId, environmentId } = useWorkspaceStore();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: "",
    source: "GITHUB",
    image: "",
    composeFile: "docker-compose.yml",
    dockerfile: "Dockerfile",
    profile: "SMALL",
    rolloutStrategy: "ROLLING",
    port: 3000,
    domain: "",
    tags: "",
  });
  const [buildArgs, setBuildArgs] = useState<KV[]>([]);
  const [env, setEnv] = useState<KV[]>([]);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));
  const buildKind = SOURCES.find((s) => s.id === form.source)?.build ?? "auto";

  async function finish() {
    if (!projectId || !environmentId) return toast.error("Selecione um projeto e um ambiente no topo antes de criar.");
    const sourceConfig: Record<string, unknown> = { domain: form.domain };
    if (buildKind === "image") sourceConfig.image = form.image;
    if (buildKind === "compose") sourceConfig.compose = form.composeFile;
    if (buildKind === "dockerfile") sourceConfig.dockerfile = form.dockerfile;
    try {
      await create({
        projectId,
        environmentId,
        name: form.name || "minha-app",
        source: form.source,
        profile: form.profile,
        rolloutStrategy: form.rolloutStrategy,
        port: form.port,
        sourceConfig,
        env: env.filter((e) => e.key.trim()),
        buildArgs: buildArgs.filter((b) => b.key.trim()),
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      } as any);
      toast.success("Aplicação criada! Iniciando primeiro deploy…");
      navigate("/applications");
    } catch (e) {
      toast.error((e as Error).message || "Falha ao criar aplicação");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Nova Aplicação</h1>

      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div className={cn("flex size-7 items-center justify-center rounded-full text-xs font-semibold", i < step && "bg-primary text-primary-foreground", i === step && "bg-primary/15 text-primary ring-2 ring-primary", i > step && "bg-muted text-muted-foreground")}>
              {i < step ? <Check className="size-4" /> : i + 1}
            </div>
            <span className={cn("text-sm", i === step ? "font-medium text-foreground" : "text-muted-foreground")}>{label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-5 bg-border" />}
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-5 pt-6">
          {step === 0 && (
            <>
              <div className="space-y-1.5"><Label>Nome da aplicação</Label><Input placeholder="api-vendas" value={form.name} onChange={(e) => set({ name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Tags (separadas por vírgula, opcional)</Label><Input placeholder="backend, vendas, crítico" value={form.tags} onChange={(e) => set({ tags: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>De onde vem sua aplicação?</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {SOURCES.map(({ id, label, icon: Icon }) => (
                    <button key={id} onClick={() => set({ source: id })} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors", form.source === id ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/40")}>
                      <Icon className="size-4" /> {label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <div className="space-y-3">
              {buildKind === "dockerfile" && (
                <>
                  <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">✨ Detectamos sua stack. Para repositórios Git você pode escolher o Dockerfile (ou usar outro builder).</div>
                  <Label>Qual Dockerfile usar?</Label>
                  {["Dockerfile", "Dockerfile.prod", "Dockerfile.api", "Dockerfile.worker"].map((d) => (
                    <label key={d} className="flex items-center gap-2 text-sm">
                      <input type="radio" name="dockerfile" checked={form.dockerfile === d} onChange={() => set({ dockerfile: d })} className="accent-primary" /> {d}
                    </label>
                  ))}
                </>
              )}
              {buildKind === "image" && (
                <div className="space-y-1.5"><Label>Imagem Docker</Label><Input placeholder="ghcr.io/empresa/app:latest" value={form.image} onChange={(e) => set({ image: e.target.value })} /><p className="text-xs text-muted-foreground">Imagem pronta — sem build.</p></div>
              )}
              {buildKind === "compose" && (
                <div className="space-y-1.5"><Label>Arquivo docker-compose</Label><Input value={form.composeFile} onChange={(e) => set({ composeFile: e.target.value })} placeholder="docker-compose.yml" /><p className="text-xs text-muted-foreground">Construímos a partir do compose — sem seleção de Dockerfile.</p></div>
              )}
              {buildKind === "auto" && (
                <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">Build automático ({form.source}) — detecta a linguagem e constrói sozinho, sem Dockerfile. 🪄</div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Tamanho</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {PROFILES.map((p) => (
                    <button key={p.id} onClick={() => set({ profile: p.id })} className={cn("flex items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors", form.profile === p.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/40")}>
                      <span className="font-medium">{p.label}</span><span className="text-xs text-muted-foreground">{p.spec}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Estratégia de deploy</Label>
                {STRATEGIES.map((s) => (
                  <button key={s.id} onClick={() => set({ rolloutStrategy: s.id })} className={cn("flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors", form.rolloutStrategy === s.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/40")}>
                    <span className="font-medium">{s.label}</span><span className="text-xs text-muted-foreground">{s.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Variáveis de runtime</Label>
                <p className="text-xs text-muted-foreground">Injetadas no container em execução. Não há como adivinhar — informe as suas.</p>
                <KVEditor list={env} setList={setEnv} kPlaceholder="DATABASE_URL" />
              </div>
              {(buildKind === "dockerfile" || buildKind === "auto" || buildKind === "compose") && (
                <div className="space-y-2 border-t border-border pt-4">
                  <Label>Variáveis de build (build args)</Label>
                  <p className="text-xs text-muted-foreground">Viram <code>--build-arg</code> / <code>ARG</code> durante o build.</p>
                  <KVEditor list={buildArgs} setList={setBuildArgs} kPlaceholder="NODE_VERSION" />
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Porta que sua aplicação escuta (porta alvo)</Label>
                <Input type="number" value={form.port} onChange={(e) => set({ port: +e.target.value })} placeholder="3000" />
                <p className="text-xs text-muted-foreground">É a única coisa de rede que não dá para adivinhar — o tráfego é roteado para essa porta.</p>
              </div>
              <div className="space-y-1.5"><Label>Domínio (opcional)</Label><Input placeholder="api.empresa.com" value={form.domain} onChange={(e) => set({ domain: e.target.value })} /></div>
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">Com domínio: Ingress (Traefik), DNS, TLS (Let's Encrypt) e load balancing automáticos. ✓</div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" onClick={back} disabled={step === 0}><ChevronLeft className="size-4" /> Voltar</Button>
            {step < STEPS.length - 1 ? (
              <Button variant="gradient" onClick={next}>Próximo <ChevronRight className="size-4" /></Button>
            ) : (
              <Button variant="gradient" onClick={finish} disabled={isCreating}>Criar aplicação <Check className="size-4" /></Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
