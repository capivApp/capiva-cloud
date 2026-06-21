# 04 — Frontend Architecture

## Related Documents

- [02-arquitetura.md](./02-arquitetura.md)
- [03-arquitetura-backend.md](./03-arquitetura-backend.md)
- [05-modelo-de-dados.md](./05-modelo-de-dados.md)
- [07-fluxos.md](./07-fluxos.md)
- [08-wireframes.md](./08-wireframes.md)
- [11-seguranca-multitenant.md](./11-seguranca-multitenant.md)

---

## Technology Stack

- **React 19**
- **TypeScript**
- **React Router**
- **TanStack Query**
- **React Hook Form**
- **Zod**
- **Zustand**
- **TailwindCSS**
- **ShadCN/UI**
- **Vite**
- **Recharts**
- **@dnd-kit**
- **lucide-react**
- **sonner**

---

## Visual References

UI patterns, layouts and interaction conventions should reuse concepts and components from [`BasePage`](../../BasePage) whenever possible.

Visual identity, colors and branding are inherited from the **CapivApp** ecosystem (see [`landing`](../../landing)) and serve as the official design system for Capiva Cloud.

---

## Design Tokens

| Token          | Light                       | Dark           | Usage                            |
| -------------- | --------------------------- | -------------- | -------------------------------- |
| `--primary`    | `243 75% 59%`               | Same           | Primary actions and focus states |
| `--secondary`  | `330 81% 60%`               | Same           | Highlights and gradients         |
| `--background` | `0 0% 100%`                 | `222 84% 4.9%` | Page backgrounds                 |
| `--foreground` | `222 84% 4.9%`              | `210 40% 98%`  | Text                             |
| `--radius`     | `0.5rem`                    | —              | Border radius                    |
| Font           | Inter                       | —              | User interface                   |
| Brand Gradient | `from-primary to-secondary` | —              | Branding and headings            |

Dark mode is the default experience across the platform.

Tokens are defined in `src/index.css` and exposed through Tailwind using `hsl(var(--token))`.

---

## Project Structure

### `frontend/src`

```text
src/
├── main.tsx
├── App.tsx
├── routes.tsx
├── index.css
├── query.ts
├── assets/
├── components/
├── hooks/
├── lib/
├── stores/
├── providers/
├── schemas/
└── pages/
```

### Organizational Principles

Feature-specific code should remain close to the feature that owns it.

Examples:

```text
pages/
└── applications/
    ├── components/
    ├── hooks/
    ├── new/
    └── [id]/
```

Shared components should only be promoted to global directories when reused across multiple features.

Examples:

```text
components/
hooks/
schemas/
```

This keeps features self-contained and reduces coupling between unrelated areas of the application.

---

## Query Hook Pattern (Required)

Pages should never call `useQuery()` or `useMutation()` directly.

Each feature exposes dedicated hooks that encapsulate all TanStack Query logic.

Example:

```ts
export function useApplications(orgId: string) {
  const list = useQuery({
    queryKey: ["applications", orgId],
    queryFn: () => api.applications.list(orgId),
  });

  const createMut = useMutation({
    mutationKey: ["applications", "create"],
    mutationFn: (dto: CreateApplicationDTO) => api.applications.create(dto),
  });

  return {
    applications: list.data ?? [],
    isLoading: list.isLoading,
    refetch: list.refetch,
    create: createMut.mutateAsync,
    isCreating: createMut.isPending,
  };
}
```

Page components consume feature hooks exclusively:

```ts
const {applications, create} = useApplications(orgId);
```

### Benefits

- Consistent API access patterns
- Centralized cache handling
- Simpler page components
- Easier testing
- Reduced duplication

---

## State Management

### Server State

Managed through **TanStack Query**.

Responsibilities:

- Data fetching
- Caching
- Automatic refetching
- Query invalidation
- Background synchronization

The implementation follows the conventions established in `query.ts`.

### Client State

Managed through **Zustand**.

Typical use cases:

- Authenticated user
- Active organization
- Theme preferences
- UI state
- Application-level flags

Authentication tokens should not be stored in localStorage.

- Access token → memory
- Refresh token → HttpOnly cookie

For authentication details see [11-seguranca-multitenant.md](./11-seguranca-multitenant.md).

---

## Real-Time Updates

Shared hooks such as:

- `useWebSocket`
- `useEventStream`

are responsible for consuming server-side events.

Typical events include:

- Deployment progress
- Build progress
- Log streaming
- Resource status changes
- Timeline updates

Server events trigger query invalidation and cache updates, keeping the UI synchronized without manual refreshes.

Related workflows are documented in [07-fluxos.md](./07-fluxos.md).

---

## Authentication Flow

### Login

1. User authenticates.
2. Backend sets an HttpOnly refresh cookie.
3. Backend returns an access token.
4. Access token is stored in memory.

### Token Refresh

When a request returns `401 Unauthorized`:

1. Client performs `POST /auth/refresh`.
2. Refresh cookie is automatically sent.
3. Backend issues a new access token.
4. Original request is retried.

### Logout

1. Session is revoked.
2. Refresh cookie is removed.
3. Local state is cleared.

Complete authentication details are available in [11-seguranca-multitenant.md](./11-seguranca-multitenant.md).

---

## Design Principles

The frontend should prioritize:

1. Minimal configuration.
2. Guided workflows.
3. Consistent user experience.
4. Clear feedback during operations.
5. Real-time visibility into deployments and infrastructure.
6. Progressive disclosure of advanced options.

Complex infrastructure concepts should remain hidden unless explicitly required by advanced users.

---

## Next Steps

Continue with:

1. [05-modelo-de-dados.md](./05-modelo-de-dados.md)
2. [07-fluxos.md](./07-fluxos.md)
3. [08-wireframes.md](./08-wireframes.md)
