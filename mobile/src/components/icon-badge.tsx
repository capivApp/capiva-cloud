import type { LucideIcon } from "lucide-react-native";
import { View } from "react-native";
import { nativeTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export type IconTint = "primary" | "secondary" | "success" | "destructive" | "muted";

const TINT_BG: Record<IconTint, string> = {
  primary: "bg-primary/15",
  secondary: "bg-secondary/15",
  success: "bg-success/15",
  destructive: "bg-destructive/15",
  muted: "bg-muted",
};

const TINT_COLOR: Record<IconTint, string> = {
  primary: nativeTheme.primary,
  secondary: nativeTheme.secondary,
  success: nativeTheme.success,
  destructive: nativeTheme.destructive,
  muted: nativeTheme.mutedForeground,
};

interface IconBadgeProps {
  icon: LucideIcon;
  tint?: IconTint;
  size?: number;
  className?: string;
}

/** Quadradinho arredondado com ícone tintado — assinatura visual dos cards. */
export function IconBadge({ icon: Icon, tint = "primary", size = 18, className }: IconBadgeProps) {
  return (
    <View
      className={cn("h-10 w-10 items-center justify-center rounded-xl", TINT_BG[tint], className)}
    >
      <Icon color={TINT_COLOR[tint]} size={size} />
    </View>
  );
}
