export type TerminalStatus = "connecting" | "open" | "closed";

/** Status registrado pelos eventos do socket, marcado com a conexão que o produziu. */
export type TerminalConnection = { key: string; status: TerminalStatus };

/** Identifica a conexão: qualquer mudança de alvo, sessão ou largura abre um socket novo. */
export function buildConnectionKey(wsPath: string, session: number, width: number): string {
  return `${wsPath}#${session}#${width}`;
}

/** Enquanto o socket novo não emite evento, o status registrado é da conexão anterior. */
export function resolveTerminalStatus(connection: TerminalConnection, currentKey: string): TerminalStatus {
  return connection.key === currentKey ? connection.status : "connecting";
}
