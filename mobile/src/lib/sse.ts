/**
 * Cliente SSE minimalista sobre XMLHttpRequest. React Native não possui
 * EventSource nativo; o XHR do RN entrega `responseText` incremental, o que
 * basta para consumir os streams `/api/streams/*` do backend.
 */
export interface SseHandle {
  close: () => void;
}

interface SseCallbacks {
  onEvent: (event: string, data: string) => void;
  onError?: () => void;
}

const RETRY_DELAY_MS = 3000;

function parseChunk(chunk: string, onEvent: SseCallbacks["onEvent"]): void {
  for (const block of chunk.split("\n\n")) {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) data.push(line.slice(5).trim());
    }
    if (data.length) onEvent(event, data.join("\n"));
  }
}

export function connectSse(url: string, callbacks: SseCallbacks): SseHandle {
  let xhr: XMLHttpRequest | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let cursor = 0;

  const open = () => {
    if (closed) return;
    cursor = 0;
    xhr = new XMLHttpRequest();
    xhr.open("GET", url);
    xhr.setRequestHeader("Accept", "text/event-stream");
    xhr.setRequestHeader("Cache-Control", "no-cache");

    xhr.onreadystatechange = () => {
      if (!xhr || closed) return;
      // readyState 3 = LOADING: responseText cresce a cada chunk recebido.
      if (xhr.readyState !== 3 && xhr.readyState !== 4) return;
      const text = xhr.responseText ?? "";
      const boundary = text.lastIndexOf("\n\n");
      if (boundary > cursor) {
        parseChunk(text.slice(cursor, boundary), callbacks.onEvent);
        cursor = boundary + 2;
      }
      if (xhr.readyState === 4) scheduleRetry();
    };
    xhr.onerror = () => scheduleRetry();
    xhr.send();
  };

  const scheduleRetry = () => {
    if (closed || retryTimer) return;
    callbacks.onError?.();
    retryTimer = setTimeout(() => {
      retryTimer = null;
      open();
    }, RETRY_DELAY_MS);
  };

  open();

  return {
    close: () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      xhr?.abort();
      xhr = null;
    },
  };
}
