import { Stack, router, useLocalSearchParams } from "expo-router";
import {
  Activity,
  Cpu,
  FileText,
  Gauge,
  Info,
  MemoryStick,
  TerminalSquare,
  TriangleAlert,
  Zap,
  type LucideIcon,
} from "lucide-react-native";
import { View } from "react-native";
import { DeployHistoryCard } from "@/components/app-actions/deploy-history-card";
import { DeployProgressCard } from "@/components/app-actions/deploy-progress-card";
import { LifecycleActionsCard } from "@/components/app-actions/lifecycle-actions-card";
import { ScalingCard } from "@/components/app-actions/scaling-card";
import { Screen } from "@/components/screen";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useApplication } from "@/hooks/useApplication";
import { useMetricsStream } from "@/hooks/useMetricsStream";
import { useMyRole } from "@/hooks/useMyRole";
import { confirmAndRun } from "@/lib/alerts";
import { findDeploymentAtivo, type Deployment } from "@/lib/deployments";
import { nativeTheme } from "@/lib/theme";

function MetricTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
}) {
  return (
    <View className="min-w-[30%] flex-1 gap-1 rounded-xl border border-border/60 bg-background p-3">
      <View className="flex-row items-center gap-1.5">
        <Icon color={nativeTheme.mutedForeground} size={13} />
        <Text className="text-xs text-muted-foreground">{label}</Text>
      </View>
      <Text className="text-base font-bold">{value}</Text>
    </View>
  );
}

export default function ApplicationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ciclo = useApplication(id ?? null);
  const { app, isLoading, deployments } = ciclo;
  const { permissoes } = useMyRole();
  const metrics = useMetricsStream(id ?? null);
  const ativo = findDeploymentAtivo(deployments);

  const rollbackTo = (deployment: Deployment) =>
    confirmAndRun(
      "Rollback",
      `Voltar ${app?.name ?? "a aplicação"} para a versão ${deployment.version}?`,
      () => ciclo.rollback(deployment.id),
    );

  if (isLoading || !app) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Aplicação" }} />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: app.name }} />

      <SectionCard
        icon={Info}
        tint="primary"
        title="Status"
        right={<StatusBadge status={app.observedStatus} />}
      >
        <View className="gap-1">
          <Text variant="muted">
            Origem: <Text className="text-sm">{app.source}</Text>
          </Text>
          <Text variant="muted">
            Perfil: <Text className="text-sm">{app.profile}</Text> · Estratégia:{" "}
            <Text className="text-sm">{app.rolloutStrategy}</Text>
          </Text>
          {app.port !== null && (
            <Text variant="muted">
              Porta: <Text className="font-mono text-sm">{app.port}</Text>
            </Text>
          )}
        </View>
      </SectionCard>

      <SectionCard icon={Activity} tint="success" title="Métricas ao vivo">
        <View className="flex-row flex-wrap gap-2">
          <MetricTile icon={Cpu} label="CPU" value={metrics ? `${metrics.cpu}%` : "—"} />
          <MetricTile
            icon={MemoryStick}
            label="Memória"
            value={metrics ? `${metrics.memoryMb} MB` : "—"}
          />
          <MetricTile
            icon={Gauge}
            label="Req/s"
            value={metrics ? String(metrics.requestsPerSec) : "—"}
          />
          <MetricTile icon={Zap} label="p95" value={metrics ? `${metrics.latencyP95Ms} ms` : "—"} />
          <MetricTile
            icon={TriangleAlert}
            label="Erros"
            value={metrics ? `${metrics.errorRate}%` : "—"}
          />
        </View>
      </SectionCard>

      {ativo && <DeployProgressCard key={ativo.id} applicationId={app.id} deployment={ativo} />}

      <LifecycleActionsCard app={app} ciclo={ciclo} permissoes={permissoes} />

      <ScalingCard applicationId={app.id} canScale={permissoes.scale} />

      <View className="flex-row gap-3">
        <Button
          className="flex-1 rounded-xl"
          variant="outline"
          onPress={() => router.push({ pathname: "/apps/[id]/logs", params: { id: String(id) } })}
        >
          <FileText color={nativeTheme.foreground} size={16} />
          <Text>Logs</Text>
        </Button>
        <Button
          className="flex-1 rounded-xl"
          variant="outline"
          onPress={() =>
            router.push({ pathname: "/apps/[id]/terminal", params: { id: String(id) } })
          }
        >
          <TerminalSquare color={nativeTheme.foreground} size={16} />
          <Text>Terminal</Text>
        </Button>
      </View>

      <DeployHistoryCard
        deployments={deployments}
        canRollback={permissoes.rollback}
        rollbackTargetId={ciclo.rollbackTargetId}
        isRollingBack={ciclo.isRollingBack}
        onRollback={rollbackTo}
      />
    </Screen>
  );
}
