import { History, RotateCcw } from "lucide-react-native";
import { View } from "react-native";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { findRollbackTargets, type Deployment } from "@/lib/deployments";
import { formatShortDateTime } from "@/lib/format";
import { nativeTheme } from "@/lib/theme";

const HISTORICO_LIMITE = 8;

interface DeployHistoryCardProps {
  deployments: Deployment[];
  canRollback: boolean;
  rollbackTargetId: string | null | undefined;
  isRollingBack: boolean;
  onRollback: (deployment: Deployment) => void;
}

/** Últimos deploys com status; os saudáveis anteriores podem ser restaurados (rollback). */
export function DeployHistoryCard({
  deployments,
  canRollback,
  rollbackTargetId,
  isRollingBack,
  onRollback,
}: DeployHistoryCardProps) {
  const restauraveis = new Set(findRollbackTargets(deployments).map((d) => d.id));

  return (
    <SectionCard icon={History} tint="muted" title="Deploys">
      {deployments.slice(0, HISTORICO_LIMITE).map((deployment, index) => (
        <View key={deployment.id} className="gap-3">
          {index > 0 && <Separator className="bg-border/60" />}
          <View className="flex-row items-center justify-between gap-2">
            <View className="flex-1">
              <Text className="font-medium" numberOfLines={1}>
                {deployment.version}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {formatShortDateTime(deployment.startedAt)}
              </Text>
            </View>
            <StatusBadge status={deployment.status} />
          </View>
          {canRollback && restauraveis.has(deployment.id) && (
            <Button
              size="sm"
              variant="outline"
              className="self-start rounded-xl"
              disabled={isRollingBack}
              onPress={() => onRollback(deployment)}
            >
              <RotateCcw color={nativeTheme.foreground} size={14} />
              <Text>
                {rollbackTargetId === deployment.id ? "Restaurando…" : "Voltar para esta versão"}
              </Text>
            </Button>
          )}
        </View>
      ))}
      {!deployments.length && <Text variant="muted">Nenhum deploy ainda.</Text>}
    </SectionCard>
  );
}
