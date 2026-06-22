import { Copy, TerminalSquare, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { WebTerminal } from "@/components/WebTerminal";
import { useClusterProvisioning, type ClusterNode } from "@/hooks/useClusterProvisioning";

/** Gestão de nós de um cluster: listar, cordon/uncordon, remover, comando de join. */
export function ClusterNodesDrawer({ open, onClose, clusterId }: { open: boolean; onClose: () => void; clusterId: string | null }) {
  const { listNodes, cordon, removeNode, joinCommand } = useClusterProvisioning();
  const [nodes, setNodes] = useState<ClusterNode[]>([]);
  const [join, setJoin] = useState<string | null>(null);
  const [terminalNode, setTerminalNode] = useState<ClusterNode | null>(null);

  async function refresh() {
    if (!clusterId) return;
    listNodes(clusterId).then(setNodes).catch(() => setNodes([]));
  }

  useEffect(() => {
    if (open) refresh();
  }, [open, clusterId]);

  async function showJoin(role: "WORKER" | "CONTROL_PLANE") {
    if (!clusterId) return;
    try {
      const r = await joinCommand(clusterId, role);
      setJoin(r.command);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Nós do cluster" description="Adicione/remova nós e gerencie agendamento." width="max-w-lg">
      <div className="space-y-4">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => showJoin("WORKER")}>Comando: + Worker</Button>
          <Button variant="outline" size="sm" onClick={() => showJoin("CONTROL_PLANE")}>Comando: + Control plane</Button>
        </div>
        {join && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Cole no novo nó:</span><Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(join); toast.success("Copiado"); }}><Copy className="size-4" /></Button></div>
            <pre className="overflow-auto rounded-lg bg-background p-3 font-mono text-xs text-muted-foreground">{join}</pre>
          </div>
        )}

        <div className="space-y-2">
          {nodes.length === 0 && <p className="text-sm text-muted-foreground">Nenhum nó registrado (cluster pode ter sido registrado por token).</p>}
          {nodes.map((n) => (
            <div key={n.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant={n.role === "CONTROL_PLANE" ? "default" : "muted"}>{n.role === "CONTROL_PLANE" ? "control plane" : "worker"}</Badge>
                <span className="font-medium">{n.host}</span>
                <span className="text-xs text-muted-foreground">{n.status}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" title="Terminal SSH" onClick={() => setTerminalNode(terminalNode?.id === n.id ? null : n)}><TerminalSquare className="size-4" /></Button>
                <Button variant="ghost" size="sm" onClick={async () => { await cordon({ clusterId: clusterId!, node: n.internalIp ?? n.host, schedulable: false }).then(() => toast.success("Nó isolado (cordon)")).catch((e) => toast.error((e as Error).message)); }}>Cordon</Button>
                <Button variant="ghost" size="icon" onClick={async () => { await removeNode({ clusterId: clusterId!, nodeId: n.id }).then(() => { toast.success("Nó removido"); refresh(); }).catch((e) => toast.error((e as Error).message)); }}><Trash2 className="size-4" /></Button>
              </div>
            </div>
          ))}
        </div>

        {terminalNode && (
          <div className="space-y-1.5 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">Terminal SSH · {terminalNode.host}</p>
            <WebTerminal wsPath={`/terminal/nodes/${terminalNode.id}`} className="h-80 overflow-hidden rounded-lg bg-[#0a0a0a] p-2" />
          </div>
        )}
      </div>
    </Drawer>
  );
}
