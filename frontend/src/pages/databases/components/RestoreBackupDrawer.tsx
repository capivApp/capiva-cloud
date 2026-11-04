import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm, type UseFormSetError } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { DatabaseRestoreInput, RestoreMode } from "@/hooks/useBackupRestores";

interface FormValues {
  mode: RestoreMode;
  confirmName: string;
  newName: string;
}

const RESOURCE_NAME = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

type ModeCheck = (values: FormValues, ctx: z.RefinementCtx, databaseName: string) => void;

/** O que cada modo exige do formulário (strategy por modo, igual ao backend). */
const MODE_CHECKS: Record<RestoreMode, ModeCheck> = {
  IN_PLACE: (values, ctx, databaseName) => {
    if (values.confirmName.trim() === databaseName) return;
    ctx.addIssue({ code: "custom", path: ["confirmName"], message: "Digite o nome do banco para confirmar." });
  },
  AS_COPY: (values, ctx, databaseName) => {
    if (!RESOURCE_NAME.test(values.newName)) {
      ctx.addIssue({ code: "custom", path: ["newName"], message: "Use letras minúsculas, números e hífen." });
      return;
    }
    if (values.newName !== databaseName) return;
    ctx.addIssue({ code: "custom", path: ["newName"], message: "Use um nome diferente do banco atual." });
  },
};

const buildSchema = (databaseName: string) =>
  z
    .object({ mode: z.enum(["IN_PLACE", "AS_COPY"]), confirmName: z.string(), newName: z.string().trim().max(40, "Use no máximo 40 caracteres.") })
    .superRefine((values, ctx) => MODE_CHECKS[values.mode](values, ctx, databaseName));

const PAYLOAD: Record<RestoreMode, (values: FormValues) => DatabaseRestoreInput> = {
  IN_PLACE: (values) => ({ mode: "IN_PLACE", confirmName: values.confirmName.trim() }),
  AS_COPY: (values) => ({ mode: "AS_COPY", newName: values.newName.trim() }),
};

/** Erro de negócio da API que pertence a um campo do formulário. */
const FIELD_BY_CODE: Record<string, keyof FormValues> = {
  RESTORE_CONFIRMATION: "confirmName",
  RESTORE_COPY_NAME: "newName",
  CONFLICT: "newName",
};

type ApiBody = { error?: string; message?: string; issues?: { path: (string | number)[]; message: string }[] };

/** Devolve o erro da API para o campo: issues do Zod (422) e erros de negócio com código. */
function applyApiErrors(error: unknown, setError: UseFormSetError<FormValues>): boolean {
  if (!(error instanceof ApiError)) return false;
  const body = (error.body ?? {}) as ApiBody;
  const issues = body.issues ?? [];
  issues.forEach((issue) => setError(issue.path.join(".") as keyof FormValues, { message: issue.message }));
  const field = FIELD_BY_CODE[body.error ?? ""];
  if (field) setError(field, { message: body.message ?? error.message });
  return issues.length > 0 || Boolean(field);
}

const MODE_OPTIONS: { mode: RestoreMode; title: string; hint: string }[] = [
  { mode: "AS_COPY", title: "Como cópia", hint: "Cria um banco novo com os dados do backup. O banco atual continua igual." },
  { mode: "IN_PLACE", title: "Sobre o banco atual", hint: "Apaga os dados atuais e coloca os do backup no lugar." },
];

/** Modal de restore de um backup de banco: escolha do modo e confirmação. */
export function RestoreBackupDrawer({
  open,
  onClose,
  databaseName,
  backupLabel,
  onSubmit,
  isSubmitting,
}: {
  open: boolean;
  onClose: () => void;
  databaseName: string;
  backupLabel: string;
  onSubmit: (input: DatabaseRestoreInput) => Promise<unknown>;
  isSubmitting: boolean;
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(buildSchema(databaseName)),
    defaultValues: { mode: "AS_COPY", confirmName: "", newName: `${databaseName}-copia` },
  });
  const mode = watch("mode");

  useEffect(() => {
    if (open) reset({ mode: "AS_COPY", confirmName: "", newName: `${databaseName}-copia` });
  }, [open, databaseName, reset]);

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(PAYLOAD[values.mode](values));
      toast.success("Restauração iniciada.");
      onClose();
    } catch (error) {
      const onField = applyApiErrors(error, setError);
      toast.error(onField ? "Confira os campos destacados." : (error as Error).message);
    }
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Restaurar backup"
      description={`Backup de ${backupLabel}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant={mode === "IN_PLACE" ? "destructive" : "default"} onClick={submit} disabled={isSubmitting}>
            {mode === "IN_PLACE" ? "Substituir dados" : "Criar cópia"}
          </Button>
        </div>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.mode}
              type="button"
              onClick={() => setValue("mode", option.mode)}
              className={cn(
                "w-full rounded-lg border p-3 text-left transition-colors",
                mode === option.mode ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
              )}
            >
              <p className="text-sm font-medium">{option.title}</p>
              <p className="text-xs text-muted-foreground">{option.hint}</p>
            </button>
          ))}
        </div>

        {mode === "AS_COPY" && (
          <div className="space-y-1.5">
            <Label htmlFor="newName">Nome do banco novo</Label>
            <Input id="newName" {...register("newName")} />
            {errors.newName && <p className="text-xs text-destructive">{errors.newName.message}</p>}
          </div>
        )}

        {mode === "IN_PLACE" && (
          <div className="space-y-1.5">
            <Label htmlFor="confirmName">
              Para confirmar, digite <span className="font-mono font-semibold">{databaseName}</span>
            </Label>
            <Input id="confirmName" autoComplete="off" {...register("confirmName")} />
            {errors.confirmName && <p className="text-xs text-destructive">{errors.confirmName.message}</p>}
            <p className="text-xs text-destructive">Os dados atuais do banco serão apagados.</p>
          </div>
        )}
      </form>
    </Drawer>
  );
}
