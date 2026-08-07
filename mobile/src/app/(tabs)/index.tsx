import {
  Boxes,
  Database,
  FolderKanban,
  HeartPulse,
  History,
  Rocket,
  Server,
  Workflow,
  type LucideIcon,
} from "lucide-react-native";
import { RefreshControl, View } from "react-native";
import { IconBadge, type IconTint } from "@/components/icon-badge";
import { Screen } from "@/components/screen";
import { ScreenHeader } from "@/components/screen-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { usePlatformOverview } from "@/hooks/usePlatformOverview";
import { formatShortDateTime } from "@/lib/format";
import { nativeTheme } from "@/lib/theme";
import { useAuthStore } from "@/stores/useAuthStore";

function StatTile({ label, value, icon, tint }: { label: string; value: number; icon: LucideIcon; tint: IconTint }) {
  return (
    <View className="min-w-[45%] flex-1 flex-row items-center gap-3 rounded-2xl border border-border/60 bg-card p-4">
      <IconBadge icon={icon} tint={tint} />
      <View>
        <Text className="text-2xl font-extrabold">{value}</Text>
        <Text className="text-xs text-muted-foreground">{label}</Text>
      </View>
    </View>
  );
}

function SectionCard({
  icon,
  tint,
  title,
  children,
}: {
  icon: LucideIcon;
  tint: IconTint;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="rounded-2xl border-border/60 py-5">
      <CardHeader className="flex-row items-center gap-3">
        <IconBadge icon={icon} tint={tint} />
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="gap-3">{children}</CardContent>
    </Card>
  );
}

/** Dashboard: contadores, saúde da frota, clusters e atividade recente. */
export default function DashboardScreen() {
  const { overview, isLoading, refetch, isFetching } = usePlatformOverview();
  const user = useAuthStore((s) => s.user);

  if (isLoading || !overview) {
    return (
      <Screen topInset>
        <ScreenHeader title="Visão Geral" subtitle="Carregando…" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </Screen>
    );
  }

  return (
    <Screen
      topInset
      refreshControl={
        <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={nativeTheme.primary} />
      }
    >
      <ScreenHeader title="Visão Geral" subtitle={`Olá, ${user?.name?.split(" ")[0] ?? "dev"} 👋`} />

      <View className="flex-row flex-wrap gap-3">
        <StatTile label="Projetos" value={overview.counts.projects} icon={FolderKanban} tint="primary" />
        <StatTile label="Aplicações" value={overview.counts.applications} icon={Boxes} tint="secondary" />
        <StatTile label="Bancos" value={overview.counts.databases} icon={Database} tint="success" />
        <StatTile label="Workers" value={overview.counts.workers} icon={Workflow} tint="muted" />
      </View>

      <SectionCard icon={Server} tint="primary" title="Clusters">
        <View className="flex-row flex-wrap gap-x-6 gap-y-2">
          <Text variant="muted">
            Conectados:{" "}
            <Text className="font-semibold text-success">
              {overview.cluster.connected}/{overview.cluster.totalClusters}
            </Text>
          </Text>
          <Text variant="muted">
            Nós: <Text className="font-semibold">{overview.cluster.totalNodes}</Text>
          </Text>
          <Text variant="muted">
            Ambientes: <Text className="font-semibold">{overview.cluster.totalEnvironments}</Text>
          </Text>
        </View>
      </SectionCard>

      <SectionCard icon={HeartPulse} tint="success" title="Saúde das aplicações">
        <View className="flex-row flex-wrap gap-2">
          {Object.entries(overview.health).map(([status, count]) => (
            <View key={status} className="flex-row items-center gap-1.5">
              <StatusBadge status={status} />
              <Text className="text-sm font-semibold">{count}</Text>
            </View>
          ))}
          {!Object.keys(overview.health).length && <Text variant="muted">Sem aplicações ainda.</Text>}
        </View>
      </SectionCard>

      <SectionCard icon={Rocket} tint="secondary" title="Deploys recentes">
        {overview.recentDeploys.map((deploy, index) => (
          <View key={deploy.id} className="gap-3">
            {index > 0 && <Separator className="bg-border/60" />}
            <View className="flex-row items-center justify-between gap-2">
              <View className="flex-1">
                <Text className="font-medium" numberOfLines={1}>
                  {deploy.application}
                </Text>
                <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                  {deploy.version} · {formatShortDateTime(deploy.startedAt)}
                </Text>
              </View>
              <StatusBadge status={deploy.status} />
            </View>
          </View>
        ))}
        {!overview.recentDeploys.length && <Text variant="muted">Nenhum deploy recente.</Text>}
      </SectionCard>

      <SectionCard icon={History} tint="muted" title="Atividade">
        {overview.recentAudits.map((audit) => (
          <View key={audit.id} className="flex-row items-start gap-2.5">
            <View className="mt-1.5 h-2 w-2 rounded-full bg-primary/60" />
            <View className="flex-1">
              <Text className="text-sm font-medium">{audit.event}</Text>
              <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                {audit.detail ?? "—"} · {formatShortDateTime(audit.at)}
              </Text>
            </View>
          </View>
        ))}
        {!overview.recentAudits.length && <Text variant="muted">Sem atividade recente.</Text>}
      </SectionCard>
    </Screen>
  );
}
