import { ScrollView, View, type ScrollViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "@/lib/utils";

interface ScreenProps extends ScrollViewProps {
  /** Rola o conteúdo (padrão). Desative para telas com lista/terminal próprios. */
  scroll?: boolean;
  /** Aplica o inset superior (telas fora do header de Stack/Tabs). */
  topInset?: boolean;
  /** Não pinta o fundo (telas com decoração própria atrás, ex.: login). */
  transparent?: boolean;
}

/** Wrapper padrão de tela: fundo, padding e safe area. */
export function Screen({ scroll = true, topInset = false, transparent = false, className, children, ...props }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const padding = { paddingTop: topInset ? insets.top : 0, paddingBottom: insets.bottom };
  const background = transparent ? "" : "bg-background";

  if (!scroll) {
    return (
      <View className={cn("flex-1", background, className)} style={padding} {...props}>
        {children}
      </View>
    );
  }

  return (
    <View className={cn("flex-1", background)} style={padding}>
      <ScrollView
        contentContainerClassName={cn("gap-4 p-4", className)}
        keyboardShouldPersistTaps="handled"
        {...props}
      >
        {children}
      </ScrollView>
    </View>
  );
}
