import { Boxes, FileText, FolderGit2, LayoutGrid, Search, Settings } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useApplications } from "@/pages/applications/hooks/useApplications";
import { useProjects } from "@/hooks/useProjects";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: typeof Boxes;
  run: () => void;
}

// Navegação/configurações pesquisáveis (rota + rótulo).
const NAV: { label: string; to: string; group: string }[] = [
  { label: "Início", to: "/", group: "Projeto" },
  { label: "Projetos", to: "/projects", group: "Projeto" },
  { label: "Aplicações", to: "/applications", group: "Projeto" },
  { label: "Bancos", to: "/databases", group: "Projeto" },
  { label: "Workers & Cron", to: "/workloads", group: "Projeto" },
  { label: "Dependências", to: "/dependencies", group: "Projeto" },
  { label: "Deploys", to: "/deployments", group: "Projeto" },
  { label: "Monitoring", to: "/monitoring", group: "Projeto" },
  { label: "Requests", to: "/requests", group: "Projeto" },
  { label: "Reports", to: "/reports", group: "Projeto" },
  { label: "Marketplace", to: "/marketplace", group: "Projeto" },
  { label: "Clusters / Fleet", to: "/fleet", group: "Organização" },
  { label: "Usuários", to: "/members", group: "Organização" },
  { label: "Notificações", to: "/notifications", group: "Organização" },
  { label: "Registries", to: "/registries", group: "Organização" },
  { label: "Storage", to: "/storage", group: "Organização" },
  { label: "Certificados", to: "/certificates", group: "Organização" },
  { label: "API Keys", to: "/api-keys", group: "Organização" },
  { label: "Audit Logs", to: "/audit", group: "Organização" },
  { label: "Configurações", to: "/settings", group: "Organização" },
];

/**
 * Command palette (⌘K / Ctrl+K): busca em menus, configurações, projetos,
 * aplicações e documentação, e navega. Substitui o rótulo estático.
 */
export function CommandPalette() {
  const navigate = useNavigate();
  const { projectId, setProject } = useWorkspaceStore();
  const { projects } = useProjects();
  const { applications } = useApplications(projectId);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) { setQuery(""); setActive(0); }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => { navigate(to); setOpen(false); };
    const nav = NAV.map((n) => ({ id: `nav:${n.to}`, label: n.label, hint: n.group, icon: n.group === "Projeto" ? LayoutGrid : Settings, run: go(n.to) }));
    const proj = projects.map((p) => ({ id: `proj:${p.id}`, label: p.name, hint: "Projeto", icon: FolderGit2, run: () => { setProject(p.id); navigate("/applications"); setOpen(false); } }));
    const apps = applications.map((a) => ({ id: `app:${a.id}`, label: a.name, hint: "Aplicação", icon: Boxes, run: go(`/applications/${a.id}`) }));
    const docs: Command = { id: "docs", label: "Documentação (API)", hint: "Docs", icon: FileText, run: () => { window.open("/docs", "_blank"); setOpen(false); } };
    return [...nav, ...proj, ...apps, docs];
  }, [projects, applications, navigate, setProject]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.slice(0, 12);
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.hint?.toLowerCase().includes(q)).slice(0, 20);
  }, [query, commands]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh]" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in" />
      <div className="relative w-full max-w-xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl animate-in fade-in slide-in-from-top-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="size-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              if (e.key === "Enter") { e.preventDefault(); filtered[active]?.run(); }
            }}
            placeholder="Buscar menus, projetos, aplicações, docs…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-80 overflow-auto p-2">
          {filtered.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nada encontrado.</p>}
          {filtered.map((c, i) => (
            <button
              key={c.id}
              onMouseEnter={() => setActive(i)}
              onClick={c.run}
              className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm", i === active ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted")}
            >
              <c.icon className="size-4 shrink-0" />
              <span className="flex-1 truncate text-foreground">{c.label}</span>
              {c.hint && <span className="shrink-0 text-xs text-muted-foreground">{c.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
