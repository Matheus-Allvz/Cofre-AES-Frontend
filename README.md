# Cofre de Senhas Corporativo — Frontend

Interface web (SPA estática, HTML/CSS/JS puro, sem build step) para o
[Cofre_AES](https://vault.matheus-alves.dev), consumindo a API REST já em
produção.

## Rodando localmente

Não precisa de instalação. Basta servir os arquivos estáticos:

```bash
python -m http.server 8888
```

e abrir `http://localhost:8888`. Também funciona abrindo `index.html`
diretamente no navegador, exceto por eventuais restrições de CORS/clipboard
dependendo do navegador — nesse caso, prefira um servidor estático simples.

## Segurança

A senha-mestra do cofre e as senhas dos segredos ficam só em memória
(variável JS), nunca em `localStorage`, cookie ou qualquer storage que
sobrevive ao fechar a aba. Recarregar a página encerra a sessão — isso é
intencional. Nenhuma senha é logada no console.

## Guardar o ID do cofre

A API não tem busca por nome nem listagem de cofres. O único jeito de
voltar a um cofre já criado é o `id` (UUID) que a criação devolveu — a
interface mostra e destaca esse id na hora da criação, com botão de
copiar.

## Deploy

`Dockerfile` + `docker-compose.yml` (nginx:alpine, porta 8096) e
`deploy.sh` + `.github/workflows/deploy.yml` para deploy automático via SSH
em push para `main`, no mesmo padrão do backend Cofre_AES.
