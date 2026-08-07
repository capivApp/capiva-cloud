import "@/global.css";

import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colorScheme } from "nativewind";
import { queryClient } from "@/lib/query";
import { nativeTheme } from "@/lib/theme";

// Dark é o padrão do produto (mesma estética do painel web).
colorScheme.set("dark");

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: nativeTheme.card },
          headerTintColor: nativeTheme.foreground,
          headerTitleStyle: { color: nativeTheme.foreground },
          contentStyle: { backgroundColor: nativeTheme.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </QueryClientProvider>
  );
}
