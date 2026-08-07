import { Stack, useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/screen";
import { TerminalView } from "@/components/terminal-view";

/** Terminal anexado ao pod da aplicação (exec via gateway WebSocket). */
export default function ApplicationTerminalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <Screen scroll={false}>
      <Stack.Screen options={{ title: "Terminal" }} />
      <TerminalView wsPath={`/terminal/applications/${id}`} />
    </Screen>
  );
}
