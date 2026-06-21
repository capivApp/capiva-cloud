import { useQuery } from "@tanstack/react-query";
import { Link2, Network } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ConnectDependencyDrawer } from "@/pages/dependencies/components/ConnectDependencyDrawer";
import { useApplications } from "@/pages/applications/hooks/useApplications";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

interface Dep { id: string; sourceId: string; targetId: string }

const NODE_W = 150;
const NODE_H = 56;

export function DependenciesPage() {
  const projectId = useWorkspaceStore((s) => s.projectId);
  const { applications } = useApplications(projectId);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Posições (drag-and-drop) — layout inicial em grade.
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>({});
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [pending, setPending] = useState<{ sourceId: string; target: { id: string; name: string } } | null>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const positionFor = useCallback(
    (id: string, i: number) => pos[id] ?? { x: 40 + (i % 4) * 180, y: 40 + Math.floor(i / 4) * 120 },
    [pos],
  );

  // Carrega todas as arestas (dependências de cada app) e mescla.
  const edges = useQuery({
    queryKey: ["dependencies", projectId, applications.map((a) => a.id).join(",")],
    enabled: applications.length > 0,
    queryFn: async () => {
      const all = await Promise.all(applications.map((a) => api.get<Dep[]>(`/applications/${a.id}/dependencies`)));
      const map = new Map<string, Dep>();
      all.flat().forEach((d) => map.set(d.id, d));
      return [...map.values()];
    },
  });

  function onPointerDownNode(e: React.PointerEvent, id: string, i: number) {
    if (connectFrom) return;
    const p = positionFor(id, i);
    dragRef.current = { id, dx: e.clientX - p.x, dy: e.clientY - p.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const { id, dx, dy } = dragRef.current;
    setPos((s) => ({ ...s, [id]: { x: Math.max(0, e.clientX - dx), y: Math.max(0, e.clientY - dy) } }));
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  function onNodeClick(id: string) {
    if (!connectFrom) {
      setConnectFrom(id);
      return;
    }
    if (connectFrom === id) {
      setConnectFrom(null);
      return;
    }
    // Abre o drawer para configurar QUAIS variáveis injetar e O QUE são.
    const target = applications.find((a) => a.id === id);
    if (target) setPending({ sourceId: connectFrom, target: { id: target.id, name: target.name } });
    setConnectFrom(null);
  }

  const centers = useMemo(() => {
    const m: Record<string, { x: number; y: number }> = {};
    applications.forEach((a, i) => {
      const p = positionFor(a.id, i);
      m[a.id] = { x: p.x + NODE_W / 2, y: p.y + NODE_H / 2 };
    });
    return m;
  }, [applications, positionFor]);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dependências</h1>
        <p className="text-sm text-muted-foreground">
          Arraste os serviços para organizar. Clique em um e depois em outro para conectar — DNS interno e variáveis (DATABASE_URL, REDIS_URL…) são gerados automaticamente.
        </p>
      </div>

      {applications.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground"><Network className="size-6" /><p className="text-sm">Crie aplicações para montar o grafo.</p></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div
              ref={canvasRef}
              className="relative h-[520px] w-full overflow-hidden rounded-xl bg-[radial-gradient(circle,hsl(var(--border))_1px,transparent_1px)] [background-size:20px_20px]"
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              <svg className="pointer-events-none absolute inset-0 h-full w-full">
                {(edges.data ?? []).map((d) => {
                  const a = centers[d.sourceId];
                  const b = centers[d.targetId];
                  if (!a || !b) return null;
                  return <line key={d.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="hsl(var(--primary))" strokeWidth={2} markerEnd="url(#arrow)" opacity={0.6} />;
                })}
                <defs>
                  <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="hsl(var(--primary))" /></marker>
                </defs>
              </svg>

              {applications.map((a, i) => {
                const p = positionFor(a.id, i);
                return (
                  <div
                    key={a.id}
                    onPointerDown={(e) => onPointerDownNode(e, a.id, i)}
                    onClick={() => onNodeClick(a.id)}
                    style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}
                    className={cn(
                      "absolute flex cursor-grab select-none items-center gap-2 rounded-lg border bg-card px-3 text-sm shadow-sm active:cursor-grabbing",
                      connectFrom === a.id ? "border-primary ring-2 ring-primary" : "border-border hover:border-primary/50",
                    )}
                  >
                    <Link2 className="size-4 text-primary" />
                    <span className="truncate font-medium">{a.name}</span>
                  </div>
                );
              })}

              {connectFrom && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-primary/90 px-3 py-1 text-xs text-primary-foreground">
                  Clique no serviço de destino para conectar (ESC para cancelar)
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <ConnectDependencyDrawer
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        sourceId={pending?.sourceId ?? null}
        target={pending?.target ?? null}
        onConnected={() => edges.refetch()}
      />
    </div>
  );
}
