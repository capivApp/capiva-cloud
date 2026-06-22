import { container } from "@di/index";
import { verifyAccessToken } from "@auth/tokens";
import { SessionService } from "@service/SessionService";
import { TerminalService } from "@service/TerminalService";
import { NodeTerminalService } from "@service/NodeTerminalService";
import { withTransaction } from "@database/withTransaction";

interface ActiveShell {
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  close: () => void;
}

/** Sessão ativa anexada ao WebSocket (terminal de pod ou de nó). */
interface TerminalConnection {
  kind: "pod" | "node";
  targetId: string;
  organizationId: string;
  shell?: ActiveShell;
}

const POD_PATH = /^\/terminal\/applications\/([^/]+)$/;
const NODE_PATH = /^\/terminal\/nodes\/([^/]+)$/;

/**
 * Gateway WebSocket nativo (Bun.serve) dos terminais, em porta dedicada.
 * Decisão de transporte: WS nativo do Bun (sem depender de `ws` sobre Express).
 *
 * Rotas: `/terminal/applications/:id` (exec no pod) e `/terminal/nodes/:nodeId`
 * (shell SSH no nó). Browser → servidor: stdin como texto; resize como frame
 * binário JSON ({cols,rows}). Servidor → browser: saída como texto.
 * Auth: `?access_token=` + `&org=` (igual ao SSE) validando assinatura e sessão.
 */
export function startTerminalGateway(port: number): void {
  const pods = container.get(TerminalService);
  const nodes = container.get(NodeTerminalService);

  Bun.serve<TerminalConnection>({
    port,
    async fetch(req, server) {
      const url = new URL(req.url);
      const pod = url.pathname.match(POD_PATH);
      const node = url.pathname.match(NODE_PATH);
      if (!pod && !node) return new Response("not found", { status: 404 });

      const token = url.searchParams.get("access_token");
      const organizationId = url.searchParams.get("org");
      if (!token || !organizationId) return new Response("missing credentials", { status: 401 });

      try {
        const payload = verifyAccessToken(token);
        const active = await withTransaction(() => container.get(SessionService).isActive(payload.sid));
        if (!active) return new Response("session revoked", { status: 401 });
      } catch {
        return new Response("invalid token", { status: 401 });
      }

      const data: TerminalConnection = pod
        ? { kind: "pod", targetId: pod[1], organizationId }
        : { kind: "node", targetId: node![1], organizationId };
      return server.upgrade(req, { data }) ? undefined : new Response("upgrade failed", { status: 400 });
    },
    websocket: {
      async open(ws) {
        const { kind, targetId, organizationId } = ws.data;
        const onData = (chunk: string) => ws.send(chunk);
        const onClose = () => {
          try {
            ws.send("\r\n\x1b[33m[sessão encerrada]\x1b[0m\r\n");
            ws.close();
          } catch {
            /* já fechado */
          }
        };
        try {
          if (kind === "pod") {
            const target = await pods.resolveTarget(targetId, { organizationId });
            ws.data.shell = await pods.k8sExec(target, { onData: (c) => ws.send(c.toString("utf8")), onClose });
            ws.send(`\x1b[32mConectado a ${target.pod} (${target.container}).\x1b[0m\r\n`);
          } else {
            const target = await nodes.resolveTarget(targetId, { organizationId });
            ws.data.shell = await nodes.sshShell(target, { onData, onClose });
            ws.send(`\x1b[32mConectado via SSH a ${target.label}.\x1b[0m\r\n`);
          }
        } catch (error) {
          ws.send(`\x1b[31m${(error as Error).message}\x1b[0m\r\n`);
          ws.close();
        }
      },
      message(ws, message) {
        const shell = ws.data.shell;
        if (!shell) return;
        // Binário → controle (resize); texto → stdin.
        if (typeof message !== "string") {
          try {
            const { cols, rows } = JSON.parse(Buffer.from(message).toString("utf8"));
            if (Number.isInteger(cols) && Number.isInteger(rows)) shell.resize(cols, rows);
          } catch {
            /* frame de controle inválido — ignora */
          }
          return;
        }
        shell.write(message);
      },
      close(ws) {
        ws.data.shell?.close();
      },
    },
  });

  console.log(`🖥️  Terminal WS (Bun) em ws://localhost:${port}/terminal/{applications|nodes}/:id`);
}
