import { Search } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useRequests } from "@/hooks/useRequests";

const statusVariant = (s: number) => (s >= 500 ? "danger" : s >= 400 ? "warning" : "success");
const methodColor = (m: string) =>
  ({ GET: "text-info", POST: "text-success", PUT: "text-warning", PATCH: "text-warning", DELETE: "text-danger" } as Record<string, string>)[m] ?? "text-muted-foreground";

/** Requests: requisições recebidas pelo Traefik (método, host, path, status, latência). */
export function RequestsPage() {
  const [host, setHost] = useState("");
  const { requests, isLoading } = useRequests(host.trim() || undefined);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Requests</h1>
        <p className="text-sm text-muted-foreground">Requisições recebidas pelo Traefik (access log → Loki).</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Filtrar por host (ex.: api.empresa.com)" value={host} onChange={(e) => setHost(e.target.value)} />
      </div>

      <Card>
        <CardContent className="pt-5">
          <div className="grid grid-cols-[5rem_1fr_5rem_5rem] gap-2 border-b border-border pb-2 text-xs font-medium text-muted-foreground">
            <span>Método</span><span>Host / Path</span><span className="text-right">Status</span><span className="text-right">Latência</span>
          </div>
          {isLoading && <p className="py-4 text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && requests.length === 0 && <p className="py-4 text-sm text-muted-foreground">Nenhuma requisição.</p>}
          <div className="divide-y divide-border">
            {requests.map((r, i) => (
              <div key={i} className="grid grid-cols-[5rem_1fr_5rem_5rem] items-center gap-2 py-2 text-sm">
                <span className={cn("font-mono text-xs font-semibold", methodColor(r.method))}>{r.method}</span>
                <span className="truncate font-mono text-xs"><span className="text-muted-foreground">{r.host}</span>{r.path}</span>
                <span className="text-right"><Badge variant={statusVariant(r.status)}>{r.status}</Badge></span>
                <span className="text-right font-mono text-xs text-muted-foreground">{r.durationMs}ms</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
