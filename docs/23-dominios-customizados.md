# 23. Domínios customizados (CRUD)

Antes só havia 1 domínio (via `sourceConfig.domain` no wizard). Agora a aba **Domínios**
do detalhe da app permite múltiplos domínios, cada um com TLS próprio.

## Endpoints (`/api/applications/:id`)

| Método | Rota                  | Descrição                          |
|--------|-----------------------|------------------------------------|
| GET    | `/domains`            | Lista os domínios da app.          |
| POST   | `/domains`            | Adiciona (host + tlsMode + cert).  |
| DELETE | `/domains/:domainId`  | Remove (apaga o Ingress no cluster).|

## Regras (`DomainService`)

- Valida o host (regex DNS), unicidade (`Domain.host @unique` → 409 em conflito).
- `tlsMode`: `lets_encrypt` (cert-manager), `uploaded` (exige `tlsCertificateId` da org)
  ou `none`. Campo `tlsCertificateId` adicionado ao modelo `Domain`.
- Cada mutação reconcilia a app; a remoção apaga o Ingress específico do domínio.

## Reconciliação

`ApplicationService.reconcile` agora carrega os `Domain` da app, mapeia o `tlsMode` para o
manifest e decifra certificados `uploaded` por domínio. O `ApplicationReconciler` cria **um
Ingress por domínio** via `ingressManifest(name, …, { serviceName, tlsSecretName })`, onde
`name = ingressNameFor(app, host)` (DNS-1123 estável: `<app>-<host-slug>`) e `serviceName`
aponta para o Service da app. O domínio primário legado (`sourceConfig.domain`) continua
como Ingress nomeado igual à app.

## Verificação (k3d real)

Adicionar 2 domínios → `kubectl get ingress` mostra os hosts + TLS por host; remover um
domínio apaga o Ingress correspondente.
