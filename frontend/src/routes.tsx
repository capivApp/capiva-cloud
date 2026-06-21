import { Activity, HardDrive, KeyRound, ScrollText, Users } from "lucide-react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";
import { ApplicationsPage } from "@/pages/applications/ApplicationsPage";
import { ApplicationDetailPage } from "@/pages/applications/detail/ApplicationDetailPage";
import { NewApplicationWizard } from "@/pages/applications/new/NewApplicationWizard";
import { LoginPage } from "@/pages/auth/login/LoginPage";
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
import { DatabasesPage } from "@/pages/databases/DatabasesPage";
import { DependenciesPage } from "@/pages/dependencies/DependenciesPage";
import { DeploysPage } from "@/pages/deploys/DeploysPage";
import { FleetPage } from "@/pages/fleet/FleetPage";
import { MarketplacePage } from "@/pages/marketplace/MarketplacePage";
import { ProjectsPage } from "@/pages/projects/ProjectsPage";
import { SettingsPage } from "@/pages/settings/SettingsPage";
import { WorkloadsPage } from "@/pages/workloads/WorkloadsPage";
import { useAuthStore } from "@/stores/useAuthStore";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.accessToken);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/applications" element={<ApplicationsPage />} />
        <Route path="/applications/new" element={<NewApplicationWizard />} />
        <Route path="/applications/:id" element={<ApplicationDetailPage />} />
        <Route path="/databases" element={<DatabasesPage />} />
        <Route path="/workloads" element={<WorkloadsPage />} />
        <Route path="/dependencies" element={<DependenciesPage />} />
        <Route path="/marketplace" element={<MarketplacePage />} />
        <Route path="/deployments" element={<DeploysPage />} />
        <Route path="/fleet" element={<FleetPage />} />
        <Route path="/monitoring" element={<PlaceholderPage title="Monitoring" description="Uso de recursos de nós e pods. (Fase 3.1)" icon={Activity} />} />
        <Route path="/requests" element={<PlaceholderPage title="Requests" description="Requisições recebidas pelo Traefik. (Fase 3.1)" icon={ScrollText} />} />
        <Route path="/members" element={<PlaceholderPage title="Usuários" description="Membros, papéis e convites. (Fase 3.2)" icon={Users} />} />
        <Route path="/registries" element={<PlaceholderPage title="Registries" description="Registries Docker para imagens privadas. (Fase 3.1)" icon={HardDrive} />} />
        <Route path="/api-keys" element={<PlaceholderPage title="API Keys" description="Chaves de API/CLI (para o app mobile). (Fase 3.2)" icon={KeyRound} />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
