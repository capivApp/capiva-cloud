import { Activity, HardDrive, KeyRound, ScrollText, Users } from "lucide-react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";
import { ApiKeysPage } from "@/pages/apikeys/ApiKeysPage";
import { AuditLogsPage } from "@/pages/audit/AuditLogsPage";
import { ApplicationsPage } from "@/pages/applications/ApplicationsPage";
import { ApplicationDetailPage } from "@/pages/applications/detail/ApplicationDetailPage";
import { CertificatesPage } from "@/pages/certificates/CertificatesPage";
import { NewApplicationWizard } from "@/pages/applications/new/NewApplicationWizard";
import { LoginPage } from "@/pages/auth/login/LoginPage";
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
import { DatabasesPage } from "@/pages/databases/DatabasesPage";
import { DependenciesPage } from "@/pages/dependencies/DependenciesPage";
import { DeploysPage } from "@/pages/deploys/DeploysPage";
import { FleetPage } from "@/pages/fleet/FleetPage";
import { MarketplacePage } from "@/pages/marketplace/MarketplacePage";
import { MembersPage } from "@/pages/members/MembersPage";
import { MonitoringPage } from "@/pages/monitoring/MonitoringPage";
import { NotificationsPage } from "@/pages/notifications/NotificationsPage";
import { RegistriesPage } from "@/pages/registries/RegistriesPage";
import { ReportsPage } from "@/pages/reports/ReportsPage";
import { RequestsPage } from "@/pages/requests/RequestsPage";
import { StoragePage } from "@/pages/storage/StoragePage";
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
        <Route path="/monitoring" element={<MonitoringPage />} />
        <Route path="/requests" element={<RequestsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/members" element={<MembersPage />} />
        <Route path="/certificates" element={<CertificatesPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/registries" element={<RegistriesPage />} />
        <Route path="/storage" element={<StoragePage />} />
        <Route path="/api-keys" element={<ApiKeysPage />} />
        <Route path="/audit" element={<AuditLogsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
