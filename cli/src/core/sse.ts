export interface SseEvent<T = unknown> {
  event: string;
  data: T;
}

const parseData = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

/** Um bloco `event:/data:` separado por linha em branco. Sem `data` = keep-alive. */
const parseBlock = (block: string): SseEvent | null => {
  const lines = block.split("\n");
  const event =
    lines
      .find((l) => l.startsWith("event:"))
      ?.slice(6)
      .trim() ?? "message";
  const data = lines.filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart());
  if (!data.length) return null;
  return { event, data: parseData(data.join("\n")) };
};

/** Lê `text/event-stream` de um fetch, tolerando eventos quebrados entre pedaços. */
export async function* readSse(res: Response): AsyncGenerator<SseEvent> {
  if (!res.body) return;
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, "\n");
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const parsed = parseBlock(block);
      if (parsed) yield parsed;
    }
  }
  const last = parseBlock(buffer);
  if (last) yield last;
}
