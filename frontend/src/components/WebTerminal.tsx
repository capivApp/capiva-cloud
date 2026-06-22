import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/stores/useAuthStore";

/** Resolve a URL base do WebSocket do terminal (porta dedicada do backend). */
function terminalWsBase(): string {
  const explicit = import.meta.env.VITE_TERMINAL_WS_URL as string | undefined;
  if (explicit) return explicit.replace(/\/$/, "");
  const api = (import.meta.env.VITE_API_URL as string) || window.location.origin;
  try {
    const u = new URL(api);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    u.port = String(Number(u.port || (u.protocol === "wss:" ? 443 : 80)) + 1);
    return u.origin;
  } catch {
    return "ws://localhost:3001";
  }
}

/**
 * Terminal interativo (xterm.js) ligado por WebSocket nativo a um caminho do
 * gateway (`/terminal/applications/:id` ou `/terminal/nodes/:nodeId`). stdin como
 * texto; resize como frame binário JSON. Reutilizado por pod e nó.
 */
export function WebTerminal({ wsPath, className }: { wsPath: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const token = useAuthStore((s) => s.accessToken);
  const org = useAuthStore((s) => s.organizationId);
  const [status, setStatus] = useState<"connecting" | "open" | "closed">("connecting");

  useEffect(() => {
    if (!containerRef.current || !token) return;

    const term = new Terminal({
      fontSize: 13,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      cursorBlink: true,
      theme: { background: "#0a0a0a" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    const url = `${terminalWsBase()}${wsPath}?access_token=${encodeURIComponent(token)}${org ? `&org=${encodeURIComponent(org)}` : ""}`;
    const ws = new WebSocket(url);

    const sendResize = () => {
      if (ws.readyState === WebSocket.OPEN) ws.send(new TextEncoder().encode(JSON.stringify({ cols: term.cols, rows: term.rows })));
    };

    ws.onopen = () => { setStatus("open"); sendResize(); };
    ws.onmessage = (e) => term.write(typeof e.data === "string" ? e.data : "");
    ws.onclose = () => setStatus("closed");
    ws.onerror = () => setStatus("closed");

    const inputSub = term.onData((data) => ws.readyState === WebSocket.OPEN && ws.send(data));
    const resizeSub = term.onResize(() => sendResize());
    const observer = new ResizeObserver(() => { try { fit.fit(); } catch { /* sem layout ainda */ } });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      inputSub.dispose();
      resizeSub.dispose();
      ws.close();
      term.dispose();
    };
  }, [wsPath, token, org]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className={`inline-flex items-center gap-1 ${status === "open" ? "text-success" : status === "closed" ? "text-destructive" : ""}`}>
          <span className="size-1.5 animate-pulse rounded-full bg-current" />
          {status === "open" ? "Conectado" : status === "closed" ? "Desconectado" : "Conectando…"}
        </span>
      </div>
      <div ref={containerRef} className={className ?? "h-96 overflow-hidden rounded-lg bg-[#0a0a0a] p-2"} />
    </div>
  );
}
