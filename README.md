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

## Estrutura

- `public/js/cripto.js`: KDF, HKDF, envelopes `v1`/`x1`, AAD, recovery key, fingerprint.
- `public/js/dom.js`: único ponto que cria DOM (sem `innerHTML`).
- `public/vendor/`: bibliotecas vendorizadas com SHA-256 registrado em `public/vendor/README.md`.
- `nginx.conf`: template do nginx com CSP estrita e Trusted Types.
- `public/js/telas/auditoria.js`: tela `#/auditoria` (owner/admin) com filtros e paginação por cursor.
