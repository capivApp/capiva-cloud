import { router } from "expo-router";
import { Box, ChevronRight, Plus } from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, RefreshControl, View } from "react-native";
import { ChipSelector } from "@/components/chip-selector";
import { IconBadge } from "@/components/icon-badge";
import { Screen } from "@/components/screen";
import { ScreenHeader } from "@/components/screen-header";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useApplications, type Application } from "@/hooks/useApplications";
import { useProjects } from "@/hooks/useProjects";
import { nativeTheme } from "@/lib/theme";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

function ApplicationRow({ app }: { app: Application }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/apps/[id]", params: { id: app.id } })}
      className="flex-row items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 active:bg-accent"
    >
      <IconBadge icon={Box} tint="primary" />
      <View className="flex-1 gap-0.5">
        <Text className="font-semibold" numberOfLines={1}>
          {app.name}
        </Text>
        <Text className="text-xs text-muted-foreground">
          {app.source} · {app.profile}
          {app.port ? ` · :${app.port}` : ""}
        </Text>
      </View>
      <StatusBadge status={app.observedStatus} />
      <ChevronRight color={nativeTheme.mutedForeground} size={18} />
    </Pressable>
  );
}

/** Aplicações do projeto ativo (seleção por chips). */
export default function AppsScreen() {
  const { projects, isLoading: loadingProjects } = useProjects();
  const projectId = useWorkspaceStore((s) => s.projectId);
  const setProject = useWorkspaceStore((s) => s.setProject);
  const { applications, isLoading, refetch, isFetching } = useApplications(projectId);
  const activeProject = projects.find((p) => p.id === projectId);

  useEffect(() => {
    const stillValid = projects.some((p) => p.id === projectId);
    if (!stillValid) setProject(projects[0]?.id ?? null);
  }, [projects, projectId, setProject]);

  return (
    <Screen
      topInset
      refreshControl={
        <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={nativeTheme.primary} />
      }
    >
      <ScreenHeader
        title="Aplicações"
        subtitle={activeProject ? `Projeto ${activeProject.name}` : "Selecione um projeto"}
        right={
          <Pressable
            onPress={() => router.push("/apps/new")}
            className="h-10 w-10 items-center justify-center rounded-xl bg-primary active:opacity-90"
            accessibilityLabel="Nova aplicação"
          >
            <Plus color="#fff" size={20} />
          </Pressable>
        }
      />

      <ChipSelector
        options={projects.map((p) => ({ id: p.id, label: p.name }))}
        selectedId={projectId}
        onSelect={setProject}
      />

      {(loadingProjects || isLoading) && (
        <View className="gap-3">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </View>
      )}

      <View className="gap-3">
        {applications.map((app) => (
          <ApplicationRow key={app.id} app={app} />
        ))}
      </View>

      {!loadingProjects && !projects.length && <Text variant="muted">Nenhum projeto nesta organização.</Text>}
      {projectId && !isLoading && !applications.length && (
        <Text variant="muted">Nenhuma aplicação neste projeto.</Text>
      )}
    </Screen>
  );
}
