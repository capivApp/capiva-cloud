import { Badge } from "@/components/ui/badge";

const MAP: Record<string, { label: string; variant: "success" | "warning" | "danger" | "muted" }> = {
  running: { label: "Online", variant: "success" },
  progressing: { label: "Implantando", variant: "warning" },
  pending: { label: "Pendente", variant: "muted" },
  failed: { label: "Falhou", variant: "danger" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = MAP[status] ?? MAP.pending;
  return (
    <Badge variant={s.variant}>
      <span className="size-1.5 rounded-full bg-current" />
      {s.label}
    </Badge>
  );
}
