import { Stack, router, useLocalSearchParams } from "expo-router";
import {
  Activity,
  Cpu,
  FileText,
  Gauge,
  Info,
  MemoryStick,
  Rocket,
  TerminalSquare,
  TriangleAlert,
  Zap,
  type LucideIcon,
} from "lucide-react-native";
import { Alert, View } from "react-native";
import { IconBadge, type IconTint } from "@/components/icon-badge";
import { Screen } from "@/components/screen";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useApplication } from "@/hooks/useApplication";
import { useMetricsStream } from "@/hooks/useMetricsStream";
import { formatShortDateTime } from "@/lib/format";
import { nativeTheme } from "@/lib/theme";

function MetricTile({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
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

function SectionCard({
  icon,
  tint,
  title,
  right,
  children,
}: {
  icon: LucideIcon;
  tint: IconTint;
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="rounded-2xl border-border/60 py-5">
      <CardHeader className="flex-row items-center gap-3">
        <IconBadge icon={icon} tint={tint} />
        <CardTitle className="flex-1 text-base">{title}</CardTitle>
        {right}
      </CardHeader>
      <CardContent className="gap-3">{children}</CardContent>
    </Card>
  );
}

/** Confirmação nativa antes de ações com impacto. */
function confirmThen(title: string, message: string, action: () => void): void {
  Alert.alert(title, message, [
    { text: "Cancelar", style: "cancel" },
    { text: "Confirmar", style: "destructive", onPress: action },
  ]);
}

export default function ApplicationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    app,
    isLoading,
    deployments,
    deploy,
    isDeploying,
    stop,
    isStopping,
    start,
    isStarting,
    restart,
    isRestarting,
    rollback,
    isRollingBack,
  } = useApplication(id ?? null);
  const metrics = useMetricsStream(id ?? null);

  if (isLoading || !app) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Aplicação" }} />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </Screen>
    );
  }

  const stopped = app.desiredStatus === "STOPPED";

  return (
    <Screen>
      <Stack.Screen options={{ title: app.name }} />

      <SectionCard icon={Info} tint="primary" title="Status" right={<StatusBadge status={app.observedStatus} />}>
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
          <MetricTile icon={MemoryStick} label="Memória" value={metrics ? `${metrics.memoryMb} MB` : "—"} />
          <MetricTile icon={Gauge} label="Req/s" value={metrics ? String(metrics.requestsPerSec) : "—"} />
          <MetricTile icon={Zap} label="p95" value={metrics ? `${metrics.latencyP95Ms} ms` : "—"} />
          <MetricTile icon={TriangleAlert} label="Erros" value={metrics ? `${metrics.errorRate}%` : "—"} />
        </View>
      </SectionCard>

      <SectionCard icon={Zap} tint="secondary" title="Ações">
        <View className="flex-row gap-2">
          <Button className="flex-1 rounded-xl" onPress={() => deploy()} disabled={isDeploying}>
            <Rocket color="#fff" size={16} />
            <Text>{isDeploying ? "Enviando…" : "Deploy"}</Text>
          </Button>
          <Button
            className="flex-1 rounded-xl"
            variant="secondary"
            disabled={isRestarting}
            onPress={() => confirmThen("Reiniciar", `Reiniciar ${app.name}?`, () => restart())}
          >
            <Text>{isRestarting ? "Reiniciando…" : "Restart"}</Text>
          </Button>
        </View>
        <View className="flex-row gap-2">
          {stopped ? (
            <Button className="flex-1 rounded-xl" variant="outline" onPress={() => start()} disabled={isStarting}>
              <Text>{isStarting ? "Iniciando…" : "Start"}</Text>
            </Button>
          ) : (
            <Button
              className="flex-1 rounded-xl"
              variant="outline"
              disabled={isStopping}
              onPress={() => confirmThen("Parar", `Parar ${app.name}?`, () => stop())}
            >
              <Text>{isStopping ? "Parando…" : "Stop"}</Text>
            </Button>
          )}
          <Button
            className="flex-1 rounded-xl"
            variant="destructive"
            disabled={isRollingBack}
            onPress={() => confirmThen("Rollback", "Voltar para a versão anterior?", () => rollback())}
          >
            <Text>{isRollingBack ? "Voltando…" : "Rollback"}</Text>
          </Button>
        </View>
      </SectionCard>

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
          onPress={() => router.push({ pathname: "/apps/[id]/terminal", params: { id: String(id) } })}
        >
          <TerminalSquare color={nativeTheme.foreground} size={16} />
          <Text>Terminal</Text>
        </Button>
      </View>

      <SectionCard icon={Rocket} tint="muted" title="Deploys">
        {deployments.slice(0, 8).map((deployment, index) => (
          <View key={deployment.id} className="gap-3">
            {index > 0 && <Separator className="bg-border/60" />}
            <View className="flex-row items-center justify-between gap-2">
              <View className="flex-1">
                <Text className="font-medium" numberOfLines={1}>
                  {deployment.version}
                </Text>
                <Text className="text-xs text-muted-foreground">{formatShortDateTime(deployment.startedAt)}</Text>
              </View>
              <StatusBadge status={deployment.status} />
            </View>
          </View>
        ))}
        {!deployments.length && <Text variant="muted">Nenhum deploy ainda.</Text>}
      </SectionCard>
    </Screen>
  );
}
