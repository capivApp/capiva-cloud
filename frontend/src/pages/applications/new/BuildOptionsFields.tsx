import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fieldsOf, isSpaSource, validateBuildOptions, type BuildOptions, type BuildTextField } from "@/pages/applications/new/buildOptions";

/** Rótulo, exemplo e dica de cada opção de build. */
const FIELD_COPY: Record<BuildTextField, { label: string; placeholder: string; hint: string }> = {
  subPath: { label: "Contexto de build (opcional)", placeholder: "apps/web", hint: "Subpasta usada como raiz do build. Vazio = raiz do repositório." },
  installCommand: { label: "Comando de instalação (opcional)", placeholder: "pnpm install", hint: "Vazio = detectado automaticamente." },
  buildCommand: { label: "Comando de build (opcional)", placeholder: "npm run build", hint: "Vazio = detectado automaticamente." },
  startCommand: { label: "Comando de início (opcional)", placeholder: "node dist/index.js", hint: "Vazio = detectado automaticamente." },
  outputDir: { label: "Diretório publicado (opcional)", placeholder: "dist", hint: "Pasta servida pelo nginx. Vazio = dist com comando de build, raiz sem ele." },
  builder: { label: "Builder (opcional)", placeholder: "paketobuildpacks/builder-jammy-base", hint: "Imagem do builder de Buildpacks." },
  composeService: { label: "Serviço do compose (opcional)", placeholder: "web", hint: "Vazio = primeiro serviço com build." },
};

/** Campos de build da origem escolhida (strategy map em `buildOptions`). */
export function BuildOptionsFields({ source, value, onChange }: { source: string; value: BuildOptions; onChange: (patch: Partial<BuildOptions>) => void }) {
  const errors = validateBuildOptions(source, value);
  return (
    <div className="space-y-3">
      {fieldsOf(source).map((field) => (
        <div key={field} className="space-y-1.5">
          <Label>{FIELD_COPY[field].label}</Label>
          <Input
            value={value[field]}
            onChange={(e) => onChange({ [field]: e.target.value })}
            placeholder={FIELD_COPY[field].placeholder}
            className="font-mono text-xs"
            spellCheck={false}
          />
          <p className={errors[field] ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{errors[field] ?? FIELD_COPY[field].hint}</p>
        </div>
      ))}
      {isSpaSource(source) && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={value.spa} onChange={(e) => onChange({ spa: e.target.checked })} />
          Aplicação de página única (SPA): rotas desconhecidas abrem o index.html.
        </label>
      )}
    </div>
  );
}
