import { router } from "expo-router";
import { Cpu, Gauge, HardDrive, MemoryStick, Server, TerminalSquare } from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, RefreshControl, View } from "react-native";
import { ChipSelector } from "@/components/chip-selector";
import { IconBadge } from "@/components/icon-badge";
import { MetricBar } from "@/components/metric-bar";
import { Screen } from "@/components/screen";
import { ScreenHeader } from "@/components/screen-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useClusterNodes, useClusters } from "@/hooks/useClusters";
import { useMonitoring, type NodeMetric } from "@/hooks/useMonitoring";
import { nativeTheme } from "@/lib/theme";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

function NodeCard({ node }: { node: NodeMetric }) {
  return (
    <Card className="rounded-2xl border-border/60 py-5">
      <CardHeader className="flex-row items-center gap-3">
        <IconBadge icon={Server} tint={node.ready ? "success" : "destructive"} />
        <View className="flex-1">
          <CardTitle className="text-base" numberOfLines={1}>
            {node.name}
          </CardTitle>
          <Text className="text-xs text-muted-foreground">
            {node.role} · {node.internalIP ?? "sem IP"}
            {node.kubeletVersion ? ` · ${node.kubeletVersion}` : ""}
          </Text>
        </View>
        <StatusBadge status={node.ready ? "READY" : "DEGRADED"} />
      </CardHeader>
      <CardContent className="gap-3">
        <MetricBar icon={Cpu} label="CPU" used={node.cpuUsedM} capacity={node.cpuCapacityM} unit="m" />
        <MetricBar icon={MemoryStick} label="Memória" used={node.memUsedMib} capacity={node.memCapacityMib} unit="MiB" />
        <Text className="text-xs text-muted-foreground">{node.pods.length} pods neste nó</Text>
        {node.warnings.map((warning) => (
          <Text key={warning} className="text-xs text-destructive">
            ⚠ {warning}
          </Text>
        ))}
      </CardContent>
    </Card>
  );
}

/** Monitor do cluster: totais, nós (metrics-server) e acesso SSH aos nós. */
export default function MonitorScreen() {
  const { clusters } = useClusters();
  const clusterId = useWorkspaceStore((s) => s.clusterId);
  const setCluster = useWorkspaceStore((s) => s.setCluster);
  const { data, isLoading, refetch } = useMonitoring(clusterId);
  const { nodes: sshNodes } = useClusterNodes(clusterId);

  useEffect(() => {
    const stillValid = clusters.some((c) => c.id === clusterId);
    if (!stillValid) setCluster(clusters[0]?.id ?? null);
  }, [clusters, clusterId, setCluster]);

  return (
    <Screen
      topInset
      refreshControl={
        <RefreshControl refreshing={false} onRefresh={refetch} tintColor={nativeTheme.primary} />
      }
    >
      <ScreenHeader title="Monitor" subtitle={data ? data.clusterName : "Métricas do cluster"} />

      <ChipSelector
        options={clusters.map((c) => ({ id: c.id, label: c.name }))}
        selectedId={clusterId}
        onSelect={setCluster}
      />

      {isLoading && (
        <View className="gap-3">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </View>
      )}

      {data && (
        <Card className="rounded-2xl border-border/60 py-5">
          <CardHeader className="flex-row items-center gap-3">
            <IconBadge icon={Gauge} tint="primary" />
            <CardTitle className="text-base">Capacidade total</CardTitle>
          </CardHeader>
          <CardContent className="gap-3">
            <MetricBar icon={Cpu} label="CPU" used={data.totals.cpuUsedM} capacity={data.totals.cpuCapacityM} unit="m" />
            <MetricBar
              icon={MemoryStick}
              label="Memória"
              used={data.totals.memUsedMib}
              capacity={data.totals.memCapacityMib}
              unit="MiB"
            />
            <View className="flex-row flex-wrap gap-x-6 gap-y-1">
              <Text variant="muted">
                Pods: <Text className="font-semibold">{data.totals.pods}</Text>
              </Text>
              {data.totals.diskUsedPct !== null && (
                <View className="flex-row items-center gap-1.5">
                  <HardDrive color={nativeTheme.mutedForeground} size={14} />
                  <Text variant="muted">
                    Disco: <Text className="font-semibold">{data.totals.diskUsedPct}%</Text>
                  </Text>
                </View>
              )}
            </View>
          </CardContent>
        </Card>
      )}

      {data?.nodes.map((node) => <NodeCard key={node.name} node={node} />)}

      {Boolean(sshNodes.length) && (
        <Card className="rounded-2xl border-border/60 py-5">
          <CardHeader className="flex-row items-center gap-3">
            <IconBadge icon={TerminalSquare} tint="secondary" />
            <CardTitle className="text-base">Acesso SSH</CardTitle>
          </CardHeader>
          <CardContent className="gap-2">
            {sshNodes.map((node) => (
              <Pressable
                key={node.id}
                onPress={() =>
                  router.push({ pathname: "/nodes/[id]/terminal", params: { id: node.id, label: node.host } })
                }
                className="flex-row items-center gap-3 rounded-xl border border-border/60 bg-background p-3 active:bg-accent"
              >
                <TerminalSquare color={nativeTheme.secondary} size={18} />
                <View className="flex-1">
                  <Text className="font-medium">{node.host}</Text>
                  <Text className="text-xs text-muted-foreground">
                    {node.role} · {node.internalIp ?? "sem IP interno"}
                  </Text>
                </View>
                <StatusBadge status={node.status} />
              </Pressable>
            ))}
          </CardContent>
        </Card>
      )}

      {!clusters.length && <Text variant="muted">Nenhum cluster cadastrado nesta organização.</Text>}
    </Screen>
  );
}
