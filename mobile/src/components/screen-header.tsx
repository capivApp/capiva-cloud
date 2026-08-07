import { View } from "react-native";
import { Text } from "@/components/ui/text";

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}

/** Header de tela custom (tabs escondem o header nativo). */
export function ScreenHeader({ title, subtitle, right }: ScreenHeaderProps) {
  return (
    <View className="flex-row items-center justify-between pb-1 pt-2">
      <View className="gap-0.5">
        <Text className="text-2xl font-extrabold tracking-tight">{title}</Text>
        {subtitle && <Text variant="muted">{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}
