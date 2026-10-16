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
  jobs do `ci.yml` e, se passarem, executa na VPS `deploy-empresarial.sh`
  (`git reset --hard origin/empresarial`, `docker compose build`, `up -d --wait`, falha se a
  página não responder em `127.0.0.1:8097`). Os headers de segurança (CSP, HSTS...) vêm do
  `nginx.conf` deste repositório.
- **Rollback:** `ssh deploy@<IP_DA_VPS> /home/deploy/cofre-empresa-front/deploy-empresarial.sh <sha>`
  (faz `git reset --hard <sha>` e o mesmo build/subida); o próximo push na `empresarial` volta à ponta.
- API, backup e organização inicial: README do repositório da API, seção "Produção (empresarial)".

## Estrutura

- `public/js/cripto.js`: KDF, HKDF, envelopes `v1`/`x1`, AAD, recovery key, fingerprint.
- `public/js/dom.js`: único ponto que cria DOM (sem `innerHTML`).
- `public/vendor/`: bibliotecas vendorizadas com SHA-256 registrado em `public/vendor/README.md`.
- `nginx.conf`: template do nginx com CSP estrita e Trusted Types.
- `public/js/telas/auditoria.js`: tela `#/auditoria` (owner/admin) com filtros e paginação por cursor.
