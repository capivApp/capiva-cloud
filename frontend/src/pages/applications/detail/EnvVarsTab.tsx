import { Eye, EyeOff, KeyRound, Link2, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useEnvVars, type EnvVar } from "@/pages/applications/hooks/useEnvVars";

interface Row {
  key: string;
  value: string;
  secret: boolean;
  /** Segredo existente cujo valor vem mascarado (vazio = manter atual). */
  masked: boolean;
  reveal: boolean;
}

/** Converte um bloco `.env` colado em linhas de variáveis (ignora comentários). */
function parseDotenv(text: string): { key: string; value: string }[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const eq = l.indexOf("=");
      if (eq === -1) return null;
      const key = l.slice(0, eq).trim().replace(/^export\s+/, "");
      let value = l.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      return key ? { key, value } : null;
    })
    .filter((x): x is { key: string; value: string } => x !== null);
}

const toRows = (vars: EnvVar[]): Row[] =>
  vars
    .filter((v) => v.source === "MANUAL")
    .map((v) => ({ key: v.key, value: v.value, secret: v.secret, masked: v.secret && v.hasValue, reveal: false }));

/**
 * Aba "Variáveis" do detalhe da aplicação. Edita em lote as variáveis MANUAL
 * (adicionar/colar .env/marcar secret/mostrar-ocultar) e salva reconciliando o
 * Deployment. Variáveis INJECTED (de dependências) aparecem somente leitura.
 */
export function EnvVarsTab({ applicationId }: { applicationId: string }) {
  const { vars, isLoading, save, isSaving, remove } = useEnvVars(applicationId);
  const injected = useMemo(() => vars.filter((v) => v.source === "INJECTED"), [vars]);

  const [rows, setRows] = useState<Row[]>([]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState("");

  // Reseta o rascunho quando o servidor muda (ex.: após salvar/reconciliar).
  const serverKey = useMemo(() => JSON.stringify(toRows(vars)), [vars]);
  useEffect(() => setRows(toRows(vars)), [serverKey]);

  const update = (i: number, patch: Partial<Row>) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const addRow = () => setRows((r) => [...r, { key: "", value: "", secret: false, masked: false, reveal: false }]);
  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));

  const applyPaste = () => {
    const parsed = parseDotenv(paste);
    if (parsed.length === 0) return toast.error("Nada para importar.");
    setRows((r) => {
      const byKey = new Map(r.map((row) => [row.key, row] as const));
      for (const p of parsed) byKey.set(p.key, { key: p.key, value: p.value, secret: byKey.get(p.key)?.secret ?? false, masked: false, reveal: false });
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
    try {
      // Segredo mascarado e em branco → envia "" para manter o valor atual.
      await save(ready.map((r) => ({ key: r.key.trim(), value: r.value, secret: r.secret })));
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
              <Button variant="outline" size="sm" onClick={() => setPasteOpen((o) => !o)}>Colar .env</Button>
              <Button variant="outline" size="sm" onClick={addRow}><Plus className="size-3.5" /> Adicionar</Button>
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
                <Button variant="ghost" size="sm" onClick={() => { setPaste(""); setPasteOpen(false); }}>Cancelar</Button>
                <Button variant="gradient" size="sm" onClick={applyPaste}>Importar</Button>
              </div>
            </div>
          )}

          {isLoading && <p className="text-sm text-muted-foreground">Carregando variáveis…</p>}
          {!isLoading && rows.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma variável. Adicione ou cole um .env.</p>}

          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={row.key}
                onChange={(e) => update(i, { key: e.target.value })}
                placeholder="CHAVE"
                className="w-2/5 font-mono text-xs"
              />
              <Input
                value={row.value}
                onChange={(e) => update(i, { value: e.target.value, masked: false })}
                placeholder={row.masked ? "•••••• (mantém atual)" : "valor"}
                type={row.secret && !row.reveal ? "password" : "text"}
                className="flex-1 font-mono text-xs"
              />
              <Button
                variant={row.secret ? "default" : "ghost"}
                size="icon"
                title={row.secret ? "Secreta (cifrada)" : "Marcar como secreta"}
                onClick={() => update(i, { secret: !row.secret })}
              >
                <KeyRound className="size-4" />
              </Button>
              {row.secret && (
                <Button variant="ghost" size="icon" title={row.reveal ? "Ocultar" : "Mostrar"} onClick={() => update(i, { reveal: !row.reveal })}>
                  {row.reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => removeRow(i)}><Trash2 className="size-4" /></Button>
            </div>
          ))}

          <div className="flex justify-end pt-1">
            <Button variant="gradient" size="sm" onClick={onSave} disabled={isSaving}><Save className="size-4" /> Salvar e reconciliar</Button>
          </div>
        </CardContent>
      </Card>

      {injected.length > 0 && (
        <Card>
          <CardContent className="space-y-2 pt-5">
            <p className="text-sm font-medium">Injetadas por dependências</p>
            <p className="text-xs text-muted-foreground">Geradas automaticamente por conexões com bancos/serviços. Removê-las pode quebrar a conexão.</p>
            {injected.map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded border border-border px-2 py-1.5 text-xs">
                <span className="flex items-center gap-2 font-mono">
                  <Link2 className="size-3.5 text-muted-foreground" /> {v.key}
                  {v.secret && <Badge variant="warning">secreta</Badge>}
                </span>
                <Button variant="ghost" size="icon" onClick={() => delInjected(v.key)}><Trash2 className="size-4" /></Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
