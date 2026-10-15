#!/usr/bin/env bash
# Sobe o backend limpo (projeto compose cofre-e2e), cria a org e grava .e2e.env com
# E2E_API e E2E_CONVITE_OWNER. Uso: bash scripts/e2e-backend.sh <caminho do repo do backend>
# Derrubar: docker compose -p cofre-e2e down -v
set -euo pipefail

BE=$(cd "${1:?uso: bash scripts/e2e-backend.sh <caminho do backend>}" && pwd)
RAIZ=$(cd "$(dirname "$0")/.." && pwd)
ENV_BE="$RAIZ/.e2e-backend.env" # segredos descartáveis desta execução (fora do git)

aleatorio() { node -e 'process.stdout.write(require("crypto").randomBytes(+process.argv[1]).toString(process.argv[2]))' "$1" "$2"; }
cat > "$ENV_BE" <<FIM
POSTGRES_PASSWORD=$(aleatorio 24 hex)
APP_DB_PASSWORD=$(aleatorio 24 hex)
COFRE_SEGREDO=$(aleatorio 32 base64)
COOKIE_SECURE=true
FIM

dc() { docker compose -p cofre-e2e --project-directory "$BE" -f "$BE/docker-compose.yml" --env-file "$ENV_BE" "$@"; }
dc down -v --remove-orphans >/dev/null 2>&1 || true
dc up -d --build --wait

EMAIL=owner@e2e.invalid
saida=$(dc run --rm --no-deps -T api python -m app.cli criar-org --nome "Org E2E" --email "$EMAIL")
token=$(printf '%s' "$saida" | node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>process.stdout.write(JSON.parse(s).token))')

cat > "$RAIZ/.e2e.env" <<FIM
E2E_API=http://127.0.0.1:8098
E2E_CONVITE_OWNER=$token
E2E_EMAIL_OWNER=$EMAIL
FIM
echo "backend E2E em http://127.0.0.1:8098; variáveis em .e2e.env"
