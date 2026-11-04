import { FileCode2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buildCapivaNotice, isCapivaManaged, readCapivaMarker } from "@/lib/capivaJson";

interface Props {
  sourceConfig: Record<string, unknown> | null | undefined;
  /** Campos da seção (ex.: ["env"], ["domains"], ["port", "profile"]). */
  fields: string[];
}

/** Aviso de que a seção vem do capiva.json do repositório. Some quando o arquivo não a declara. */
export function CapivaJsonNotice({ sourceConfig, fields }: Props) {
  const text = buildCapivaNotice(readCapivaMarker(sourceConfig), fields);
  if (!text) return null;
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
      <FileCode2 className="mt-0.5 size-3.5 shrink-0 text-primary" />
      <span>{text}</span>
    </div>
  );
}

/** Selo "capiva.json" ao lado do rótulo de um campo somente leitura. */
export function CapivaJsonBadge({ sourceConfig, field }: { sourceConfig: Record<string, unknown> | null | undefined; field: string }) {
  if (!isCapivaManaged(readCapivaMarker(sourceConfig), field)) return null;
  return (
    <Badge variant="muted" className="ml-1.5 px-1.5 py-0 text-[10px]">
      capiva.json
    </Badge>
  );
}
