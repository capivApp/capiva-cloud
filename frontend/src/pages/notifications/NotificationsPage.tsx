import { Bell, Plus, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNotifications, type NotificationType } from "@/hooks/useNotifications";

const TYPES: NotificationType[] = ["DISCORD", "SLACK", "TELEGRAM", "TEAMS", "LARK", "EMAIL", "RESEND", "PUSH", "WEBHOOK"];

// Campos de configuração por tipo (labels + chaves do objeto config).
const FIELDS: Record<NotificationType, { key: string; label: string; placeholder?: string }[]> = {
  DISCORD: [{ key: "webhookUrl", label: "Webhook URL", placeholder: "https://discord.com/api/webhooks/…" }],
  SLACK: [{ key: "webhookUrl", label: "Webhook URL" }],
  TEAMS: [{ key: "webhookUrl", label: "Webhook URL" }],
  LARK: [{ key: "webhookUrl", label: "Webhook URL" }],
  WEBHOOK: [{ key: "webhookUrl", label: "URL" }],
  TELEGRAM: [{ key: "botToken", label: "Bot token" }, { key: "chatId", label: "Chat ID" }],
  RESEND: [{ key: "apiKey", label: "API key" }, { key: "from", label: "From" }, { key: "to", label: "To" }],
  EMAIL: [{ key: "webhookUrl", label: "Gateway URL" }, { key: "to", label: "To" }],
  PUSH: [{ key: "expoTokens", label: "Expo tokens (vírgula)", placeholder: "ExponentPushToken[…], …" }],
};

const EVENT_LABELS: Record<string, string> = {
  "deploy.succeeded": "Deploy concluído",
  "deploy.failed": "Deploy falhou",
  "deploy.rollback": "Rollback",
  downtime: "Indisponibilidade",
  recovery: "Recuperação",
};

/** Notificações: N canais por tipo, cada um com seus eventos. Pronto p/ push (Expo). */
export function NotificationsPage() {
  const { channels, events, isLoading, create, isCreating, test, remove } = useNotifications();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<NotificationType>("DISCORD");
  const [name, setName] = useState("");
  const [config, setConfig] = useState<Record<string, string>>({});
  const [selectedEvents, setSelectedEvents] = useState<string[]>(["deploy.succeeded", "deploy.failed"]);

  const reset = () => { setName(""); setConfig({}); setSelectedEvents(["deploy.succeeded", "deploy.failed"]); setType("DISCORD"); };

  const submit = async () => {
    if (!name.trim()) return toast.error("Informe um nome.");
    const payloadConfig: Record<string, unknown> = { ...config };
    if (type === "PUSH" && config.expoTokens) payloadConfig.expoTokens = config.expoTokens.split(",").map((t) => t.trim()).filter(Boolean);
    try {
      await create({ type, name, config: payloadConfig, events: selectedEvents });
      reset();
      setOpen(false);
      toast.success("Canal criado.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const act = (fn: () => Promise<unknown>, ok: string) => fn().then(() => toast.success(ok)).catch((e) => toast.error((e as Error).message));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notificações</h1>
          <p className="text-sm text-muted-foreground">Adicione quantos canais quiser — vários do mesmo tipo, cada um com seus eventos.</p>
        </div>
        <Button variant="gradient" onClick={() => { reset(); setOpen(true); }}><Plus className="size-4" /> Novo canal</Button>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-5">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && channels.length === 0 && <p className="text-sm text-muted-foreground">Nenhum canal configurado.</p>}
          {channels.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm">
              <div className="flex items-center gap-2">
                <Bell className="size-4 text-muted-foreground" />
                <span className="font-medium">{c.name}</span>
                <Badge variant="muted">{c.type}</Badge>
                <span className="flex flex-wrap gap-1">{c.events.map((e) => <Badge key={e} variant="default">{EVENT_LABELS[e] ?? e}</Badge>)}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" title="Testar" onClick={() => act(() => test(c.id), "Teste enviado")}><Send className="size-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => act(() => remove(c.id), "Canal removido")}><Trash2 className="size-4" /></Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Drawer open={open} onClose={() => setOpen(false)} title="Novo canal" description="Escolha o tipo, configure e selecione os eventos." width="max-w-lg"
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button variant="gradient" onClick={submit} disabled={isCreating}>Salvar</Button></div>}>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Discord #deploys" /></div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={type} onChange={(e) => { setType(e.target.value as NotificationType); setConfig({}); }}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {FIELDS[type].map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label>{f.label}</Label>
              <Input value={config[f.key] ?? ""} onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })} placeholder={f.placeholder} />
            </div>
          ))}
          <div className="space-y-2">
            <Label>Eventos</Label>
            <div className="space-y-1">
              {events.map((e) => (
                <label key={e} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="accent-primary" checked={selectedEvents.includes(e)}
                    onChange={(ev) => setSelectedEvents(ev.target.checked ? [...selectedEvents, e] : selectedEvents.filter((x) => x !== e))} />
                  {EVENT_LABELS[e] ?? e}
                </label>
              ))}
            </div>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
