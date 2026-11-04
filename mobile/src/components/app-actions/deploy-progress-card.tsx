import { Rocket } from "lucide-react-native";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { Progress } from "@/components/ui/progress";
import { Text } from "@/components/ui/text";
import { useDeploymentProgress } from "@/hooks/useDeploymentProgress";
import type { Deployment } from "@/lib/deployments";

/**
 * Andamento do deploy em curso, ao vivo pelo SSE. Antes do primeiro evento usa
 * o que veio na lista. Monte com `key={deployment.id}`.
 */
export function DeployProgressCard({ applicationId, deployment }: { applicationId: string; deployment: Deployment }) {
  const { progress } = useDeploymentProgress(applicationId, deployment.id);
  const status = progress?.status ?? deployment.status;
  const percent = progress?.progress ?? deployment.progress;

  return (
    <SectionCard icon={Rocket} tint="secondary" title="Deploy em andamento" right={<StatusBadge status={status} />}>
      <Text className="font-medium" numberOfLines={1}>
        {deployment.version}
      </Text>
      <Progress value={percent} />
      <Text variant="muted" numberOfLines={2}>
        {progress?.label ?? "Aguardando o início."}
      </Text>
    </SectionCard>
  );
}
