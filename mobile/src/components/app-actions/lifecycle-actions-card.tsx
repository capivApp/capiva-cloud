import { Play, RefreshCw, Rocket, Square, Zap } from "lucide-react-native";
import { View } from "react-native";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import type { Application } from "@/hooks/useApplications";
import type { useApplication } from "@/hooks/useApplication";
import { confirmAndRun, runAction } from "@/lib/alerts";
import type { PermissoesDaAplicacao } from "@/lib/permissions";
import { nativeTheme } from "@/lib/theme";

type Ciclo = ReturnType<typeof useApplication>;

interface LifecycleActionsCardProps {
  app: Application;
  ciclo: Ciclo;
  permissoes: PermissoesDaAplicacao;
}

// O backend grava `desiredStatus` em minúsculas ("stopped"/"running").
const isParada = (app: Application): boolean => app.desiredStatus.toLowerCase() === "stopped";

function PowerButton({ app, ciclo }: { app: Application; ciclo: Ciclo }) {
  if (isParada(app)) {
    return (
      <Button
        className="flex-1 rounded-xl"
        variant="outline"
        disabled={ciclo.isStarting}
        onPress={() => runAction(ciclo.start)}
      >
        <Play color={nativeTheme.foreground} size={16} />
        <Text>{ciclo.isStarting ? "Iniciando…" : "Iniciar"}</Text>
      </Button>
    );
  }
  return (
    <Button
      className="flex-1 rounded-xl"
      variant="outline"
      disabled={ciclo.isStopping}
      onPress={() => confirmAndRun("Parar", `Parar ${app.name}?`, ciclo.stop)}
    >
      <Square color={nativeTheme.foreground} size={16} />
      <Text>{ciclo.isStopping ? "Parando…" : "Parar"}</Text>
    </Button>
  );
}

/** Redeploy, reinício dos pods e liga/desliga. VIEWER só consulta. */
export function LifecycleActionsCard({ app, ciclo, permissoes }: LifecycleActionsCardProps) {
  if (!permissoes.redeploy) {
    return (
      <SectionCard icon={Zap} tint="secondary" title="Ações">
        <Text variant="muted">Somente consulta. Peça acesso de desenvolvedor para operar.</Text>
      </SectionCard>
    );
  }

  return (
    <SectionCard icon={Zap} tint="secondary" title="Ações">
      <View className="flex-row gap-2">
        <Button
          className="flex-1 rounded-xl"
          disabled={ciclo.isDeploying}
          onPress={() =>
            confirmAndRun(
              "Redeploy",
              `Publicar de novo o último commit ou imagem de ${app.name}?`,
              ciclo.deploy,
            )
          }
        >
          <Rocket color="#fff" size={16} />
          <Text>{ciclo.isDeploying ? "Enviando…" : "Redeploy"}</Text>
        </Button>
        {permissoes.restart && (
          <Button
            className="flex-1 rounded-xl"
            variant="secondary"
            disabled={ciclo.isRestarting}
            onPress={() =>
              confirmAndRun(
                "Reiniciar pods",
                `Os pods de ${app.name} serão recriados.`,
                ciclo.restart,
              )
            }
          >
            <RefreshCw color="#fff" size={16} />
            <Text>{ciclo.isRestarting ? "Reiniciando…" : "Reiniciar pods"}</Text>
          </Button>
        )}
      </View>
      {permissoes.lifecycle && (
        <View className="flex-row gap-2">
          <PowerButton app={app} ciclo={ciclo} />
        </View>
      )}
    </SectionCard>
  );
}
