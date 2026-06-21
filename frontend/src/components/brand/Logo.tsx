import logoUrl from "@/assets/logo.png";
import { cn } from "@/lib/utils";

/**
 * Branding central da Capiva Cloud. TODOS os componentes que exibem a marca
 * devem consumir este componente (que usa frontend/assets/logo.png).
 */
export function Logo({ className, withWordmark = true }: { className?: string; withWordmark?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <img src={logoUrl} alt="Capiva Cloud" className="h-8 w-8 rounded-lg" />
      {withWordmark && (
        <span className="text-lg font-extrabold tracking-tight">
          <span className="gradient-text">Capiva</span>
          <span className="text-foreground"> Cloud</span>
        </span>
      )}
    </div>
  );
}
