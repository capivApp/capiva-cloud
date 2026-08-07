import type { LucideIcon } from "lucide-react-native";
import { View } from "react-native";
import { Progress } from "@/components/ui/progress";
import { Text } from "@/components/ui/text";
import { nativeTheme } from "@/lib/theme";

interface MetricBarProps {
  label: string;
  used: number;
  capacity: number;
  unit: string;
  icon?: LucideIcon;
}

const USAGE_TONE: { limit: number; className: string }[] = [
  { limit: 70, className: "bg-primary" },
  { limit: 90, className: "bg-secondary" },
  { limit: Infinity, className: "bg-destructive" },
];

/** Barra de uso (CPU/memória) com rótulo, ícone e cor por severidade. */
export function MetricBar({ label, used, capacity, unit, icon: Icon }: MetricBarProps) {
  const pct = capacity > 0 ? Math.min(100, Math.round((used / capacity) * 100)) : 0;
  const tone = USAGE_TONE.find((t) => pct <= t.limit)!;
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          {Icon && <Icon color={nativeTheme.mutedForeground} size={14} />}
          <Text className="text-sm text-muted-foreground">{label}</Text>
        </View>
        <Text className="text-xs text-muted-foreground">
          {used.toLocaleString()} / {capacity.toLocaleString()} {unit} ({pct}%)
        </Text>
      </View>
      <Progress value={pct} className="h-2 bg-muted" indicatorClassName={tone.className} />
    </View>
  );
}
