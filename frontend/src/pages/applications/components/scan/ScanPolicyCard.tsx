import { Save, ShieldCheck } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { Application } from "@/pages/applications/hooks/useApplications";
import { useScanPolicy } from "@/pages/applications/hooks/useScanPolicy";
import {
  BlockOnSeverity,
  readScanPolicy,
  type ScanPolicy,
} from "@/pages/applications/components/scan/types";

const BLOCK_OPTIONS: { value: BlockOnSeverity; label: string }[] = [
  { value: BlockOnSeverity.NONE, label: "Não bloquear (só avisar)" },
  { value: BlockOnSeverity.CRITICAL, label: "Bloquear com vulnerabilidade crítica" },
  { value: BlockOnSeverity.HIGH, label: "Bloquear com vulnerabilidade alta ou crítica" },
];

/** Política de scan de vulnerabilidades (Trivy) da aplicação, na aba Configurações. */
export function ScanPolicyCard({ app }: { app: Application }) {
  const { save, isSaving } = useScanPolicy(app.id);
  const { register, handleSubmit, control } = useForm<ScanPolicy>({
    values: readScanPolicy(app.sourceConfig),
  });
  const scanEnabled = useWatch({ control, name: "scanEnabled" });

  const onSubmit = handleSubmit(async (policy) => {
    try {
      await save(policy);
      toast.success("Política de scan salva. Vale a partir do próximo deploy.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  });

  return (
    <Card>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4 pt-5">
          <p className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="size-4" /> Scan de vulnerabilidades
          </p>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register("scanEnabled")} className="accent-primary" />
            <span className="font-medium">Escanear a imagem antes de cada deploy</span>
          </label>

          {scanEnabled && (
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="blockOnSeverity">
                Quando encontrar vulnerabilidades
              </Label>
              <select
                id="blockOnSeverity"
                {...register("blockOnSeverity")}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              >
                {BLOCK_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Deploy bloqueado não sobe. Se o scan não concluir, o deploy segue com aviso.
              </p>
            </div>
          )}

          <Button type="submit" variant="gradient" size="sm" disabled={isSaving}>
            <Save className="size-4" /> Salvar política
          </Button>
        </CardContent>
      </form>
    </Card>
  );
}
