import { Stack, useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/screen";
import { TerminalView } from "@/components/terminal-view";

/** Shell SSH no nó do cluster (via gateway WebSocket). */
export default function NodeTerminalScreen() {
  const { id, label } = useLocalSearchParams<{ id: string; label?: string }>();

  return (
    <Screen scroll={false}>
      <Stack.Screen options={{ title: label ? `SSH · ${label}` : "SSH" }} />
      <TerminalView wsPath={`/terminal/nodes/${id}`} />
    </Screen>
  );
}
