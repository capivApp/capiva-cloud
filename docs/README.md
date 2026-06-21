# 📚 Documentation

> Capiva Cloud is a platform that makes Kubernetes accessible to everyone. Deploy applications, databases, workers and scheduled jobs through a visual interface without dealing with Kubernetes complexity.

This directory contains the project's technical documentation, architecture decisions, workflows, infrastructure design and implementation details.

The documentation is intended to serve as the primary source of technical knowledge for contributors and maintainers.

## Documentation Index

| #   | Document                                                                       | Description                                                                                 |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| 00  | [Overview](./01-visao-geral.md)                                                | Product vision, philosophy and comparison with Railway, Render, Fly.io, Coolify and Dokploy |
| 01  | [System Architecture](./02-arquitetura.md)                                     | High-level architecture, core components and diagrams                                       |
| 02  | [Backend Architecture](./03-arquitetura-backend.md)                            | Bun, Express, decorators, Prisma, services and transaction patterns                         |
| 03  | [Frontend Architecture](./04-arquitetura-frontend.md)                          | React, TanStack Query, Zustand, UI architecture and conventions                             |
| 04  | [Data Model](./05-modelo-de-dados.md)                                          | Core entities, multi-tenancy and ER diagrams                                                |
| 05  | [Infrastructure Architecture](./06-arquitetura-kubernetes.md)                  | Kubernetes abstraction layer and platform components                                        |
| 06  | [Workflows](./07-fluxos.md)                                                    | Application deployment, database provisioning and user workflows                            |
| 07  | [Wireframes](./08-wireframes.md)                                               | Detailed screen layouts and interface concepts                                              |
| 08  | [Observability](./09-observabilidade.md)                                       | Logs, metrics and tracing                                                                   |
| 09  | [High Availability & Multi-Cluster](./10-alta-disponibilidade-multicluster.md) | Cluster topology, failover and workload distribution                                        |
| 10  | [Security & Multi-Tenancy](./11-seguranca-multitenant.md)                      | Authentication, authorization, tenant isolation and secrets management                      |
| 11  | [Managed Databases](./12-bancos-de-dados.md)                                   | PostgreSQL, MySQL and Redis architecture, HA and backups                                    |
| 12  | [Deployment Pipeline](./13-deploy-intelligence.md)                             | Git integration, automated deployments, rollbacks and delivery strategies                   |
| 13  | [Roadmap](./14-roadmap.md)                                                     | Planned milestones and implementation phases                                                |
| 14  | [Architecture Decision Records](./15-decisoes-tecnicas.md)                     | Technical decisions and rationale                                                           |
| 15  | [Repository Structure](./16-estrutura-de-pastas.md)                            | Monorepo organization and conventions                                                       |
| 16  | [Cluster Provisioning](./17-cluster-provisioning.md)                           | Kubernetes cluster installation, node management and infrastructure bootstrap               |

## Documentation Principles

- Prisma schema (`backend/prisma/schema.prisma`) is the source of truth for the data model.
- Business rules belong in the service layer and should be documented when relevant.
- Architecture and workflow diagrams should use Mermaid whenever possible.
- Documentation should evolve alongside the codebase.
- Significant architectural and operational decisions should be recorded through ADRs.

## Contributing

When introducing new platform capabilities, workflows or architectural changes, update the relevant documentation as part of the same pull request.

Keeping documentation current is considered part of the implementation process, not a separate task.
