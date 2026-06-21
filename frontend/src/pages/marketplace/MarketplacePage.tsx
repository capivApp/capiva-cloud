import { Database, HardDrive, Layers, MessageSquare, Search } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CreateDatabaseDrawer } from "@/pages/databases/components/CreateDatabaseDrawer";

const CATALOG = [
  { category: "Banco de Dados", icon: Database, items: ["POSTGRESQL", "MYSQL", "CLICKHOUSE"] },
  { category: "Cache", icon: Layers, items: ["REDIS"] },
  { category: "Mensageria", icon: MessageSquare, items: ["RABBITMQ", "KAFKA"] },
  { category: "Busca", icon: Search, items: ["ELASTICSEARCH"] },
  { category: "Armazenamento", icon: HardDrive, items: ["MINIO"] },
];

export function MarketplacePage() {
  const [preset, setPreset] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Marketplace</h1>
        <p className="text-sm text-muted-foreground">Adicione serviços ao seu projeto com 1 clique.</p>
      </div>

      {CATALOG.map(({ category, icon: Icon, items }) => (
        <div key={category} className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Icon className="size-4" /> {category}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((kind) => (
              <Card key={kind} className="transition-colors hover:border-primary/40">
                <CardContent className="flex items-center justify-between pt-5">
                  <span className="font-medium">{kind}</span>
                  <Button size="sm" variant="outline" onClick={() => setPreset(kind)}>+ Add</Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}

      <CreateDatabaseDrawer open={Boolean(preset)} onClose={() => setPreset(null)} presetKind={preset ?? undefined} />
    </div>
  );
}
