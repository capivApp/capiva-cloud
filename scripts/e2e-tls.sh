#!/usr/bin/env bash
# ============================================================
# Capiva Cloud — E2E for WP3.1-B (flexible TLS).
# Drives the API: register a TLS cert, create 3 apps (uploaded / lets_encrypt /
# none) each with a domain, deploy, and verify the resulting Ingress/Secret.
# ============================================================
set -euo pipefail
API="${API:-http://localhost:3000/api}"
PATH="$HOME/.local/bin:$PATH"
KUBE_API=$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}' | sed 's#0.0.0.0#127.0.0.1#')
TOKEN=$(kubectl create token capiva -n default --duration=8760h)
STAMP=$(date +%s)

j() { echo "$1" | bun -e 'const d=await Bun.stdin.json(); process.stdout.write(String(eval(process.argv[1])))' "$2"; }

REG=$(curl -s -X POST "$API/auth/register" -H 'Content-Type: application/json' -d "{\"email\":\"tls-$STAMP@capiva.dev\",\"name\":\"TLS\",\"password\":\"capiva12345\",\"organizationName\":\"TLS Org\"}")
ACCESS=$(j "$REG" 'd.accessToken')
auth=(-H "Authorization: Bearer $ACCESS")
ORG_ID=$(j "$(curl -s "${auth[@]}" "$API/organizations")" 'd[0].id')
org=(-H "x-organization-id: $ORG_ID")
CLU_ID=$(j "$(curl -s -X POST "$API/clusters" "${auth[@]}" "${org[@]}" -H 'Content-Type: application/json' -d "{\"name\":\"k3d\",\"apiUrl\":\"$KUBE_API\",\"token\":\"$TOKEN\"}")" 'd.id')
ENVR=$(curl -s -X POST "$API/environments" "${auth[@]}" "${org[@]}" -H 'Content-Type: application/json' -d "{\"name\":\"dev\",\"clusterId\":\"$CLU_ID\"}")
ENV_ID=$(j "$ENVR" 'd.id'); NS=$(j "$ENVR" 'd.namespace')
PROJ_ID=$(j "$(curl -s -X POST "$API/projects" "${auth[@]}" "${org[@]}" -H 'Content-Type: application/json' -d '{"name":"TLS"}')" 'd.id')
echo "org=$ORG_ID ns=$NS"

# Self-signed cert for the 'uploaded' case.
TMP=$(mktemp -d)
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$TMP/k.pem" -out "$TMP/c.pem" -days 2 -subj "/CN=uploaded.capiva.test" >/dev/null 2>&1
CERT_JSON=$(bun -e 'const f=process.argv; console.log(JSON.stringify({name:"e2e",cert:await Bun.file(f[1]).text(),key:await Bun.file(f[2]).text()}))' "$TMP/c.pem" "$TMP/k.pem")
CERT_ID=$(j "$(curl -s -X POST "$API/tls-certificates" "${auth[@]}" "${org[@]}" -H 'Content-Type: application/json' -d "$CERT_JSON")" 'd.id')
echo "cert=$CERT_ID"

mkapp() { # name tlsMode [certId]
  local extra=""; [ -n "${3:-}" ] && extra=",\"tlsCertificateId\":\"$3\""
  local id
  id=$(j "$(curl -s -X POST "$API/applications" "${auth[@]}" "${org[@]}" -H 'Content-Type: application/json' -d "{\"projectId\":\"$PROJ_ID\",\"environmentId\":\"$ENV_ID\",\"name\":\"$1\",\"source\":\"DOCKER_IMAGE\",\"sourceConfig\":{\"image\":\"nginx:alpine\",\"domain\":\"$1.capiva.test\"},\"port\":80,\"tlsMode\":\"$2\"$extra}")" 'd.id')
  curl -s -X POST "$API/applications/$id/deploy" "${auth[@]}" "${org[@]}" >/dev/null
}

A_UP="tls-up-$STAMP"; A_LE="tls-le-$STAMP"; A_NO="tls-no-$STAMP"
mkapp "$A_UP" UPLOADED "$CERT_ID"
mkapp "$A_LE" LETS_ENCRYPT
mkapp "$A_NO" NONE

for i in $(seq 1 30); do kubectl -n "$NS" get ingress "$A_NO" >/dev/null 2>&1 && break; sleep 1; done
sleep 2

echo "── results ───────────────────────────────────"
SECRET=$(kubectl -n "$NS" get secret "$A_UP-tls" -o jsonpath='{.type}' 2>/dev/null || echo MISSING)
UP_TLS=$(kubectl -n "$NS" get ingress "$A_UP" -o jsonpath='{.spec.tls[0].secretName}' 2>/dev/null || echo "")
LE_ANN=$(kubectl -n "$NS" get ingress "$A_LE" -o jsonpath='{.metadata.annotations.cert-manager\.io/cluster-issuer}' 2>/dev/null || echo "")
NO_TLS=$(kubectl -n "$NS" get ingress "$A_NO" -o jsonpath='{.spec.tls}' 2>/dev/null || echo "")
echo "UPLOADED:  secret type=$SECRET  ingress.tls.secretName=$UP_TLS"
echo "LETS_ENCR: cert-manager issuer annotation=$LE_ANN"
echo "NONE:      ingress.spec.tls='$NO_TLS' (expected empty)"
echo "──────────────────────────────────────────────"

[ "$SECRET" = "kubernetes.io/tls" ] && [ "$UP_TLS" = "$A_UP-tls" ] && [ -n "$LE_ANN" ] && [ -z "$NO_TLS" ] \
  && echo "✅ TLS E2E PASS — uploaded Secret+tls, LE annotation, none has no tls." \
  || { echo "❌ TLS E2E FAIL"; exit 1; }
rm -rf "$TMP"
