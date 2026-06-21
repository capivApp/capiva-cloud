import { useEffect } from "react";
import { useAuthStore } from "@/stores/useAuthStore";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";
import { useOrganizations } from "@/hooks/useOrganizations";
import { useProjects } from "@/hooks/useProjects";
import { useEnvironments } from "@/hooks/useEnvironments";

/**
 * Resolve e mantém a seleção ativa de organização → projeto → ambiente,
 * selecionando defaults automaticamente. Consumido pelo header e pelas páginas.
 */
export function useWorkspace() {
  const { organizationId, setOrganization } = useAuthStore();
  const { projectId, environmentId, setProject, setEnvironment } = useWorkspaceStore();

  const { organizations } = useOrganizations();
  const { projects } = useProjects();
  const { environments } = useEnvironments();

  useEffect(() => {
    if (!organizationId && organizations.length) setOrganization(organizations[0].id);
  }, [organizationId, organizations, setOrganization]);

  useEffect(() => {
    if (!projectId && projects.length) setProject(projects[0].id);
    if (projectId && projects.length && !projects.some((p) => p.id === projectId)) setProject(projects[0].id);
  }, [projectId, projects, setProject]);

  useEffect(() => {
    if (!environmentId && environments.length) setEnvironment(environments[0].id);
  }, [environmentId, environments, setEnvironment]);

  return {
    organizations,
    projects,
    environments,
    organizationId,
    projectId,
    environmentId,
    setOrganization,
    setProject,
    setEnvironment,
  };
}
