import { Eye, EyeOff, Hammer, KeyRound, Link2, Plus, Save, Trash2, Vault } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useBuildArgs, type BuildArg } from "@/pages/applications/hooks/useBuildArgs";
import {
  useEnvVars,
  type EnvVar,
  type ExternalEnvRef,
} from "@/pages/applications/hooks/useEnvVars";
import { useSecretStores, type SecretStore } from "@/hooks/useSecretStores";
import { useSyncedDraft } from "@/hooks/useSyncedDraft";

interface Row {
  key: string;
  value: string;
  secret: boolean;
  /** Segredo existente cujo valor vem mascarado (vazio = manter atual). */
  masked: boolean;
  reveal: boolean;
  /** Valor lido do cofre externo (referência chave + propriedade). */
  external: ExternalEnvRef | null;
}

const EDITOR_SOURCES = new Set<EnvVar["source"]>(["MANUAL", "EXTERNAL"]);

const toExternal = (v: EnvVar): ExternalEnvRef | null =>
  v.source === "EXTERNAL"
    ? {
        secretStoreId: v.secretStoreId ?? "",
        remoteKey: v.value,
        remoteProperty: v.remoteProperty ?? "",
      }
    : null;

/** Converte um bloco `.env` colado em linhas de variáveis (ignora comentários). */
function parseDotenv(text: string): { key: string; value: string }[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const eq = l.indexOf("=");
      if (eq === -1) return null;
      const key = l
        .slice(0, eq)
        .trim()
        .replace(/^export\s+/, "");
      let value = l.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return key ? { key, value } : null;
    })
    .filter((x): x is { key: string; value: string } => x !== null);
}

const toRows = (vars: EnvVar[]): Row[] =>
  vars
    .filter((v) => EDITOR_SOURCES.has(v.source))
    .map((v) => ({
      key: v.key,
      value: v.value,
      secret: v.secret,
      masked: v.secret && v.hasValue,
      reveal: false,
      external: toExternal(v),
    }));

/** Campos da variável que vem do cofre externo: cofre, chave e propriedade. */
function ExternalFields({
  value,
  stores,
  onChange,
}: {
  value: ExternalEnvRef;
  stores: SecretStore[];
  onChange: (patch: Partial<ExternalEnvRef>) => void;
}) {
  return (
    <div className="flex flex-1 items-center gap-2">
      <select
        className="h-9 w-1/3 rounded-md border border-input bg-background px-2 text-xs"
        value={value.secretStoreId}
        onChange={(e) => onChange({ secretStoreId: e.target.value })}
      >
        <option value="">Cofre</option>
        {stores.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <Input
        value={value.remoteKey}
        onChange={(e) => onChange({ remoteKey: e.target.value })}
        placeholder="chave no cofre"
        className="flex-1 font-mono text-xs"
      />
      <Input
        value={value.remoteProperty ?? ""}
        onChange={(e) => onChange({ remoteProperty: e.target.value })}
        placeholder="propriedade"
        className="w-1/4 font-mono text-xs"
      />
    </div>
  );
}

/**
 * Aba "Variáveis" do detalhe da aplicação. Edita em lote as variáveis MANUAL e as do cofre externo
 * (adicionar/colar .env/marcar secret/mostrar-ocultar) e salva reconciliando o
 * Deployment. Variáveis INJECTED (de dependências) aparecem somente leitura.
 */
export function EnvVarsTab({ applicationId }: { applicationId: string }) {
  const { vars, isLoading, save, isSaving, remove } = useEnvVars(applicationId);
  const { stores } = useSecretStores();
  const injected = useMemo(() => vars.filter((v) => v.source === "INJECTED"), [vars]);

  // Reseta o rascunho quando o servidor muda (ex.: após salvar/reconciliar).
  const serverKey = useMemo(() => JSON.stringify(toRows(vars)), [vars]);
  const [rows, setRows] = useSyncedDraft<Row[]>(serverKey, () => toRows(vars));
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState("");

  const update = (i: number, patch: Partial<Row>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const addRow = () =>
    setRows((r) => [
      ...r,
      { key: "", value: "", secret: false, masked: false, reveal: false, external: null },
    ]);
  const toggleExternal = (i: number, row: Row) =>
    update(i, {
      external: row.external
        ? null
        : { secretStoreId: stores[0]?.id ?? "", remoteKey: "", remoteProperty: "" },
    });
  const updateExternal = (i: number, row: Row, patch: Partial<ExternalEnvRef>) =>
    update(i, { external: { ...(row.external as ExternalEnvRef), ...patch } });
  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));

  const applyPaste = () => {
    const parsed = parseDotenv(paste);
    if (parsed.length === 0) return toast.error("Nada para importar.");
    setRows((r) => {
      const byKey = new Map(r.map((row) => [row.key, row] as const));
      for (const p of parsed)
        byKey.set(p.key, {
          key: p.key,
          value: p.value,
          secret: byKey.get(p.key)?.secret ?? false,
          masked: false,
          reveal: false,
          external: null,
        });
      return [...byKey.values()];
    });
    setPaste("");
    setPasteOpen(false);
    toast.success(`${parsed.length} variável(is) importada(s). Revise e salve.`);
  };

  const onSave = async () => {
    const ready = rows.filter((r) => r.key.trim());
    const keys = ready.map((r) => r.key.trim());
    if (new Set(keys).size !== keys.length) return toast.error("Há chaves duplicadas.");
    if (
      ready.some((r) => r.external && (!r.external.secretStoreId || !r.external.remoteKey.trim()))
    ) {
      return toast.error("Escolha o cofre e informe a chave das variáveis do cofre externo.");
    }
    try {
      // Segredo mascarado e em branco → envia "" para manter o valor atual.
      await save(
        ready.map((r) => ({
          key: r.key.trim(),
          value: r.value,
          secret: r.secret,
          external: r.external,
        })),
      );
      toast.success("Variáveis salvas. Reconciliando…");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const delInjected = async (envKey: string) => {
    try {
      await remove(envKey);
      toast.success("Variável removida.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Variáveis de ambiente</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPasteOpen((o) => !o)}>
                Colar .env
              </Button>
              <Button variant="outline" size="sm" onClick={addRow}>
                <Plus className="size-3.5" /> Adicionar
              </Button>
            </div>
          </div>

          {pasteOpen && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                rows={5}
                placeholder={"KEY=value\nOUTRA=valor # comentários e aspas são tratados"}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPaste("");
                    setPasteOpen(false);
                  }}
                >
                  Cancelar
                </Button>
                <Button variant="gradient" size="sm" onClick={applyPaste}>
                  Importar
                </Button>
              </div>
            </div>
          )}

          {isLoading && <p className="text-sm text-muted-foreground">Carregando variáveis…</p>}
          {!isLoading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma variável. Adicione ou cole um .env.
            </p>
          )}

          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={row.key}
                onChange={(e) => update(i, { key: e.target.value })}
                placeholder="CHAVE"
                className="w-2/5 font-mono text-xs"
              />
              {row.external && (
                <ExternalFields
                  value={row.external}
                  stores={stores}
                  onChange={(patch) => updateExternal(i, row, patch)}
                />
              )}
              {!row.external && (
                <Input
                  value={row.value}
                  onChange={(e) => update(i, { value: e.target.value, masked: false })}
                  placeholder={row.masked ? "•••••• (mantém atual)" : "valor"}
                  type={row.secret && !row.reveal ? "password" : "text"}
                  className="flex-1 font-mono text-xs"
                />
              )}
              {stores.length > 0 && (
                <Button
                  variant={row.external ? "default" : "ghost"}
                  size="icon"
                  title={row.external ? "Do cofre externo" : "Ler do cofre externo"}
                  onClick={() => toggleExternal(i, row)}
                >
                  <Vault className="size-4" />
                </Button>
              )}
              {!row.external && (
                <Button
                  variant={row.secret ? "default" : "ghost"}
                  size="icon"
                  title={row.secret ? "Secreta (cifrada)" : "Marcar como secreta"}
                  onClick={() => update(i, { secret: !row.secret })}
                >
                  <KeyRound className="size-4" />
                </Button>
              )}
              {!row.external && row.secret && (
                <Button
                  variant="ghost"
                  size="icon"
                  title={row.reveal ? "Ocultar" : "Mostrar"}
                  onClick={() => update(i, { reveal: !row.reveal })}
                >
                  {row.reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => removeRow(i)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}

          <div className="flex justify-end pt-1">
            <Button variant="gradient" size="sm" onClick={onSave} disabled={isSaving}>
              <Save className="size-4" /> Salvar e reconciliar
            </Button>
          </div>
        </CardContent>
      </Card>

      <BuildArgsCard applicationId={applicationId} />

      {injected.length > 0 && (
        <Card>
          <CardContent className="space-y-2 pt-5">
            <p className="text-sm font-medium">Injetadas por dependências</p>
            <p className="text-xs text-muted-foreground">
              Geradas automaticamente por conexões com bancos/serviços. Removê-las pode quebrar a
              conexão.
            </p>
            {injected.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between rounded border border-border px-2 py-1.5 text-xs"
              >
                <span className="flex items-center gap-2 font-mono">
                  <Link2 className="size-3.5 text-muted-foreground" /> {v.key}
                  {v.secret && <Badge variant="warning">secreta</Badge>}
                </span>
                <Button variant="ghost" size="icon" onClick={() => delInjected(v.key)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Build args (ARG do Dockerfile): aplicados no PRÓXIMO build via `--build-arg`,
 * não viram env do runtime. Requer `ARG <CHAVE>` declarado no Dockerfile.
 */
function BuildArgsCard({ applicationId }: { applicationId: string }) {
  const { buildArgs, isLoading, save, isSaving } = useBuildArgs(applicationId);
  const serverKey = useMemo(() => JSON.stringify(buildArgs), [buildArgs]);
  const [rows, setRows] = useSyncedDraft<BuildArg[]>(serverKey, () =>
    buildArgs.map((b) => ({ ...b })),
  );

  const update = (i: number, patch: Partial<BuildArg>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const addRow = () => setRows((r) => [...r, { key: "", value: "" }]);
  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));

  const onSave = async () => {
    const ready = rows
      .filter((r) => r.key.trim())
      .map((r) => ({ key: r.key.trim(), value: r.value }));
    if (new Set(ready.map((r) => r.key)).size !== ready.length)
      return toast.error("Há chaves duplicadas.");
    try {
      await save(ready);
      toast.success("Build args salvos. Valem no próximo build.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Hammer className="size-4 text-muted-foreground" />
            <p className="text-sm font-medium">Variáveis de build (build args)</p>
          </div>
          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus className="size-3.5" /> Adicionar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Viram <code>--build-arg</code> no build. Exigem <code>ARG &lt;CHAVE&gt;</code> no
          Dockerfile para terem efeito. Aplicados no próximo deploy.
        </p>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {!isLoading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum build arg.</p>
        )}

        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={row.key}
              onChange={(e) => update(i, { key: e.target.value })}
              placeholder="DATABASE_URL"
              className="w-2/5 font-mono text-xs"
            />
            <Input
              value={row.value}
              onChange={(e) => update(i, { value: e.target.value })}
              placeholder="valor"
              className="flex-1 font-mono text-xs"
            />
            <Button variant="ghost" size="icon" onClick={() => removeRow(i)}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}

        <div className="flex justify-end pt-1">
          <Button variant="gradient" size="sm" onClick={onSave} disabled={isSaving}>
            <Save className="size-4" /> Salvar build args
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
