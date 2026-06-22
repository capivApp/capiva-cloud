#!/usr/bin/env bash
# ============================================================
# Capiva Cloud — end-to-end smoke test against a REAL k3d cluster.
#
# Drives the platform exactly like a user would (HTTP API only):
#   register → org → register cluster → environment → project →
#   create app (with a persistent volume) → deploy → verify in k8s.
#
# Proves the platform applies real Kubernetes resources (Deployment,
# Service, PVC + volume mount) without any hand-written YAML.
#
# Requires: backend running on $API, kubectl pointing at the k3d cluster.
# Usage: ./scripts/e2e-smoke.sh
# ============================================================
set -euo pipefail
API="${API:-http://localhost:3000/api}"
PATH="$HOME/.local/bin:$PATH"

KUBE_API=$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}' | sed 's#0.0.0.0#127.0.0.1#')
TOKEN=$(kubectl create token capiva -n default --duration=8760h)
STAMP=$(date +%s)
EMAIL="e2e-${STAMP}@capiva.dev"
APP="smoke-${STAMP}"

j() { echo "$1" | bun -e 'const d=await Bun.stdin.json(); process.stdout.write(String(eval(process.argv[1])))' "$2"; }

echo "▶ register user + org"
REG=$(curl -s -X POST "$API/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"name\":\"E2E Tester\",\"password\":\"capiva12345\",\"organizationName\":\"E2E Org\"}")
ACCESS=$(j "$REG" 'd.accessToken')
[ -n "$ACCESS" ] && [ "$ACCESS" != "undefined" ] || { echo "❌ register failed: $REG"; exit 1; }

auth=(-H "Authorization: Bearer $ACCESS")
ORG=$(curl -s "${auth[@]}" "$API/organizations")
ORG_ID=$(j "$ORG" 'd[0].id')
org=(-H "x-organization-id: $ORG_ID")
echo "  org=$ORG_ID"

echo "▶ register k3d cluster"
CLU=$(curl -s -X POST "$API/clusters" "${auth[@]}" "${org[@]}" -H 'Content-Type: application/json' \
  -d "{\"name\":\"k3d-capiva\",\"apiUrl\":\"$KUBE_API\",\"token\":\"$TOKEN\"}")
CLU_ID=$(j "$CLU" 'd.id'); CLU_STATUS=$(j "$CLU" 'd.status')
echo "  cluster=$CLU_ID status=$CLU_STATUS"
[ "$CLU_STATUS" = "connected" ] || echo "  ⚠ cluster not 'connected' — check API reachability"

echo "▶ environment + project"
ENVR=$(curl -s -X POST "$API/environments" "${auth[@]}" "${org[@]}" -H 'Content-Type: application/json' \
  -d "{\"name\":\"dev\",\"kind\":\"DEVELOPMENT\",\"clusterId\":\"$CLU_ID\"}")
ENV_ID=$(j "$ENVR" 'd.id'); NS=$(j "$ENVR" 'd.namespace')
PROJ=$(curl -s -X POST "$API/projects" "${auth[@]}" "${org[@]}" -H 'Content-Type: application/json' -d "{\"name\":\"E2E\"}")
PROJ_ID=$(j "$PROJ" 'd.id')
echo "  env=$ENV_ID ns=$NS project=$PROJ_ID"

echo "▶ create app '$APP' (nginx) with a persistent volume mounted at /usr/share/nginx/html"
CREATE=$(curl -s -X POST "$API/applications" "${auth[@]}" "${org[@]}" -H 'Content-Type: application/json' -d "{
  \"projectId\":\"$PROJ_ID\",\"environmentId\":\"$ENV_ID\",\"name\":\"$APP\",
  \"source\":\"DOCKER_IMAGE\",\"sourceConfig\":{\"image\":\"nginx:alpine\"},
  \"port\":80,\"volumes\":[{\"name\":\"html\",\"mountPath\":\"/usr/share/nginx/html\",\"sizeGi\":1,\"accessMode\":\"RWO\"}]
}")
APP_ID=$(j "$CREATE" 'd.id')
[ -n "$APP_ID" ] && [ "$APP_ID" != "undefined" ] || { echo "❌ create app failed: $CREATE"; exit 1; }
echo "  app=$APP_ID"

echo "▶ deploy"
curl -s -X POST "$API/applications/$APP_ID/deploy" "${auth[@]}" "${org[@]}" >/dev/null

echo "▶ waiting for Kubernetes resources in ns/$NS ..."
for i in $(seq 1 40); do
  kubectl -n "$NS" get deployment "$APP" >/dev/null 2>&1 && break; sleep 2
done
# local-path binds on first consumer (WaitForFirstConsumer); give pods time to schedule.
for i in $(seq 1 45); do
  [ "$(kubectl -n "$NS" get pvc "${APP}-html" -o jsonpath='{.status.phase}' 2>/dev/null)" = "Bound" ] && break; sleep 2
done

echo "── kubectl view ──────────────────────────────"
kubectl -n "$NS" get deployment,svc,pvc -l app.kubernetes.io/name="$APP" 2>/dev/null || kubectl -n "$NS" get deployment,svc,pvc
echo "──────────────────────────────────────────────"

PVC=$(kubectl -n "$NS" get pvc "${APP}-html" -o jsonpath='{.status.phase}' 2>/dev/null || echo "MISSING")
MOUNT=$(kubectl -n "$NS" get deployment "$APP" -o jsonpath='{.spec.template.spec.containers[0].volumeMounts[?(@.name=="html")].mountPath}' 2>/dev/null || echo "")
echo "PVC ${APP}-html phase: $PVC"
echo "volumeMount path: ${MOUNT:-<none>}"

[ "$PVC" = "Bound" ] && [ "$MOUNT" = "/usr/share/nginx/html" ] \
  && echo "✅ E2E PASS — platform provisioned PVC + mounted it via the API (no YAML)." \
  || { echo "❌ E2E FAIL"; exit 1; }
