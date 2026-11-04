import { Minus, Plus } from "lucide-react-native";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { stepReplicas, type StepperLimites } from "@/lib/scaling";
import { nativeTheme } from "@/lib/theme";

interface ReplicaStepperProps {
  label: string;
  value: number;
  limites: StepperLimites;
  disabled?: boolean;
  onChange: (value: number) => void;
}

/** Stepper de réplicas (− valor +) preso aos limites recebidos. */
export function ReplicaStepper({ label, value, limites, disabled = false, onChange }: ReplicaStepperProps) {
  const change = (delta: number) => onChange(stepReplicas(value, delta, limites));

  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className="flex-1 text-sm text-muted-foreground">{label}</Text>
      <View className="flex-row items-center gap-2">
        <Button
          size="icon"
          variant="outline"
          className="rounded-xl"
          accessibilityLabel={`Diminuir ${label}`}
          disabled={disabled || value <= limites.min}
          onPress={() => change(-1)}
        >
          <Minus color={nativeTheme.foreground} size={16} />
        </Button>
        <Text className="w-10 text-center text-lg font-bold">{value}</Text>
        <Button
          size="icon"
          variant="outline"
          className="rounded-xl"
          accessibilityLabel={`Aumentar ${label}`}
          disabled={disabled || value >= limites.max}
          onPress={() => change(1)}
        >
          <Plus color={nativeTheme.foreground} size={16} />
        </Button>
      </View>
    </View>
  );
}
