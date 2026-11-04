import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SECRET_STORE_PROVIDERS, useSecretStores, type SecretStoreProvider } from "@/hooks/useSecretStores";

interface Field {
  name: string;
  label: string;
  placeholder?: string;
  initial?: string;
  secret?: boolean;
  multiline?: boolean;
}

/** Campos por provedor: o formulário muda sem `if` por tipo. */
const PROVIDER_FIELDS: Record<SecretStoreProvider, { config: Field[]; credentials: Field[] }> = {
  AWS_SECRETS_MANAGER: {
    config: [{ name: "region", label: "Região", placeholder: "us-east-1" }],
    credentials: [
      { name: "accessKeyId", label: "Access Key ID" },
      { name: "secretAccessKey", label: "Secret Access Key", secret: true },
    ],
  },
  VAULT: {
    config: [
      { name: "server", label: "URL do servidor", placeholder: "https://vault.exemplo.com" },
      { name: "path", label: "Caminho do KV", placeholder: "secret" },
      { name: "version", label: "Versão do KV", initial: "v2", placeholder: "v2" },
    ],
    credentials: [{ name: "token", label: "Token", secret: true }],
  },
  GCP_SECRET_MANAGER: {
    config: [{ name: "projectId", label: "ID do projeto", placeholder: "meu-projeto" }],
    credentials: [{ name: "serviceAccountJson", label: "JSON da service account", multiline: true }],
  },
};

const initialValues = (fields: Field[]) => Object.fromEntries(fields.map((f) => [f.name, f.initial ?? ""]));

function FieldInput({ field, value, onChange }: { field: Field; value: string; onChange: (value: string) => void }) {
  if (field.multiline) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        className="w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    );
  }
  return <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} type={field.secret ? "password" : "text"} />;
}

export function SecretStoreDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { create, isCreating } = useSecretStores();
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<SecretStoreProvider>("AWS_SECRETS_MANAGER");
  const [config, setConfig] = useState(() => initialValues(PROVIDER_FIELDS[provider].config));
  const [credentials, setCredentials] = useState(() => initialValues(PROVIDER_FIELDS[provider].credentials));
  const fields = PROVIDER_FIELDS[provider];

  // Config e credenciais recomeçam a cada troca de provedor e a cada abertura; nome e provedor ficam.
  const resetFields = (next: SecretStoreProvider) => {
    setConfig(initialValues(PROVIDER_FIELDS[next].config));
    setCredentials(initialValues(PROVIDER_FIELDS[next].credentials));
  };

  const selectProvider = (next: SecretStoreProvider) => {
    setProvider(next);
    resetFields(next);
  };

  const close = () => {
    resetFields(provider);
    onClose();
  };

  async function submit() {
    if (!name.trim()) return toast.error("Informe um nome.");
    try {
      await create({ name: name.trim(), provider, config, credentials });
      toast.success("Cofre cadastrado.");
      setName("");
      close();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={close}
      title="Novo cofre externo"
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={close}>Cancelar</Button><Button variant="gradient" onClick={submit} disabled={isCreating}>Cadastrar</Button></div>}
    >
      <div className="space-y-3">
        <div className="space-y-1.5"><Label>Nome</Label><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Cofre de produção" /></div>
        <div className="space-y-1.5">
          <Label>Provedor</Label>
          <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={provider} onChange={(e) => selectProvider(e.target.value as SecretStoreProvider)}>
            {Object.entries(SECRET_STORE_PROVIDERS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        {fields.config.map((f) => (
          <div key={f.name} className="space-y-1.5"><Label>{f.label}</Label><FieldInput field={f} value={config[f.name] ?? ""} onChange={(v) => setConfig({ ...config, [f.name]: v })} /></div>
        ))}
        {fields.credentials.map((f) => (
          <div key={f.name} className="space-y-1.5"><Label>{f.label}</Label><FieldInput field={f} value={credentials[f.name] ?? ""} onChange={(v) => setCredentials({ ...credentials, [f.name]: v })} /></div>
        ))}
        <p className="text-xs text-muted-foreground">As credenciais ficam cifradas e não são exibidas depois de salvas.</p>
      </div>
    </Drawer>
  );
}
