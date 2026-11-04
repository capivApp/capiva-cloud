import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";

/** Confirmação do restore de volume: o backup vira um volume novo, o atual não muda. */
export function RestoreVolumeDrawer({
  open,
  onClose,
  volumeName,
  backupLabel,
  onConfirm,
  isSubmitting,
}: {
  open: boolean;
  onClose: () => void;
  volumeName: string;
  backupLabel: string;
  onConfirm: () => Promise<unknown>;
  isSubmitting: boolean;
}) {
  const confirm = () =>
    onConfirm()
      .then(() => {
        toast.success("Restauração iniciada.");
        onClose();
      })
      .catch((error) => toast.error((error as Error).message));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Restaurar backup"
      description={`Volume ${volumeName}, backup de ${backupLabel}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={confirm} disabled={isSubmitting}>
            Criar volume
          </Button>
        </div>
      }
    >
      <p className="text-sm text-muted-foreground">
        Um volume novo será criado com os dados do backup. O volume em uso pela aplicação continua
        igual.
      </p>
    </Drawer>
  );
}
