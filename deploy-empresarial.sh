#!/usr/bin/env bash
# Deploy de produção (Fase 9), rodado na VPS pelo workflow deploy-empresarial.yml a cada push na
# branch empresarial. Sem argumento implanta origin/empresarial; com um SHA (ou ref) implanta
# aquele commit, que é o rollback: deploy-empresarial.sh <sha>. Falha (exit ≠ 0) se o nginx
# não servir a página em 127.0.0.1:8097.
set -euo pipefail
cd "$(dirname "$0")"

alvo=${1:-origin/empresarial}
git fetch --prune origin
# Sempre na branch local empresarial (descarta mudanças locais, como reset --hard; .env e
# backups/ ficam, são ignorados pelo git).
git checkout -q -f -B empresarial "$alvo"
echo "deploy: $(git rev-parse --short HEAD) $(git log -1 --format=%s)"
docker compose build
docker compose up -d --wait
curl -fsS --retry 10 --retry-delay 2 --retry-all-errors -o /dev/null http://127.0.0.1:8097/
echo "front ok"
