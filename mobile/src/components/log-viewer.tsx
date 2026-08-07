import { useEffect, useRef } from "react";
import { ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import type { LogLine } from "@/hooks/useLogsStream";
import { stripAnsi } from "@/lib/terminal";

/** Lista de logs com autoscroll, fundo estilo console. */
export function LogViewer({ logs }: { logs: LogLine[] | null }) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: false });
  }, [logs]);

  return (
    <ScrollView ref={scrollRef} className="flex-1 rounded-lg bg-[#0a0a0a] p-3">
      <View className="gap-0.5 pb-6">
        {(logs ?? []).map((log, index) => (
          <Text key={`${log.ts}-${index}`} className="font-mono text-[11px] leading-4 text-neutral-200">
            <Text className="font-mono text-[11px] text-neutral-500">
              {new Date(log.ts).toLocaleTimeString()}{" "}
            </Text>
            {stripAnsi(log.line)}
          </Text>
        ))}
        {!logs?.length && <Text variant="muted">Aguardando logs…</Text>}
      </View>
    </ScrollView>
  );
}
