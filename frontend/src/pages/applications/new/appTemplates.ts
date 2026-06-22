import type { VolumeSpec } from "@/pages/applications/hooks/useApplications";

/**
 * Catálogo de aplicações 1-clique (presets de Docker image). Clicar no
 * Marketplace abre o wizard de criação pré-preenchido (`?template=<id>`).
 * Apps populares self-hosted — o usuário só ajusta nome/domínio e cria.
 */
export interface AppTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  image: string;
  port: number;
  env?: { key: string; value: string }[];
  volumes?: VolumeSpec[];
}

export const APP_TEMPLATES: AppTemplate[] = [
  { id: "n8n", name: "n8n", description: "Automação de workflows low-code", category: "Automação", image: "n8nio/n8n:latest", port: 5678, volumes: [{ name: "n8n-data", mountPath: "/home/node/.n8n", sizeGi: 2, accessMode: "RWO" }] },
  { id: "ghost", name: "Ghost", description: "Publicação/blog moderno", category: "CMS", image: "ghost:5-alpine", port: 2368, env: [{ key: "NODE_ENV", value: "production" }], volumes: [{ name: "ghost-content", mountPath: "/var/lib/ghost/content", sizeGi: 5, accessMode: "RWO" }] },
  { id: "plausible", name: "Plausible Analytics", description: "Analytics web leve e privado", category: "Analytics", image: "plausible/analytics:latest", port: 8000 },
  { id: "uptime-kuma", name: "Uptime Kuma", description: "Monitor de uptime self-hosted", category: "Monitoramento", image: "louislam/uptime-kuma:1", port: 3001, volumes: [{ name: "kuma-data", mountPath: "/app/data", sizeGi: 2, accessMode: "RWO" }] },
  { id: "metabase", name: "Metabase", description: "BI e dashboards", category: "Analytics", image: "metabase/metabase:latest", port: 3000 },
  { id: "gitea", name: "Gitea", description: "Git self-hosted leve", category: "DevTools", image: "gitea/gitea:latest", port: 3000, volumes: [{ name: "gitea-data", mountPath: "/data", sizeGi: 10, accessMode: "RWO" }] },
  { id: "nocodb", name: "NocoDB", description: "Planilha → banco (Airtable OSS)", category: "DevTools", image: "nocodb/nocodb:latest", port: 8080, volumes: [{ name: "nocodb-data", mountPath: "/usr/app/data", sizeGi: 5, accessMode: "RWO" }] },
  { id: "vaultwarden", name: "Vaultwarden", description: "Gerenciador de senhas (Bitwarden OSS)", category: "Segurança", image: "vaultwarden/server:latest", port: 80, volumes: [{ name: "vw-data", mountPath: "/data", sizeGi: 2, accessMode: "RWO" }] },
  { id: "wordpress", name: "WordPress", description: "CMS mais popular do mundo", category: "CMS", image: "wordpress:latest", port: 80, volumes: [{ name: "wp-content", mountPath: "/var/www/html", sizeGi: 10, accessMode: "RWO" }] },
];

export const findTemplate = (id: string | null): AppTemplate | undefined => (id ? APP_TEMPLATES.find((t) => t.id === id) : undefined);
