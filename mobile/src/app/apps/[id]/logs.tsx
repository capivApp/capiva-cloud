import { Stack, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { LogViewer } from "@/components/log-viewer";
import { Screen } from "@/components/screen";
import { useLogsStream } from "@/hooks/useLogsStream";

/** Logs ao vivo (SSE) da aplicação. */
export default function ApplicationLogsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const logs = useLogsStream(id ?? null);

  return (
    <Screen scroll={false}>
      <Stack.Screen options={{ title: "Logs" }} />
      <View className="flex-1 p-3">
        <LogViewer logs={logs} />
      </View>
    </Screen>
  );
}
