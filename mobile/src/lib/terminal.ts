import { useAuthStore } from "@/stores/useAuthStore";

/**
 * Utilitários do terminal WebSocket (`/terminal/{applications|nodes}/:id`).
 * No deploy padrão o nginx do painel faz proxy de `/terminal` para o gateway,
 * então a base é a própria URL do servidor com esquema ws/wss.
 */
export function terminalWsUrl(wsPath: string): string {
  const { serverUrl, accessToken, organizationId } = useAuthStore.getState();
  const base = serverUrl.replace(/^http/i, "ws");
  const org = organizationId ? `&org=${encodeURIComponent(organizationId)}` : "";
  return `${base}${wsPath}?access_token=${encodeURIComponent(accessToken ?? "")}${org}`;
}

/** Frame binário de resize ({cols,rows}) — o gateway trata binário como controle. */
export function resizeFrame(cols: number, rows: number): ArrayBuffer {
  const json = JSON.stringify({ cols, rows });
  const bytes = new Uint8Array(json.length);
  for (let i = 0; i < json.length; i++) bytes[i] = json.charCodeAt(i);
  return bytes.buffer;
}

/** Remove sequências ANSI (cores/cursor) para exibição em <Text>. */
export function stripAnsi(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*(\x07|\x1b\\)|\x1b[()][0-9A-B]/g, "");
}
