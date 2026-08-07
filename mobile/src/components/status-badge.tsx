import { Badge } from "@/components/ui/badge";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

type StatusTone = "success" | "destructive" | "warning" | "muted";

const TONE_BY_STATUS: Record<string, StatusTone> = {
  RUNNING: "success",
  HEALTHY: "success",
  READY: "success",
  CONNECTED: "success",
  SUCCEEDED: "success",
  DEPLOYED: "success",
  FAILED: "destructive",
  ERROR: "destructive",
  CRASHLOOP: "destructive",
  DEGRADED: "warning",
  DEPLOYING: "warning",
  BUILDING: "warning",
  PUSHING: "warning",
  QUEUED: "warning",
  PENDING: "warning",
  STOPPED: "muted",
  IDLE: "muted",
};

const BADGE_CLASS: Record<StatusTone, string> = {
  success: "border-success/40 bg-success/15",
  destructive: "border-destructive/40 bg-destructive/15",
  warning: "border-secondary/40 bg-secondary/15",
  muted: "border-border bg-muted",
};

const TEXT_CLASS: Record<StatusTone, string> = {
  success: "text-success",
  destructive: "text-destructive",
  warning: "text-secondary",
  muted: "text-muted-foreground",
};

/** Badge colorida por status de app/deploy/cluster (strategy map, sem if/else). */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = TONE_BY_STATUS[status.toUpperCase()] ?? "muted";
  return (
    <Badge variant="outline" className={cn(BADGE_CLASS[tone], className)}>
      <Text className={cn("text-xs font-semibold", TEXT_CLASS[tone])}>{status}</Text>
    </Badge>
  );
}
