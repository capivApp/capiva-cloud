import type { LucideIcon } from "lucide-react-native";
import { IconBadge, type IconTint } from "@/components/icon-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Card de seção com ícone, título e um slot à direita (status, contador). */
export function SectionCard({
  icon,
  tint,
  title,
  right,
  children,
}: {
  icon: LucideIcon;
  tint: IconTint;
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="rounded-2xl border-border/60 py-5">
      <CardHeader className="flex-row items-center gap-3">
        <IconBadge icon={icon} tint={tint} />
        <CardTitle className="flex-1 text-base">{title}</CardTitle>
        {right}
      </CardHeader>
      <CardContent className="gap-3">{children}</CardContent>
    </Card>
  );
}
