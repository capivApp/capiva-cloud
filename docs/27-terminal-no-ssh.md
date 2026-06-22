# 27. Terminal de nó (SSH)

Shell interativo num nó do cluster via SSH, no painel — reaproveita o `SSHExecutor`
(já usado no provisionamento k3s) e o mesmo gateway WebSocket do terminal de pod.

## Transporte e rota

Mesmo `TerminalGateway` (Bun.serve, porta dedicada). Nova rota
`/terminal/nodes/:nodeId` (além de `/terminal/applications/:id`). Auth por
`?access_token=` + `&org=`.

## Backend

- `SSHExecutor.openShell(target, io)`: abre um PTY (`requestShell({ term: "xterm-256color" })`),
  encaminha data/stderr e expõe `write/resize(setWindow)/close`.
- `NodeTerminalService.resolveTarget(nodeId, tenant)`: valida que o nó pertence a um cluster
  da org, decifra `sshCredentialCipher` e monta o `SSHTarget` (detecta chave PEM vs senha).
- O gateway decide pod (exec k8s) ou nó (SSH) pelo caminho.

## Frontend

- `WebTerminal` (componente reutilizável xterm.js, recebe `wsPath`) — usado pela aba
  Terminal da app e pelo terminal de nó.
- `ClusterNodesDrawer` (Configurações → Clusters → Nós): botão de terminal por nó abre o
  `WebTerminal` em `/terminal/nodes/:id`.

## Verificação

Abrir o terminal de um nó → rodar `uptime`/`hostname` e ver a saída via SSH.
