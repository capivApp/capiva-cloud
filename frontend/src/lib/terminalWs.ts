interface TerminalWsInput {
  /** VITE_TERMINAL_WS_URL. */
  explicit: string | undefined;
  /** VITE_API_URL: vazio quando painel e API estão na mesma origem (deploy com nginx). */
  apiUrl: string | undefined;
  /** window.location.origin. */
  origin: string;
}

const LOCAL_FALLBACK = "ws://localhost:3001";

const toWs = (url: URL): URL => {
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url;
};

/** API em outra origem (dev): o terminal fica na porta dedicada, a da API mais um. */
const dedicatedPortOf = (apiUrl: string): string => {
  if (!URL.canParse(apiUrl)) return LOCAL_FALLBACK;
  const url = toWs(new URL(apiUrl));
  url.port = String(Number(url.port || (url.protocol === "wss:" ? 443 : 80)) + 1);
  return url.origin;
};

/**
 * URL base do WebSocket do terminal. Com a API na mesma origem, o nginx do deploy faz
 * proxy de /terminal/ ali mesmo: a imagem publicada não precisa do host no build.
 */
export function resolveTerminalWsBase({ explicit, apiUrl, origin }: TerminalWsInput): string {
  if (explicit) return explicit.replace(/\/$/, "");
  if (apiUrl) return dedicatedPortOf(apiUrl);
  return toWs(new URL(origin)).origin;
}
