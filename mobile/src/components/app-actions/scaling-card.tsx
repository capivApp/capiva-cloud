import { Layers } from "lucide-react-native";
import { useState } from "react";
import { ReplicaStepper } from "@/components/app-actions/replica-stepper";
import { SectionCard } from "@/components/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useScaling } from "@/hooks/useScaling";
import { confirmAndRun } from "@/lib/alerts";
import {
  buildLimitesHpa,
  buildLimitesManuais,
  buildScalingPayload,
  resolveModoEscala,
  type ModoEscala,
  type ScalingPolicy,
  type ScalingStatus,
} from "@/lib/scaling";

type Scaling = ReturnType<typeof useScaling>;

interface ModoProps {
  status: ScalingStatus;
  scaling: Scaling;
  canScale: boolean;
}

function ManualScaling({ status, scaling, canScale }: ModoProps) {
  const [draft, setDraft] = useState<number | null>(null);
  const replicas = draft ?? status.currentReplicas;
  const isChanged = draft !== null && draft !== status.currentReplicas;

  const apply = () =>
    confirmAndRun("Escalar réplicas", `Escalar para ${replicas} réplicas?`, async () => {
      await scaling.scale(replicas);
      setDraft(null);
    });

  return (
    <>
      <ReplicaStepper
        label="Réplicas"
        value={replicas}
        limites={buildLimitesManuais()}
        disabled={!canScale}
        onChange={setDraft}
      />
      {canScale && (
        <Button className="rounded-xl" disabled={!isChanged || scaling.isScaling} onPress={apply}>
          <Text>{scaling.isScaling ? "Aplicando…" : "Aplicar"}</Text>
        </Button>
      )}
    </>
  );
}

function HpaScaling({ status, scaling, canScale }: ModoProps) {
  const policy = status.policy as ScalingPolicy;
  const [draftMin, setDraftMin] = useState<number | null>(null);
  const [draftMax, setDraftMax] = useState<number | null>(null);
  const minimo = draftMin ?? policy.minReplicas;
  const maximo = draftMax ?? policy.maxReplicas;
  const limites = buildLimitesHpa(minimo, maximo);
  const isChanged = minimo !== policy.minReplicas || maximo !== policy.maxReplicas;

  const save = () =>
    confirmAndRun("Autoscaling", `Manter entre ${minimo} e ${maximo} réplicas?`, async () => {
      await scaling.setPolicy(buildScalingPayload(policy, minimo, maximo));
      setDraftMin(null);
      setDraftMax(null);
    });

  return (
    <>
      <Text variant="muted">Réplicas agora: {status.currentReplicas}</Text>
      <ReplicaStepper
        label="Mínimo"
        value={minimo}
        limites={limites.minimo}
        disabled={!canScale}
        onChange={setDraftMin}
      />
      <ReplicaStepper
        label="Máximo"
        value={maximo}
        limites={limites.maximo}
        disabled={!canScale}
        onChange={setDraftMax}
      />
      {canScale && (
        <Button
          className="rounded-xl"
          disabled={!isChanged || scaling.isSavingPolicy}
          onPress={save}
        >
          <Text>{scaling.isSavingPolicy ? "Salvando…" : "Salvar limites"}</Text>
        </Button>
      )}
    </>
  );
}

const MODOS: Record<ModoEscala, (props: ModoProps) => React.ReactElement> = {
  manual: ManualScaling,
  hpa: HpaScaling,
};

const ROTULO_MODO: Record<ModoEscala, string> = {
  manual: "Fixo",
  hpa: "Autoscaling",
};

/** Escala da aplicação: réplicas fixas ou mínimo e máximo do HPA. */
export function ScalingCard({
  applicationId,
  canScale,
}: {
  applicationId: string;
  canScale: boolean;
}) {
  const scaling = useScaling(applicationId);
  const modo = resolveModoEscala(scaling.status);
  const Modo = MODOS[modo];

  return (
    <SectionCard
      icon={Layers}
      tint="primary"
      title="Réplicas"
      right={
        <Badge variant="outline">
          <Text>{ROTULO_MODO[modo]}</Text>
        </Badge>
      }
    >
      {scaling.status ? (
        <Modo key={modo} status={scaling.status} scaling={scaling} canScale={canScale} />
      ) : (
        <Skeleton className="h-10 w-full rounded-xl" />
      )}
    </SectionCard>
  );
}
