import { Globe, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDomains, type AddDomainInput } from "@/pages/applications/hooks/useDomains";
import { useTlsCertificates } from "@/hooks/useTlsCertificates";

const tlsLabel = { lets_encrypt: "Let's Encrypt", uploaded: "Certificado enviado", none: "Sem TLS" } as const;

/**
 * Aba "Domínios" do detalhe da aplicação. CRUD de domínios customizados; cada um
 * vira um Ingress próprio com TLS por domínio (Let's Encrypt, certificado enviado
 * ou nenhum). Mudanças reconciliam o Ingress.
 */
export function DomainsTab({ applicationId }: { applicationId: string }) {
  const { domains, isLoading, add, isAdding, remove } = useDomains(applicationId);
  const { certificates } = useTlsCertificates();
  const [host, setHost] = useState("");
  const [tlsMode, setTlsMode] = useState<AddDomainInput["tlsMode"]>("lets_encrypt");
  const [tlsCertificateId, setTlsCertificateId] = useState("");

  const submit = async () => {
    if (!host.trim()) return toast.error("Informe o domínio.");
    if (tlsMode === "uploaded" && !tlsCertificateId) return toast.error("Selecione um certificado.");
    try {
      await add({ host: host.trim(), tlsMode, tlsCertificateId: tlsMode === "uploaded" ? tlsCertificateId : undefined });
      setHost("");
      setTlsCertificateId("");
      toast.success("Domínio adicionado. Reconciliando Ingress…");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const del = async (id: string) => {
    try {
      await remove(id);
      toast.success("Domínio removido.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-3 pt-5">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando domínios…</p>}
          {!isLoading && domains.length === 0 && <p className="text-sm text-muted-foreground">Nenhum domínio customizado.</p>}
          {domains.map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm">
              <div className="flex items-center gap-2">
                <Globe className="size-4 text-muted-foreground" />
                <span className="font-medium">{d.host}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={d.tlsMode === "none" ? "warning" : "success"}>
                  {d.tlsMode !== "none" && <ShieldCheck className="mr-1 size-3" />}
                  {tlsLabel[d.tlsMode]}
                </Badge>
                <Button variant="ghost" size="icon" onClick={() => del(d.id)}><Trash2 className="size-4" /></Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-5">
          <p className="text-sm font-medium">Adicionar domínio</p>
          <div className="space-y-1.5">
            <Label className="text-xs">Domínio</Label>
            <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="app.exemplo.com" className="font-mono text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">TLS</Label>
              <select className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={tlsMode} onChange={(e) => setTlsMode(e.target.value as AddDomainInput["tlsMode"])}>
                <option value="lets_encrypt">Let's Encrypt (automático)</option>
                <option value="uploaded">Certificado enviado</option>
                <option value="none">Sem TLS</option>
              </select>
            </div>
            {tlsMode === "uploaded" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Certificado</Label>
                <select className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={tlsCertificateId} onChange={(e) => setTlsCertificateId(e.target.value)}>
                  <option value="">Selecione…</option>
                  {certificates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <Button variant="gradient" size="sm" onClick={submit} disabled={isAdding}><Plus className="size-4" /> Adicionar e reconciliar</Button>
        </CardContent>
      </Card>
    </div>
  );
}
