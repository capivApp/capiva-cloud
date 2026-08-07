import { LinearGradient } from "expo-linear-gradient";
import { Stack, router } from "expo-router";
import { Boxes, GitBranch, Globe, Settings2, Trash2 } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { ChipSelector } from "@/components/chip-selector";
import { IconBadge } from "@/components/icon-badge";
import { Screen } from "@/components/screen";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useCreateApplication } from "@/hooks/useApplications";
import { useEnvironments } from "@/hooks/useEnvironments";
import { useGitBranches, useGitConnections, useGitRepos } from "@/hooks/useGit";
import { brandGradient } from "@/lib/theme";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

const SOURCES = [
  { id: "DOCKER_IMAGE", label: "Imagem Docker" },
  { id: "GITHUB", label: "GitHub" },
  { id: "GITLAB", label: "GitLab" },
  { id: "GITEA", label: "Gitea" },
];

const GIT_SOURCES = ["GITHUB", "GITLAB", "GITEA"];
const PROFILES = ["NANO", "SMALL", "MEDIUM", "LARGE", "XLARGE"];

interface KV {
  key: string;
  value: string;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</Text>
      {children}
    </View>
  );
}

/** Criação de aplicação (espelho do wizard web; o backend dispara o 1º deploy). */
export default function NewApplicationScreen() {
  const projectId = useWorkspaceStore((s) => s.projectId);
  const { environments } = useEnvironments();
  const { connections } = useGitConnections();
  const { create, isCreating } = useCreateApplication();

  const [name, setName] = useState("");
  const [environmentId, setEnvironmentId] = useState<string | null>(null);
  const [source, setSource] = useState("DOCKER_IMAGE");
  const [image, setImage] = useState("");
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [repoFilter, setRepoFilter] = useState("");
  const [repoFullName, setRepoFullName] = useState<string | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [port, setPort] = useState("3000");
  const [profile, setProfile] = useState("SMALL");
  const [domain, setDomain] = useState("");
  const [env, setEnv] = useState<KV[]>([]);
  const [error, setError] = useState<string | null>(null);

  const isGit = GIT_SOURCES.includes(source);
  const { repos } = useGitRepos(isGit ? connectionId : null);
  const { branches } = useGitBranches(isGit ? connectionId : null, repoFullName);
  const repo = repos.find((r) => r.fullName === repoFullName);

  const filteredRepos = useMemo(() => {
    const term = repoFilter.trim().toLowerCase();
    const matches = term ? repos.filter((r) => r.fullName.toLowerCase().includes(term)) : repos;
    return matches.slice(0, 15);
  }, [repos, repoFilter]);

  const activeEnvironment = environmentId ?? environments[0]?.id ?? null;

  const validate = (): string | null => {
    if (!projectId) return "Selecione um projeto na aba Aplicações antes de criar.";
    if (!activeEnvironment) return "Nenhum ambiente disponível — crie um no painel web.";
    if (!name.trim()) return "Informe o nome da aplicação.";
    if (source === "DOCKER_IMAGE" && !image.trim()) return "Informe a imagem (ex.: nginx:latest).";
    if (isGit && (!connectionId || !repo || !branch)) return "Selecione conexão, repositório e branch.";
    return null;
  };

  const buildSourceConfig = (): Record<string, unknown> => {
    const config: Record<string, unknown> = { domain: domain.trim() };
    if (source === "DOCKER_IMAGE") config.image = image.trim();
    if (isGit && repo) {
      config.dockerfile = "Dockerfile";
      config.repoUrl = repo.cloneUrl;
      config.repo = repo.fullName;
      config.fullName = repo.fullName;
      config.branch = branch;
    }
    return config;
  };

  const submit = async () => {
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    try {
      const app = await create({
        projectId: projectId!,
        environmentId: activeEnvironment!,
        name: name.trim(),
        source,
        gitConnectionId: isGit ? connectionId! : undefined,
        sourceConfig: buildSourceConfig(),
        profile,
        rolloutStrategy: "ROLLING",
        port: Number(port) || 3000,
        env: env.filter((e) => e.key.trim()),
      });
      router.replace({ pathname: "/apps/[id]", params: { id: app.id } });
    } catch (err) {
      setError((err as Error).message || "Falha ao criar aplicação.");
    }
  };

  const setEnvAt = (index: number, patch: Partial<KV>) =>
    setEnv((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <Screen>
      <Stack.Screen options={{ title: "Nova aplicação" }} />

      <Card className="rounded-2xl border-border/60 py-5">
        <CardHeader className="flex-row items-center gap-3">
          <IconBadge icon={Boxes} tint="primary" />
          <CardTitle className="text-base">Básico</CardTitle>
        </CardHeader>
        <CardContent className="gap-4">
          <Field label="Nome">
            <Input value={name} onChangeText={setName} placeholder="minha-api" autoCapitalize="none" />
          </Field>
          <Field label="Ambiente">
            <ChipSelector
              options={environments.map((e) => ({ id: e.id, label: e.name }))}
              selectedId={activeEnvironment}
              onSelect={setEnvironmentId}
            />
          </Field>
          <Field label="Perfil">
            <ChipSelector
              options={PROFILES.map((p) => ({ id: p, label: p }))}
              selectedId={profile}
              onSelect={setProfile}
            />
          </Field>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/60 py-5">
        <CardHeader className="flex-row items-center gap-3">
          <IconBadge icon={GitBranch} tint="secondary" />
          <CardTitle className="text-base">Origem</CardTitle>
        </CardHeader>
        <CardContent className="gap-4">
          <ChipSelector options={SOURCES} selectedId={source} onSelect={setSource} />

          {source === "DOCKER_IMAGE" && (
            <Field label="Imagem">
              <Input value={image} onChangeText={setImage} placeholder="nginx:latest" autoCapitalize="none" />
            </Field>
          )}

          {isGit && (
            <>
              <Field label="Conexão">
                <ChipSelector
                  options={connections
                    .filter((c) => c.provider === source)
                    .map((c) => ({ id: c.id, label: c.accountLogin ?? c.provider }))}
                  selectedId={connectionId}
                  onSelect={(id) => {
                    setConnectionId(id);
                    setRepoFullName(null);
                    setBranch(null);
                  }}
                />
              </Field>
              {connectionId && (
                <Field label="Repositório">
                  <Input
                    value={repoFilter}
                    onChangeText={setRepoFilter}
                    placeholder="Filtrar repositórios…"
                    autoCapitalize="none"
                  />
                  <View className="gap-1.5">
                    {filteredRepos.map((r) => {
                      const active = r.fullName === repoFullName;
                      return (
                        <Pressable
                          key={r.id}
                          onPress={() => {
                            setRepoFullName(r.fullName);
                            setBranch(r.defaultBranch);
                          }}
                          className={`rounded-lg border p-3 ${active ? "border-primary bg-primary/10" : "border-border/60 bg-background"}`}
                        >
                          <Text className="text-sm font-medium">{r.fullName}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </Field>
              )}
              {repoFullName && (
                <Field label="Branch">
                  <ChipSelector
                    options={branches.map((b) => ({ id: b, label: b }))}
                    selectedId={branch}
                    onSelect={setBranch}
                  />
                </Field>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/60 py-5">
        <CardHeader className="flex-row items-center gap-3">
          <IconBadge icon={Globe} tint="success" />
          <CardTitle className="text-base">Rede</CardTitle>
        </CardHeader>
        <CardContent className="gap-4">
          <Field label="Porta">
            <Input value={port} onChangeText={setPort} keyboardType="number-pad" placeholder="3000" />
          </Field>
          <Field label="Domínio (opcional)">
            <Input
              value={domain}
              onChangeText={setDomain}
              placeholder="app.seudominio.com.br"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Field>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/60 py-5">
        <CardHeader className="flex-row items-center gap-3">
          <IconBadge icon={Settings2} tint="muted" />
          <CardTitle className="flex-1 text-base">Variáveis de ambiente</CardTitle>
          <Pressable onPress={() => setEnv((rows) => [...rows, { key: "", value: "" }])}>
            <Text className="text-sm font-semibold text-primary">+ Adicionar</Text>
          </Pressable>
        </CardHeader>
        <CardContent className="gap-2">
          {env.map((row, index) => (
            <View key={index} className="flex-row items-center gap-2">
              <Input
                value={row.key}
                onChangeText={(key) => setEnvAt(index, { key })}
                placeholder="CHAVE"
                autoCapitalize="characters"
                autoCorrect={false}
                className="flex-1"
              />
              <Input
                value={row.value}
                onChangeText={(value) => setEnvAt(index, { value })}
                placeholder="valor"
                autoCapitalize="none"
                autoCorrect={false}
                className="flex-1"
              />
              <Pressable onPress={() => setEnv((rows) => rows.filter((_, i) => i !== index))} className="p-1">
                <Trash2 color="#ef4444" size={16} />
              </Pressable>
            </View>
          ))}
          {!env.length && <Text variant="muted">Nenhuma variável definida.</Text>}
        </CardContent>
      </Card>

      {error && (
        <View className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
          <Text className="text-sm text-destructive">{error}</Text>
        </View>
      )}

      <Pressable onPress={submit} disabled={isCreating} className="active:opacity-90">
        <LinearGradient
          colors={brandGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ borderRadius: 12, height: 48, alignItems: "center", justifyContent: "center", opacity: isCreating ? 0.7 : 1 }}
        >
          <Text className="text-base font-semibold text-white">
            {isCreating ? "Criando…" : "Criar e implantar"}
          </Text>
        </LinearGradient>
      </Pressable>
    </Screen>
  );
}
