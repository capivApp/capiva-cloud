import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Building2, Globe, LogOut, UserRound } from "lucide-react-native";
import { View } from "react-native";
import { ChipSelector } from "@/components/chip-selector";
import { IconBadge } from "@/components/icon-badge";
import { Screen } from "@/components/screen";
import { ScreenHeader } from "@/components/screen-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { useOrganizations } from "@/hooks/useOrganizations";
import { api } from "@/lib/api";
import { nativeTheme } from "@/lib/theme";
import { useAuthStore } from "@/stores/useAuthStore";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

/** Ajustes: usuário, servidor, organização ativa e logout. */
export default function SettingsScreen() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const serverUrl = useAuthStore((s) => s.serverUrl);
  const organizationId = useAuthStore((s) => s.organizationId);
  const { organizations } = useOrganizations();

  const switchOrganization = (id: string) => {
    useAuthStore.getState().setOrganization(id);
    useWorkspaceStore.getState().setProject(null);
    useWorkspaceStore.getState().setCluster(null);
    queryClient.clear();
  };

  const logout = async () => {
    await api.post("/auth/logout").catch(() => undefined);
    useAuthStore.getState().clear();
    queryClient.clear();
    router.replace("/login");
  };

  return (
    <Screen topInset>
      <ScreenHeader title="Ajustes" subtitle="Conta e preferências" />

      <Card className="rounded-2xl border-border/60 py-5">
        <CardHeader className="flex-row items-center gap-3">
          <IconBadge icon={UserRound} tint="primary" />
          <View className="flex-1">
            <CardTitle className="text-base">{user?.name ?? "—"}</CardTitle>
            <Text className="text-xs text-muted-foreground">{user?.email ?? ""}</Text>
          </View>
        </CardHeader>
      </Card>

      <Card className="rounded-2xl border-border/60 py-5">
        <CardHeader className="flex-row items-center gap-3">
          <IconBadge icon={Globe} tint="secondary" />
          <View className="flex-1">
            <CardTitle className="text-base">Servidor</CardTitle>
            <Text className="font-mono text-xs text-muted-foreground">{serverUrl}</Text>
          </View>
        </CardHeader>
        <CardContent>
          <Text className="text-xs text-muted-foreground">
            Para trocar de servidor, saia e informe outra URL no login.
          </Text>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/60 py-5">
        <CardHeader className="flex-row items-center gap-3">
          <IconBadge icon={Building2} tint="success" />
          <CardTitle className="text-base">Organização ativa</CardTitle>
        </CardHeader>
        <CardContent>
          <ChipSelector
            options={organizations.map((org) => ({ id: org.id, label: org.name }))}
            selectedId={organizationId}
            onSelect={switchOrganization}
          />
        </CardContent>
      </Card>

      <View className="mt-2">
        <Button variant="destructive" onPress={logout} className="rounded-xl">
          <LogOut color={nativeTheme.foreground} size={16} />
          <Text>Sair</Text>
        </Button>
      </View>
    </Screen>
  );
}
