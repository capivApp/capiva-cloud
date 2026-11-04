import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UsoDeQuota } from "@/components/finops/UsoDeQuota";
import { useEnvironmentQuota } from "@/hooks/useEnvironmentQuota";
import {
  QUOTA_RECURSOS,
  RECURSOS_DE_QUOTA,
  readCampoErrors,
  type LimiteDeQuota,
  type RecursoDeQuota,
} from "@/lib/finops";

// Campo vazio = sem limite. O valor fica na unidade da tela (vCPU, GiB) e é
// convertido para a unidade da API só no envio; os nomes batem com o `path` da API.
const campo = z
  .string()
  .refine(
    (v) => v.trim() === "" || Number(v.replace(",", ".")) > 0,
    "Informe um número maior que zero ou deixe vazio.",
  );

type FormData = Record<RecursoDeQuota, string>;

// Validação por campo com o schema Zod: o `zodResolver` instalado (3.x) não lê o
// ZodError do Zod 4 e lançaria em vez de marcar o campo.
const validateCampo = (valor: string): true | string => {
  const result = campo.safeParse(valor);
  return result.success || (result.error.issues[0]?.message ?? "Valor inválido.");
};

const toFormValue = (recurso: RecursoDeQuota, valor: number | null): string =>
  valor === null ? "" : String(RECURSOS_DE_QUOTA[recurso].fromApi(valor));

const toLimite = (recurso: RecursoDeQuota, valor: string): number | null =>
  valor.trim() === "" ? null : RECURSOS_DE_QUOTA[recurso].toApi(Number(valor.replace(",", ".")));

const buildLimite = (data: FormData): LimiteDeQuota => ({
  cpuMillicores: toLimite("cpuMillicores", data.cpuMillicores),
  memoryMib: toLimite("memoryMib", data.memoryMib),
  pods: toLimite("pods", data.pods),
  storageGi: toLimite("storageGi", data.storageGi),
});

const EMPTY: FormData = { cpuMillicores: "", memoryMib: "", pods: "", storageGi: "" };

/** Quota do ambiente: limites (vazio = sem limite) e o uso atual. */
export function QuotaDrawer({
  environment,
  onClose,
}: {
  environment: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const { quota, save, isSaving } = useEnvironmentQuota(environment?.id);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormData>({ defaultValues: EMPTY });

  useEffect(() => {
    if (!quota) return reset(EMPTY);
    reset({
      cpuMillicores: toFormValue("cpuMillicores", quota.limite.cpuMillicores),
      memoryMib: toFormValue("memoryMib", quota.limite.memoryMib),
      pods: toFormValue("pods", quota.limite.pods),
      storageGi: toFormValue("storageGi", quota.limite.storageGi),
    });
  }, [quota, reset]);

  async function onSubmit(data: FormData) {
    try {
      await save(buildLimite(data));
      toast.success("Quota salva.");
      onClose();
    } catch (e) {
      readCampoErrors(e).forEach((err) =>
        setError(err.path as keyof FormData, { message: err.message }),
      );
      toast.error((e as Error).message || "Não foi possível salvar a quota.");
    }
  }

  return (
    <Drawer
      open={Boolean(environment)}
      onClose={onClose}
      title={`Quota de ${environment?.name ?? ""}`}
      description="Deixe vazio para não limitar o recurso."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="gradient" onClick={handleSubmit(onSubmit)} disabled={isSaving}>
            Salvar
          </Button>
        </div>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        {QUOTA_RECURSOS.map((recurso) => (
          <div key={recurso} className="space-y-1.5">
            <Label htmlFor={`quota-${recurso}`}>
              {RECURSOS_DE_QUOTA[recurso].rotulo} ({RECURSOS_DE_QUOTA[recurso].unidade})
            </Label>
            <Input
              id={`quota-${recurso}`}
              inputMode="decimal"
              placeholder="Sem limite"
              {...register(recurso, { validate: validateCampo })}
            />
            {errors[recurso] && (
              <p className="text-xs text-destructive">{errors[recurso]?.message}</p>
            )}
          </div>
        ))}
      </form>
      {quota && (
        <div className="mt-6 space-y-2 border-t border-border pt-4">
          <p className="text-sm font-medium">Uso atual</p>
          <UsoDeQuota quota={quota} />
        </div>
      )}
    </Drawer>
  );
}
