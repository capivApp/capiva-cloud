import { Card, CardContent } from "@/components/ui/card";
import { WebTerminal } from "@/components/WebTerminal";

/**
 * Aba "Terminal" do detalhe da app: shell interativo (xterm.js) ligado por
 * WebSocket nativo ao pod via exec do backend. Sem polling, sem YAML.
 */
export function TerminalTab({ applicationId }: { applicationId: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 pt-5">
        <p className="text-xs text-muted-foreground">Shell interativo no container da aplicação.</p>
        <WebTerminal wsPath={`/terminal/applications/${applicationId}`} />
      </CardContent>
    </Card>
  );
}
