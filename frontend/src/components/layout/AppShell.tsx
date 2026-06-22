import {
  Activity,
  Bell,
  Boxes,
  Cpu,
  Database,
  FolderGit2,
  GitBranch,
  HardDrive,
  KeyRound,
  LayoutDashboard,
  LineChart,
  LogOut,
  Network,
  ScrollText,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Store,
  Users,
} from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Logo } from "@/components/brand/Logo";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { OrgSwitcher } from "@/components/layout/OrgSwitcher";
import { WorkspaceSwitcher } from "@/components/layout/WorkspaceSwitcher";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/useAuthStore";

const SECTIONS: { title: string; items: { to: string; label: string; icon: typeof Boxes; end?: boolean }[] }[] = [
  {
    title: "Projeto",
    items: [
      { to: "/", label: "Início", icon: LayoutDashboard, end: true },
      { to: "/projects", label: "Projetos", icon: FolderGit2 },
      { to: "/applications", label: "Aplicações", icon: Boxes },
      { to: "/databases", label: "Bancos", icon: Database },
      { to: "/workloads", label: "Workers & Cron", icon: Cpu },
      { to: "/dependencies", label: "Dependências", icon: Network },
      { to: "/deployments", label: "Deploys", icon: GitBranch },
      { to: "/monitoring", label: "Monitoring", icon: Activity },
      { to: "/requests", label: "Requests", icon: ScrollText },
      { to: "/reports", label: "Reports", icon: LineChart },
      { to: "/marketplace", label: "Marketplace", icon: Store },
    ],
  },
  {
    title: "Organização",
    items: [
      { to: "/fleet", label: "Clusters / Fleet", icon: Server },
      { to: "/members", label: "Usuários", icon: Users },
      { to: "/notifications", label: "Notificações", icon: Bell },
      { to: "/registries", label: "Registries", icon: HardDrive },
      { to: "/storage", label: "Storage", icon: Database },
      { to: "/certificates", label: "Certificados", icon: ShieldCheck },
      { to: "/api-keys", label: "API Keys", icon: KeyRound },
      { to: "/audit", label: "Audit Logs", icon: ScrollText },
      { to: "/settings", label: "Configurações", icon: Settings },
    ],
  },
];

export function AppShell() {
  const navigate = useNavigate();
  const { user, clear } = useAuthStore();

  async function logout() {
    await api.post("/auth/logout", undefined, { auth: false }).catch(() => {});
    clear();
    navigate("/login");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-[hsl(var(--sidebar))]">
        <div className="flex h-16 items-center px-4">
          <Logo />
        </div>
        <div className="px-3 pb-2">
          <OrgSwitcher />
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-2">
          {SECTIONS.map((section) => (
            <div key={section.title} className="space-y-1">
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{section.title}</p>
              {section.items.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                    )
                  }
                >
                  <Icon className="size-4" />
                  {label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user?.name ?? "Usuário"}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={logout} title="Sair">
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-border px-6">
          <WorkspaceSwitcher />
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}
            className="inline-flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
          >
            <Search className="size-3.5" /> Buscar <kbd className="rounded bg-muted px-1 font-mono">⌘K</kbd>
          </button>
        </header>
        <CommandPalette />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
