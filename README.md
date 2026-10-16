# Cofre AES Empresarial — Frontend

SPA estática (HTML/CSS/JS em módulos ES, sem build, sem dependências npm) do cofre de senhas
zero-knowledge: toda cifragem/decifragem acontece no browser (`public/js/cripto.js`).
Plano e arquitetura: `docs/plano/` do repositório da API (`Matheus-Allvz/Cofre-AES`, branch `empresarial`).

## Rodar

```bash
docker compose up -d --build        # http://127.0.0.1:8097 (nginx com os headers de segurança)
```

`/api/*` é repassado a `API_UPSTREAM` (padrão `http://host.docker.internal:8098`) só em desenvolvimento;
em produção o Caddy roteia `/api/*` antes. Com a API fora do ar a página mostra o aviso.
`/?diag=1` mostra um botão que mede o tempo do Argon2id.

## Testar (Node >= 22)

```bash
node --test test/unit/
python test/vetores/gerar_vetores.py --verificar   # vetores cruzados gerados pelo Python (ver test/vetores/README.md)
```

## Produção (empresarial)

- Domínio: `https://secrets.matheus-alves.dev` (Cloudflare → `<IP_DA_VPS>:443` sslh → Caddy
  `:4443`). O Caddy manda `/api/*` para a API em `127.0.0.1:8098` e o resto para este nginx em
  `127.0.0.1:8097`; por isso `API_UPSTREAM` é irrelevante em produção (só serve ao dev local).
- Diretório na VPS: `/home/deploy/cofre-empresa-front` (clone da `empresarial`), projeto compose
  `cofre-empresa-front`, container `cofre-empresa-front` (`mem_limit` 64m, healthcheck).
- **Deploy:** automático. Push (merge) na `empresarial` → workflow `Deploy (empresarial)` roda os
  testes do `ci.yml` e, se passarem, o job `deploy` (Environment `producao-empresarial`, liberado
  só para a branch `empresarial`, com os secrets `EMP_DEPLOY_SSH_HOST/USER/KEY`) entra por SSH com
  uma chave **exclusiva** deste deploy, verificando a impressão digital do host. No
  `~/.ssh/authorized_keys` do `deploy` essa chave tem
  `command="/home/deploy/cofre-empresa-front/deploy-empresarial.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty`:
  não dá shell e só roda o script, que recebe o SHA do push em `$SSH_ORIGINAL_COMMAND`. O script
  aceita só `empresarial` ou um SHA hex de 7 a 40 caracteres que esteja na história de
  `origin/empresarial` (qualquer outra coisa: exit 2, sem efeito), faz
  `git checkout -f -B empresarial <ref>`, `docker compose build`, `up -d --wait` e falha se a
  página não responder em `127.0.0.1:8097`. As chaves e os secrets do deploy acadêmico (`main`) não são usados.
  Manual (chave pessoal): `ssh deploy@<IP_DA_VPS> /home/deploy/cofre-empresa-front/deploy-empresarial.sh empresarial`.
- **Rollback:** `ssh deploy@<IP_DA_VPS> /home/deploy/cofre-empresa-front/deploy-empresarial.sh <sha>` (um commit
  da história da `empresarial`; põe a branch local `empresarial` nele e faz o mesmo build/subida).
  Os headers de segurança (CSP, HSTS...) vêm do `nginx.conf` deste repositório. O próximo push
  na `empresarial` volta a implantar a ponta.
- API, backup e organização inicial: README do repositório da API, seção "Produção (empresarial)".

## Estrutura

- `public/js/cripto.js`: KDF, HKDF, envelopes `v1`/`x1`, AAD, recovery key, fingerprint.
- `public/js/dom.js`: único ponto que cria DOM (sem `innerHTML`).
- `public/vendor/`: bibliotecas vendorizadas com SHA-256 registrado em `public/vendor/README.md`.
- `nginx.conf`: template do nginx com CSP estrita e Trusted Types.
- `public/js/telas/auditoria.js`: tela `#/auditoria` (owner/admin) com filtros e paginação por cursor.
