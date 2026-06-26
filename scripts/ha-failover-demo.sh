#!/usr/bin/env bash
# ============================================================
# Capiva Cloud — DEMO de Alta Disponibilidade & Failover.
#
# Prova, num cluster real (k3d = k3s em Docker), que:
#   1) a APLICAÇÃO sobrevive à queda de um WORKER (réplicas espalhadas + PDB);
#   2) o CONTROL PLANE sobrevive à queda de um SERVER (etcd embutido c/ quórum);
#   3) o BANCO (Postgres CNPG, HA) promove uma réplica quando o primário cai.
#
# Cluster dedicado "capiva-ha" (não toca no seu dev-cluster).
#
# Uso típico (2 terminais):
#   ./scripts/ha-failover-demo.sh up           # cria cluster HA + app
#   ./scripts/ha-failover-demo.sh db            # (opcional) Postgres HA via CNPG
#   ./scripts/ha-failover-demo.sh status        # nós + pods (onde cada um roda)
#   ./scripts/ha-failover-demo.sh probe         # [terminal 2] martela a app
#   ./scripts/ha-failover-demo.sh kill-worker   # derruba 1 worker → app de pé
#   ./scripts/ha-failover-demo.sh kill-server   # derruba 1 control plane → kubectl ok
#   ./scripts/ha-failover-demo.sh recover       # religa os nós parados
#   ./scripts/ha-failover-demo.sh down          # destrói o cluster
# ============================================================
set -euo pipefail

CLUSTER="capiva-ha"
CTX="k3d-${CLUSTER}"
APP_HOST="whoami.localtest.me"   # localtest.me resolve para 127.0.0.1
LB_PORT="8890"
SERVERS="${SERVERS:-3}"
AGENTS="${AGENTS:-2}"

k() { kubectl --context "${CTX}" "$@"; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "❌ '$1' não encontrado (veja https://k3d.io)."; exit 1; }; }
hr() { printf '%.0s─' {1..60}; echo; }

up() {
  need docker; need k3d; need kubectl
  if ! k3d cluster list | grep -q "^${CLUSTER}"; then
    echo "🚀 Criando cluster HA '${CLUSTER}': ${SERVERS} control planes + ${AGENTS} workers..."
    k3d cluster create "${CLUSTER}" --servers "${SERVERS}" --agents "${AGENTS}" \
      --port "${LB_PORT}:80@loadbalancer" --wait
  fi

  echo "📦 Implantando app de exemplo (traefik/whoami) — 3 réplicas espalhadas + PDB..."
  k apply -f - >/dev/null <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: whoami
  labels: { app: whoami }
spec:
  replicas: 3
  selector: { matchLabels: { app: whoami } }
  template:
    metadata: { labels: { app: whoami } }
    spec:
      # Espalha as réplicas entre nós: nenhuma perda total se 1 nó cair.
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: kubernetes.io/hostname
          whenUnsatisfiable: ScheduleAnyway
          labelSelector: { matchLabels: { app: whoami } }
      containers:
        - name: whoami
          image: traefik/whoami:latest
          ports: [{ containerPort: 80 }]
          readinessProbe: { httpGet: { path: /, port: 80 }, periodSeconds: 2 }
---
apiVersion: v1
kind: Service
metadata: { name: whoami }
spec:
  selector: { app: whoami }
  ports: [{ port: 80, targetPort: 80 }]
---
# PodDisruptionBudget: mantém ao menos 2 réplicas disponíveis durante distúrbios.
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata: { name: whoami }
spec:
  minAvailable: 2
  selector: { matchLabels: { app: whoami } }
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata: { name: whoami }
spec:
  rules:
    - host: ${APP_HOST}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend: { service: { name: whoami, port: { number: 80 } } }
EOF

  k rollout status deploy/whoami --timeout=120s
  hr
  echo "✅ Pronto. App em: http://${APP_HOST}:${LB_PORT}/  (Host: ${APP_HOST})"
  echo "   Rode em outro terminal:  $0 probe"
  status
}

db() {
  echo "🐘 Instalando operator CloudNativePG (Postgres HA)..."
  k apply --server-side -f https://raw.githubusercontent.com/cloudnative-pg/cloudnative-pg/release-1.24/releases/cnpg-1.24.1.yaml >/dev/null
  k -n cnpg-system rollout status deploy/cnpg-controller-manager --timeout=180s
  echo "🐘 Criando cluster Postgres HA (3 instâncias, 1 primário + 2 réplicas)..."
  k apply -f - >/dev/null <<EOF
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata: { name: pg-ha }
spec:
  instances: 3
  primaryUpdateStrategy: unsupervised
  storage: { size: 1Gi }
EOF
  echo "   Acompanhe:  kubectl --context ${CTX} get pods -l cnpg.io/cluster=pg-ha -o wide -w"
  echo "   O pod primário tem label cnpg.io/instanceRole=primary."
}

status() {
  hr; echo "🖥️  NÓS (onde control plane vs worker):"
  k get nodes -o wide
  hr; echo "📦 PODS (todos os namespaces, com NÓ e IP):"
  k get pods -A -o wide
  hr; echo "🔌 SERVICES (portas):"
  k get svc -A
  hr
}

pods() {
  echo "📦 Pods da app por nó:"
  k get pods -l app=whoami -o wide
  echo
  echo "🐘 Pods do banco por nó (se criado):"
  k get pods -l cnpg.io/cluster=pg-ha -o wide 2>/dev/null || echo "   (sem banco — rode '$0 db')"
}

probe() {
  echo "🔁 Martelando http://${APP_HOST}:${LB_PORT}/ (Ctrl+C p/ parar). Cada linha = qual pod respondeu."
  while true; do
    out=$(curl -s -m 2 -H "Host: ${APP_HOST}" "http://127.0.0.1:${LB_PORT}/" || true)
    ts=$(date +%H:%M:%S)
    if [ -z "$out" ]; then
      echo "[$ts] ❌ sem resposta"
    else
      host=$(echo "$out" | awk -F': ' '/^Hostname/{print $2}')
      echo "[$ts] ✅ 200  pod=${host}"
    fi
    sleep 1
  done
}

# Para um nó por papel (server=control plane, agent=worker), mantendo quórum.
stop_role() {
  local role="$1"  # server | agent
  local victim
  victim=$(k3d node list --no-headers | awk -v c="${CLUSTER}" -v r="-${role}-" '$1 ~ c && $1 ~ r {print $1}' | tail -n1)
  [ -n "$victim" ] || { echo "❌ Nenhum nó '${role}' encontrado."; exit 1; }
  echo "💥 Parando nó ${role}: ${victim}"
  k3d node stop "${victim}"
  echo "${victim}" >> "/tmp/${CLUSTER}.stopped"
  echo "   Aguarde alguns segundos e observe o 'probe' / 'kubectl get nodes'."
}

kill-worker() {
  stop_role agent
  hr; echo "⏳ Estado após queda do worker (a app deve continuar Running em outros nós):"
  sleep 5; k get pods -l app=whoami -o wide || true; k get nodes
}

kill-server() {
  stop_role server
  hr; echo "⏳ Validando que o CONTROL PLANE sobrevive (etcd com quórum):"
  sleep 8
  if k get nodes >/dev/null 2>&1; then
    echo "✅ kubectl respondeu — plano de controle ATIVO mesmo com 1 control plane fora."
    k get nodes
  else
    echo "⚠️  kubectl não respondeu. Com 3 servers há quórum; com menos, não há HA."
  fi
}

recover() {
  [ -f "/tmp/${CLUSTER}.stopped" ] || { echo "Nada para religar."; return; }
  while read -r n; do [ -n "$n" ] && { echo "▶️  Religando ${n}"; k3d node start "${n}" || true; }; done < "/tmp/${CLUSTER}.stopped"
  rm -f "/tmp/${CLUSTER}.stopped"
  sleep 5; k get nodes
}

down() {
  k3d cluster delete "${CLUSTER}"
  rm -f "/tmp/${CLUSTER}.stopped"
}

case "${1:-}" in
  up) up ;;
  db) db ;;
  status) status ;;
  pods) pods ;;
  probe) probe ;;
  kill-worker) kill-worker ;;
  kill-server) kill-server ;;
  recover) recover ;;
  down) down ;;
  *) echo "uso: $0 [up|db|status|pods|probe|kill-worker|kill-server|recover|down]"; exit 1 ;;
esac
