import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function PlaceholderPage({ title, description, icon: Icon }: { title: string; description: string; icon: LucideIcon }) {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-20 text-center">
          <div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-6" />
          </div>
          <p className="font-medium">Em construção</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Esta área faz parte do roadmap da plataforma. A arquitetura e os fluxos já estão definidos em <code>/docs</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
