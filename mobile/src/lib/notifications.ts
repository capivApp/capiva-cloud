export interface ApplicationHref {
  pathname: "/apps/[id]";
  params: { id: string };
}

const readApplicationId = (data: unknown): string | null => {
  if (!data || typeof data !== "object") return null;
  const id = (data as { applicationId?: unknown }).applicationId;
  return typeof id === "string" && id ? id : null;
};

/** Rota que o toque no push abre: a aplicação do evento, quando o backend manda o id. */
export const buildNotificationHref = (data: unknown): ApplicationHref | null => {
  const id = readApplicationId(data);
  if (!id) return null;
  return { pathname: "/apps/[id]", params: { id } };
};
