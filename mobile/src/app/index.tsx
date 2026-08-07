import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { tryRefresh } from "@/lib/api";
import { nativeTheme } from "@/lib/theme";
import { useAuthStore } from "@/stores/useAuthStore";

type GateState = "checking" | "authed" | "anon";

/** Gate de sessão: espera a hidratação do store e tenta renovar o token. */
export default function Index() {
  const [state, setState] = useState<GateState>("checking");

  useEffect(() => {
    const check = async () => {
      if (!useAuthStore.persist.hasHydrated()) {
        await new Promise<void>((resolve) => {
          const unsub = useAuthStore.persist.onFinishHydration(() => {
            unsub();
            resolve();
          });
        });
      }
      const { serverUrl } = useAuthStore.getState();
      const ok = serverUrl ? await tryRefresh() : false;
      setState(ok ? "authed" : "anon");
    };
    check();
  }, []);

  if (state === "checking") {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color={nativeTheme.primary} />
      </View>
    );
  }

  return <Redirect href={state === "authed" ? "/(tabs)" : "/login"} />;
}
