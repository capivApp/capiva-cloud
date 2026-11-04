import { useCallback, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { resizeFrame, stripAnsi, terminalWsUrl } from "@/lib/terminal";
import { type TerminalConnection, type TerminalStatus, buildConnectionKey, resolveTerminalStatus } from "@/lib/terminalStatus";
import { cn } from "@/lib/utils";

const MAX_BUFFER = 100_000;
const FONT_SIZE = 11;
const CHAR_WIDTH = FONT_SIZE * 0.602;

const STATUS_LABEL: Record<TerminalStatus, string> = {
  connecting: "Conectando…",
  open: "Conectado",
  closed: "Desconectado",
};

const STATUS_CLASS: Record<TerminalStatus, string> = {
  connecting: "text-muted-foreground",
  open: "text-success",
  closed: "text-destructive",
};

/** Teclas de controle enviadas como stdin (mesmos bytes que o xterm emite). */
const QUICK_KEYS: { label: string; data: string }[] = [
  { label: "Tab", data: "\t" },
  { label: "Ctrl+C", data: "\x03" },
  { label: "Ctrl+D", data: "\x04" },
  { label: "↑", data: "\x1b[A" },
  { label: "↓", data: "\x1b[B" },
];

/** Aplica um chunk ao buffer emulando \r (overwrite da linha atual). */
function appendChunk(buffer: string, chunk: string): string {
  const text = stripAnsi(chunk).replace(/\r\n/g, "\n");
  let result = buffer;
  for (const part of text.split(/(\r|\n)/)) {
    if (part === "\n") {
      result += "\n";
      continue;
    }
    if (part === "\r") {
      result = result.slice(0, result.lastIndexOf("\n") + 1);
      continue;
    }
    result += part;
  }
  return result.slice(-MAX_BUFFER);
}

/**
 * Terminal interativo por WebSocket ligado ao gateway do backend
 * (`/terminal/applications/:id` ou `/terminal/nodes/:nodeId`) — mesmo
 * protocolo do painel web: stdin como texto, resize como frame binário.
 */
export function TerminalView({ wsPath }: { wsPath: string }) {
  const { width } = useWindowDimensions();
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [output, setOutput] = useState("");
  const [input, setInput] = useState("");
  const [session, setSession] = useState(0);
  const connectionKey = buildConnectionKey(wsPath, session, width);
  const [connection, setConnection] = useState<TerminalConnection>({ key: connectionKey, status: "connecting" });
  const status = resolveTerminalStatus(connection, connectionKey);

  useEffect(() => {
    const ws = new WebSocket(terminalWsUrl(wsPath));
    wsRef.current = ws;

    const cols = Math.max(40, Math.floor((width - 40) / CHAR_WIDTH));
    // Socket já descartado (reconexão, rotação) não pode sobrescrever o status do novo.
    const markStatus = (next: TerminalStatus) => {
      if (wsRef.current !== ws) return;
      setConnection({ key: connectionKey, status: next });
    };
    ws.onopen = () => {
      markStatus("open");
      ws.send(resizeFrame(cols, 30));
    };
    ws.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      setOutput((prev) => appendChunk(prev, event.data));
    };
    ws.onclose = () => markStatus("closed");
    ws.onerror = () => markStatus("closed");

    return () => {
      wsRef.current = null;
      ws.close();
    };
  }, [wsPath, session, width, connectionKey]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: false });
  }, [output]);

  const send = useCallback((data: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(data);
  }, []);

  const submit = () => {
    send(`${input}\r`);
    setInput("");
  };

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <View className="flex-1 gap-2 p-3">
        <View className="flex-row items-center justify-between">
          <Text className={cn("text-xs font-medium", STATUS_CLASS[status])}>● {STATUS_LABEL[status]}</Text>
          <View className="flex-row gap-3">
            <Pressable onPress={() => setOutput("")}>
              <Text className="text-xs text-muted-foreground">Limpar</Text>
            </Pressable>
            {status === "closed" && (
              <Pressable onPress={() => setSession((s) => s + 1)}>
                <Text className="text-xs font-semibold text-primary">Reconectar</Text>
              </Pressable>
            )}
          </View>
        </View>

        <ScrollView ref={scrollRef} className="flex-1 rounded-lg bg-[#0a0a0a] p-3">
          <Text selectable className="pb-6 font-mono leading-4 text-neutral-200" style={{ fontSize: FONT_SIZE }}>
            {output || " "}
          </Text>
        </ScrollView>

        <View className="flex-row gap-2">
          {QUICK_KEYS.map((key) => (
            <Pressable
              key={key.label}
              onPress={() => send(key.data)}
              className="h-8 flex-1 items-center justify-center rounded-md border border-border bg-card"
            >
              <Text className="text-xs font-medium text-muted-foreground">{key.label}</Text>
            </Pressable>
          ))}
        </View>

        <View className="flex-row items-center gap-2">
          <Input
            value={input}
            onChangeText={setInput}
            onSubmitEditing={submit}
            placeholder="Comando…"
            autoCapitalize="none"
            autoCorrect={false}
            blurOnSubmit={false}
            returnKeyType="send"
            className="flex-1 font-mono"
          />
          <Button size="sm" onPress={submit} disabled={status !== "open"}>
            <Text>Enviar</Text>
          </Button>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
