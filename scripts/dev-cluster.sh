#!/usr/bin/env bash
# ============================================================
# Capiva Cloud — cluster Kubernetes LOCAL para desenvolvimento.
#
# Cria um cluster real (k3d = k3s em Docker) e imprime os campos
# (API URL + token) para registrar na UI em Configurações → Clusters
# (sem YAML). Com isso a plataforma deixa de operar em "dry-run" e
# passa a APLICAR recursos de verdade no cluster.
#
# Uso:
#   ./scripts/dev-cluster.sh up      # cria o cluster + addons + token
#   ./scripts/dev-cluster.sh down    # remove o cluster
# Requisitos: docker + k3d (https://k3d.io).  Traefik já vem no k3s.
# ============================================================
set -euo pipefail
CLUSTER="capiva"
# Nº de control planes (servers) e workers (agents). Default HA: 3 servers (etcd
# embutido com quórum → derrubar 1 control plane NÃO derruba o plano de controle).
# Sobrescreva para um cluster leve: SERVERS=1 AGENTS=1 ./scripts/dev-cluster.sh up
SERVERS="${SERVERS:-3}"
AGENTS="${AGENTS:-2}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "❌ '$1' não encontrado. Instale antes (veja https://k3d.io)."; exit 1; }; }

up() {
  need docker; need k3d; need kubectl
  if ! k3d cluster list | grep -q "^${CLUSTER}"; then
    echo "🚀 Criando cluster k3d '${CLUSTER}' — ${SERVERS} control plane(s) + ${AGENTS} worker(s)..."
    # k3d sobe o serverlb (load balancer) na frente de TODOS os servers: se um
    # control plane cair, o kubectl continua funcionando pelos demais.
    k3d cluster create "${CLUSTER}" --servers "${SERVERS}" --agents "${AGENTS}" \
      --port "8880:80@loadbalancer" --port "8843:443@loadbalancer" --wait
  fi

  echo "🔐 Criando ServiceAccount 'capiva' com permissões de admin..."
  kubectl create serviceaccount capiva -n default --dry-run=client -o yaml | kubectl apply -f -
  kubectl create clusterrolebinding capiva-admin --clusterrole=cluster-admin \
    --serviceaccount=default:capiva --dry-run=client -o yaml | kubectl apply -f -

  echo "🧩 Instalando addons recomendados (cert-manager, metrics-server, Longhorn)..."
  # TLS automático (Let's Encrypt) por domínio.
  kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml >/dev/null 2>&1 || true
  # Monitoring: uso de CPU/memória por nó e por pod (metrics.k8s.io).
  kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml >/dev/null 2>&1 || true
  kubectl patch deployment metrics-server -n kube-system --type=json \
    -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]' >/dev/null 2>&1 || true
  # Storage: volumes persistentes com RWX (pasta compartilhada entre pods).
  kubectl apply -f https://raw.githubusercontent.com/longhorn/longhorn/v1.7.2/deploy/longhorn.yaml >/dev/null 2>&1 || true
  echo "   (Longhorn pode levar 1-2 min para ficar Ready: kubectl -n longhorn-system get pods)"

  TOKEN=$(kubectl create token capiva -n default --duration=8760h)
  API=$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}')

  cat <<EOF

✅ Cluster pronto. Registre na UI (Configurações → Clusters), SEM YAML:

   Nome:                capiva-local
   Endereço (API URL):  ${API}
   Token de acesso:     ${TOKEN}
   Certificado CA:      (deixe vazio — usa insecure-skip-tls-verify em dev)

Depois disso, criar uma aplicação/banco APLICA recursos reais no cluster.
Veja-os com:  kubectl get all -A
EOF
}

down() {
  k3d cluster delete "${CLUSTER}"
}

case "${1:-up}" in
  up) up ;;
  down) down ;;
  *) echo "uso: $0 [up|down]"; exit 1 ;;
esac
