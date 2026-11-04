import { ExternalLink, GitPullRequest, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/pages/applications/components/StatusBadge";
import { usePreviewDeployments } from "@/pages/applications/hooks/usePreviewDeployments";
import type { Application, PreviewApplication } from "@/pages/applications/hooks/useApplications";
import { readPreviewInfo } from "@/pages/applications/preview";

/** Aba "Previews": ambientes efêmeros abertos pelos PRs desta aplicação. */
export function PreviewsTab({ app }: { app: Application }) {
  const { destroy, destroyingId } = usePreviewDeployments(app.id);
  const previews = app.previews ?? [];
  const enabled = (app.sourceConfig?.previews as { enabled?: boolean } | undefined)?.enabled === true;

  const onDestroy = async (preview: PreviewApplication) => {
    if (!confirm(`Destruir o preview ${preview.name}?`)) return;
    try {
      await destroy(preview.id);
      toast.success("Preview destruído.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <p className="flex items-center gap-2 text-sm font-medium"><GitPullRequest className="size-4" /> Ambientes de preview</p>
        {!enabled && previews.length === 0 && (
          <p className="text-sm text-muted-foreground">Previews desligados. Ligue em Configurações para cada PR ganhar o seu ambiente.</p>
        )}
        {enabled && previews.length === 0 && <p className="text-sm text-muted-foreground">Nenhum PR aberto com preview.</p>}
        {previews.map((preview) => (
          <PreviewRow key={preview.id} preview={preview} destroying={destroyingId === preview.id} onDestroy={() => onDestroy(preview)} />
        ))}
      </CardContent>
    </Card>
  );
}

function PreviewRow({ preview, destroying, onDestroy }: { preview: PreviewApplication; destroying: boolean; onDestroy: () => void }) {
  const info = readPreviewInfo(preview);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
      <div className="min-w-0 space-y-0.5">
        <Link to={`/applications/${preview.id}`} className="font-medium hover:text-primary">
          PR #{info.number}{info.title ? ` · ${info.title}` : ""}
        </Link>
        <p className="font-mono text-xs text-muted-foreground">{info.branch}</p>
      </div>
      <div className="flex items-center gap-2">
        {info.url && (
          <a href={info.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            <ExternalLink className="size-3.5" /> {info.url.replace(/^https?:\/\//, "")}
          </a>
        )}
        <StatusBadge status={preview.observedStatus} />
        <Button variant="ghost" size="sm" onClick={onDestroy} disabled={destroying}>
          <Trash2 className="size-3.5" /> Destruir
        </Button>
      </div>
    </div>
  );
}
