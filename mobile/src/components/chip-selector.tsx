import { Pressable, ScrollView } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

interface ChipOption {
  id: string;
  label: string;
}

interface ChipSelectorProps {
  options: ChipOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** Seletor horizontal de chips (organização/projeto/cluster). */
export function ChipSelector({ options, selectedId, onSelect }: ChipSelectorProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
      {options.map((option) => {
        const active = option.id === selectedId;
        return (
          <Pressable
            key={option.id}
            onPress={() => onSelect(option.id)}
            className={cn(
              "h-9 justify-center rounded-full border border-border bg-card px-4",
              active && "border-primary bg-primary",
            )}
          >
            <Text className={cn("text-sm font-medium", active && "text-primary-foreground")}>{option.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
