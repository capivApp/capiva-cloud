## 16 — Monorepo Structure (Folder Layout)

```
capiva-cloud/
├── package.json                # workspaces (backend, frontend) + root scripts
├── bunfig.toml                # global aliases + preload
├── docker-compose.yml         # test environment (db, minio, backend, frontend)
├── README.md                  # platform overview
├── docs/                      # technical documentation (system memory)
│
├── backend/
│   ├── package.json
│   ├── bunfig.toml            # aliases (@service, @repository, @controller, ...)
│   ├── tsconfig.json          # paths mirroring aliases
│   ├── prisma.config.ts
│   ├── Dockerfile
│   ├── .env.example
│   ├── prisma/
│   │   └── schema.prisma      # SINGLE SOURCE OF TRUTH (database)
│   └── src/
│       ├── index.ts           # entrypoint
│       ├── config.ts
│       ├── bootstrap/registry.ts
│       ├── http/
│       │   ├── server.ts
│       │   └── routes/{web,api}/
│       ├── controller/
│       ├── service/           # business logic
│       ├── repository/        # ONLY Prisma access layer
│       ├── model/             # implements Prisma.*
│       ├── schemas/           # Zod schemas
│       ├── auth/              # tokens, cookies, sessions, fingerprint, password
│       ├── database/          # prisma.ts + withTransaction.ts
│       ├── infra/{kubernetes,git,build,storage}/
│       ├── middlewares/
│       ├── di/
│       ├── functions/
│       ├── interfaces/
│       └── openapi/
│
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json          # path aliases (@/...)
    ├── components.json        # ShadCN config
    ├── index.html
    ├── Dockerfile
    ├── .env.example
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── routes.tsx
        ├── index.css          # CapivApp design tokens
        ├── query.ts
        ├── assets/logo.png    # main brand asset
        ├── components/{ui,layout,brand,charts}/
        ├── hooks/
        ├── lib/
        ├── stores/
        ├── providers/
        ├── schemas/
        └── pages/
            ├── auth/login/
            ├── dashboard/
            ├── applications/{components,hooks,new,[id]}/
            ├── databases/
            ├── marketplace/
            ├── dependencies/
            └── settings/
```

---

## Conventions

- Always use **path aliases** (tsconfig + bunfig). No deep relative imports.
- Frontend is **feature co-located**:
  - component/hook stays inside the page folder
  - only moves to shared `/components` or `/hooks` when reused

- Backend strictly layered:
  - Controller → Service → Repository
  - Prisma only inside Repository layer

- Documentation is living:
  - everything important goes into `/docs`, no exceptions

---
