import { ScrollText, Search } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuditLogs } from "@/hooks/useAuditLogs";

const actorLabel = (l: { userId: string | null; apiKeyId: string | null }) =>
  l.apiKeyId ? "API key" : l.userId ? l.userId.slice(0, 8) : "sistema";

/** Audit Logs: ações-chave da organização (ator, ação, alvo, data). */
export function AuditLogsPage() {
  const [event, setEvent] = useState("");
  const { logs, isLoading } = useAuditLogs(event.trim() || undefined);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
        <p className="text-sm text-muted-foreground">Registro das ações-chave da organização.</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Filtrar por ação (ex.: application.deploy)" value={event} onChange={(e) => setEvent(e.target.value)} />
      </div>

      <Card>
        <CardContent className="pt-5">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && logs.length === 0 && <p className="text-sm text-muted-foreground">Nenhum registro.</p>}
          <div className="divide-y divide-border">
            {logs.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <ScrollText className="size-4 shrink-0 text-muted-foreground" />
                  <Badge variant="default">{l.event}</Badge>
                  {l.detail && <span className="text-muted-foreground">{l.detail}</span>}
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                  <span>{actorLabel(l)}</span>
                  <span>{new Date(l.at).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
