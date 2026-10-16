# Design system do Cofre AES Empresarial (Fase 10)

Fonte única: `public/css/style.css`, carregado pelo `<link>` que já está no `index.html`.
Vitrine visual: `docs/design-system.html`. Abra o arquivo direto no navegador; ele usa o mesmo CSS.
A pasta `docs/` não entra na imagem: o `Dockerfile` copia só `public/` e o `.dockerignore` exclui `docs` e `*.md`.

## 1. Princípios

1. **Sóbrio e corporativo.** Grafite e dourado, sem gradiente, sem ilustração. O dourado marca a ação principal e o estado atual da navegação. Não é decoração.
2. **Legível antes de bonito.** Texto em 16px, linha 1.5, rótulo sempre acima do campo. Todo par de cores passa no WCAG AA (§4).
3. **Estados sensíveis à vista.** Segredo revelado, kit de emergência, rotação pendente e ações irreversíveis ganham borda de atenção ou perigo, e o texto sempre diz o que vai acontecer. A cor nunca é o único sinal: há também borda, tracejado, peso ou rótulo.
4. **Uma ação primária por contexto.** Num card ou num formulário só um botão pode ser `.btn-primary`. A ação destrutiva fica separada das outras e no fim.
5. **Componente sem margem externa.** Quem espaça é o pai (`.container`, `.card`, `.stack`, `.form`), o que deixa as telas montadas com `el()` previsíveis.
6. **Dentro da CSP.** Nada de `style=""`, `<style>`, fonte web, SVG externo ou biblioteca. Os ícones são Unicode ou CSS (o losango da marca, o spinner e o ▾ do menu são CSS).

## 2. Tokens

O tema escuro vem em `:root` e é a base. O claro entra por `@media (prefers-color-scheme: light)`. `color-scheme` acompanha o tema, então calendário, checkbox e barra de rolagem nativos também mudam.

### Cores semânticas

| Token | Escuro | Claro | Uso |
|---|---|---|---|
| `--bg` | `#0f1419` | `#f5f6f8` | fundo da página |
| `--surface` | `#1a2129` | `#ffffff` | card, topbar, diálogo |
| `--surface-sunken` | `#10151b` | `#f0f2f5` | input, bloco de código, cabeçalho de tabela |
| `--surface-hover` | `#222b35` | `#eaedf1` | hover de linha, link de navegação, botão fantasma |
| `--border` | `#2b3540` | `#d8dde3` | divisórias e contorno de card (decorativo) |
| `--border-control` | `#6b7a89` | `#7a8591` | contorno de input e de botão secundário (≥ 3:1) |
| `--text` / `--text-muted` | `#e6edf3` / `#9aa6b2` | `#1b232c` / `#56606b` | texto principal e secundário |
| `--accent` / `--accent-hover` | `#c9a227` / `#e0b830` | `#c9a227` / `#b8931f` | fundo do botão primário, marca, barra da aba ativa |
| `--accent-border` | `#c9a227` | `#8f6d00` | contorno do primário e do card de destaque (no claro o dourado puro tem só 2.42:1) |
| `--on-accent` | `#1a1503` | `#1a1503` | texto sobre o dourado |
| `--link` / `--focus` | `#e0b830` | `#7a5c00` | links e anel de foco |
| `--danger-solid` (+`-hover`) / `--on-solid` | `#c0352f` / `#fff` | `#b42318` / `#fff` | botão de perigo |
| `--danger-text` / `--danger-bg` / `--danger-border` | `#ff9b93` / `#3a1f1d` / `#e5534b` | `#a1131b` / `#fdecec` / `#d1382f` | erro |
| `--success-*` | `#56d364` / `#15301d` / `#3fb950` | `#17692e` / `#e7f5ea` / `#2f9e4a` | sucesso |
| `--warning-*` | `#f0d67a` / `#3a2f14` / `#c9a227` | `#6b4c00` / `#fdf3d6` / `#b8931f` | atenção, segredo revelado, kit |
| `--info-*` | `#79b8ff` / `#142438` / `#388bfd` | `#0b5394` / `#e8f1fb` / `#3a7bd5` | informação |
| `--shadow-1` / `--shadow-2` / `--backdrop` | escuras | suaves | elevação de card / diálogo e menu / fundo do modal |

Nenhuma cor literal fora da seção de tokens. Se surgir uma necessidade nova, crie um token.

### Tipografia

Pilha do sistema: `--font-sans` (system-ui, Segoe UI, Roboto…) e `--font-mono` (ui-monospace, Cascadia Mono, Consolas…).

| Token | Tamanho | Uso |
|---|---|---|
| `--fs-xs` | 12px | badge |
| `--fs-sm` | 14px | rótulo, meta, ajuda, status, tabela |
| `--fs-md` | 16px | corpo, input |
| `--fs-lg` | 18px | h3, fingerprint, kit, marca |
| `--fs-xl` | 22px | h2, título de card/diálogo, h1 no celular |
| `--fs-2xl` | 28px | h1 |

Pesos: 400 (corpo), 600 (rótulo, botão, título de item), 700 (h1, marca, título de alerta). `--lh` 1.5 e `--lh-tight` 1.25.

### Espaço, raio, tamanhos

- Espaço (base 4px): `--space-1` 4 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 24 · `-6` 32 · `-7` 48.
- Raio: `--radius-sm` 4 (código inline) · `--radius` 8 (controle, lista, alerta) · `--radius-lg` 12 (card, diálogo) · `--radius-full` (badge).
- Controles: `--control-h` 44px (padrão), `--control-h-sm` 40px (mínimo de alvo), `--control-h-lg` 48px.
- Layout: `--container` 60rem (960px) e `--container-narrow` 28rem (formulários e telas de entrada).

### Elevação e movimento

- `--shadow-1` nos cards, `--shadow-2` em diálogo e menu. No escuro a elevação vem mais da superfície clara que da sombra.
- `--dur-fast` 120ms (hover), `--dur` 200ms (mudança de estado), `--ease` desacelerado. Só cor, borda e sombra animam, nada se desloca. Com `prefers-reduced-motion: reduce`, transições e animações caem para 0,01ms e o spinner vira um anel parado. O texto do status ("Derivando chave…") continua dizendo o que está acontecendo.

## 3. Componentes

Notação: `elemento.classe`, como as telas devem montar com `el()`.

### 3.1 App shell

```
header.topbar
  div.topbar-inner
    a.brand[href=#/cofre]  "Cofre AES" span.brand-sub "Empresarial"
    nav.nav[aria-label=Principal]
      a.nav-link[href=#/cofre][aria-current=page] "Cofre"
      a.nav-link "Pessoas" · a.nav-link "Auditoria"   (só owner/admin)
      a.nav-link "Conta"
    div.topbar-actions
      span.topbar-user "Nome" span.badge.badge-accent "owner"
      button.btn.btn-ghost.btn-sm "Bloquear"
main.container#app            (+ .container-narrow em login/convite/recuperar)
```

- A aba ativa usa `aria-current="page"`: texto em `--text` e barra dourada de 2px embaixo, sem depender só da cor.
- Deslogado (login, convite, recuperar): topbar só com `.brand`, sem nav nem ações.
- Abaixo de 40rem a nav vai para uma segunda linha e quebra se precisar. Testado a 360px.
- Cabeçalho de página: `div.page-header > (div > h1 + p.page-subtitle) + div.page-actions`.
- Voltar: `a.back-link "← Minha conta"`. Com a nav na topbar, os links "Minha conta · Pessoas" do topo das telas deixam de ser necessários.
- Em `.container`, `.card`, `.stack` e `.dialog` os filhos diretos não têm margem própria; o pai aplica 16px (container, stack) ou 12px (card, dialog, `.stack-sm`).

### 3.2 Botão

`button.btn.btn-{variante}[.btn-{tamanho}]`, sempre com `type` explícito.

| Variante | Quando |
|---|---|
| `.btn-primary` | a ação principal do contexto (Entrar, Salvar, Novo item, Confirmar rotação) |
| `.btn-secondary` | ações comuns (Abrir, Copiar, Revelar, Membros, Baixar kit) |
| `.btn-ghost` | ações de baixo peso (Cancelar, Fechar, Ocultar, Bloquear) |
| `.btn-danger` | confirmação destrutiva, de preferência dentro de diálogo |
| `.btn-danger-outline` | gatilho destrutivo em lista ou card (Excluir, Remover, Apagar definitivo), que leva a uma confirmação |

- Tamanhos: `.btn-sm` 40px (listas e barras de ação), padrão 44px, `.btn-lg` 48px. `.btn-block` ocupa a largura toda. `.btn-icon` é um quadrado de 40px e exige `aria-label`.
- Estados: hover; `:focus-visible` com anel de 2px `--focus`; `disabled` com opacidade 0,5 e `not-allowed`; carregando com `aria-busy="true"`, que põe um spinner antes do texto. Junto com o `aria-busy`, mantenha `disabled` e troque o texto ("Entrando…").
- **`button` sem classe** recebe o visual de `.btn .btn-secondary` como rede de proteção. Cobre, por exemplo, o "Cancelar" do novo item. Mesmo assim, toda tela migrada deve declarar a classe.
- **Hierarquia numa barra de ações** (`div.action-bar`): primária primeiro, depois as secundárias, e a destrutiva por último com `.push-end`, que a empurra para a direita. Exemplo da coleção:

```
div.action-bar
  btn-primary  btn-sm "Novo item"
  btn-secondary btn-sm "Membros"
  details.menu > summary.btn.btn-ghost.btn-sm "Mais ações"
                 ul.menu-list > li > button.btn.btn-ghost.btn-sm "Lixeira" / "Renomear"
  btn-danger-outline btn-sm.push-end "Excluir coleção"
```

`details.menu` é nativo (teclado e Esc via `<details>`) e não precisa de JS para abrir. Use quando houver mais de três ações secundárias.

### 3.3 Campo

```
label.field
  "Rótulo"
  input | select | textarea      [aria-invalid=true] em erro, aria-describedby → ajuda/erro
  span.field-help#id "Mínimo de 12 caracteres."
  span.field-error#id[role=alert] "A confirmação não confere."   (vazio = oculto)
```

- O rótulo **fica sempre em cima do input** (`.field` é flex em coluna). O `.form label` antigo também empilha. Inputs, selects e textareas têm estilo global com 100% de largura e 44px, mesmo fora de `.form`.
- Placeholder não substitui rótulo. Campo sem rótulo visível (a busca) usa `aria-label`.
- Erro: borda `--danger-border` com `aria-invalid="true"` e uma mensagem em `.field-error`, nunca só a cor.
- `readonly` ganha borda tracejada (valor revelado, só leitura). `disabled` fica com opacidade 0,6.
- **Senha:** `div.input-group > input[type=password] + button.btn.btn-secondary.btn-sm "Mostrar"`. Use `aria-pressed` no botão e troque o texto para "Ocultar". O gerador entra numa `div.action-bar` logo abaixo do campo.
- Checkbox: `label.checkbox > input[type=checkbox] + "texto"`, alvo de 40px, `accent-color` dourado.

### 3.4 Formulário

`form.form` é uma coluna com gap de 16px e no máximo 28rem (`.form-wide` tira o limite). Os botões vão em `div.form-actions`, com o submit primário primeiro e "Cancelar" `.btn-ghost` depois. Os filtros da auditoria usam `div.form-grid`, uma grade responsiva de colunas de 12rem. Para agrupar campos, `fieldset.fieldset > legend`. O status do envio vai no fim (§3.8).

### 3.5 Card / painel

```
section.card[.card-danger | .card-accent]
  div.card-header > (div > h2.card-title + p.card-subtitle) + div.card-actions
  …conteúdo
```

`.card-danger` serve para zonas perigosas (Desativar MFA). `.card-accent` serve para o painel do item aberto ou um destaque ("Senhas a trocar"). O padding cai para 16px no celular.

### 3.6 Lista

```
ul.list[.list-divided]
  li.list-item[.is-selected | aria-current=true | .list-item-error]
    div.list-item-main
      div.list-item-info > span.list-item-title + span.list-item-meta (+ span.badges)
      div.list-item-actions > botões .btn-sm
```

- Itens do cofre e membros usam `.list`, com cada item numa caixa. Sessões e "Meus acessos" usam `.list-divided`, linhas separadas por divisória.
- Item aberto no painel: `.is-selected`, com borda e filete dourados. Item que não decifra: `.list-item-error` com texto explícito ("Item adulterado…").
- Os títulos quebram em qualquer ponto (`overflow-wrap: anywhere`), então não há rolagem horizontal com e-mail ou URL longos.

### 3.7 Tabela

`div.table-wrap[tabindex=0][role=region][aria-label="Eventos de auditoria"] > table.table`. Só o wrapper rola na horizontal, a página não. O `tabindex` deixa rolar pelo teclado. Cabeçalho em `--surface-sunken` sem quebra de linha. `td.num` (id) fica alinhado à direita com números tabulares, e `td.nowrap` (data) não quebra. O resultado de cada linha vai num badge (`ok` → `.badge-success`, falha → `.badge-danger`).

### 3.8 Badge, alerta, status

**Badge** `span.badge[.badge-{tom}]`, mapeado assim:

| Dado | Valor → classe |
|---|---|
| Papel | `owner` → `.badge-accent` · `admin` → `.badge-info` · `member` → `.badge` (neutro) |
| Permissão | `gerenciar` → `.badge-accent` · `editar` → `.badge-info` · `ver` → `.badge` · `ver_sem_revelar` → `.badge-warning` |
| Estado da pessoa | `ativo` → `.badge-success` · `aceito` (aguarda fingerprint) → `.badge-warning` · `suspenso` → `.badge-danger` |
| Evento | `ok` → `.badge-success` · falha → `.badge-danger` |

O texto do badge é sempre o valor legível ("ver sem revelar", "aguardando confirmação"). `.badge-warning` usa contorno tracejado, um sinal além da cor. Para agrupar: `span.badges`.

**Alerta** `div.alert.alert-{success|danger|warning|info}`, com `strong.alert-title` opcional. É um bloco persistente com filete de 4px à esquerda. Use para o kit que aparece uma vez, a política que exige MFA, a rotação pendente e o link de convite. Avisos que o usuário precisa ver na hora levam `role="alert"`. Os informativos ficam sem role.

**Status** `p.status[role=status]`, a região viva de cada formulário ou ação, que a tela atualiza trocando a classe:

| Situação | Classe |
|---|---|
| neutro ou dica | `status` |
| em andamento ("Derivando chave…", "Abrindo o cofre…") | `status status-busy` (spinner) |
| sucesso ("Copiado. O clipboard será limpo em 30 s.") | `status status-success` |
| erro | `status status-danger` (caixa compacta) |

`.status:empty` e `.error-msg:empty` ficam ocultos, para que o elemento vazio não apareça como barra vermelha.

### 3.9 Estado vazio e carregando

- Vazio: `div.empty > strong.empty-title "Sem itens" + "Use Novo item para começar."`, com borda tracejada e centralizado. Serve para coleção sem itens, lixeira vazia, busca sem resultado ("Nada encontrado para “x”.") e auditoria sem eventos.
- Carregando a tela: `p.status.status-busy[role=status] "Abrindo o cofre…"`. Carregando um botão: `aria-busy` (§3.2). Spinner avulso: `span.spinner[aria-hidden=true]`.

### 3.10 Diálogo / confirmação

Substitui `window.confirm`/`alert` usando `<dialog>` nativo, aberto com `showModal()`. O navegador cuida da captura de foco, do Esc e do `::backdrop`, e a CSP não interfere.

```
dialog.dialog[.dialog-danger][aria-labelledby=t]
  h2.dialog-title#t "Excluir a coleção “Infra”?"
  p "Só funciona vazia (inclusive a lixeira)."
  div.dialog-actions
    button.btn.btn-ghost[autofocus] "Cancelar"
    button.btn.btn-danger "Excluir coleção"
```

- O botão destrutivo diz o verbo e o objeto. Nunca "OK".
- O foco inicial fica em **Cancelar** (`autofocus`). No celular os botões ocupam a largura e o destrutivo fica em cima (`wrap-reverse`).
- Para ações irreversíveis de verdade (remover pessoa, apagar definitivo), `.dialog-danger` acrescenta um filete vermelho no topo.

### 3.11 Código, fingerprint, kit

- `div.code-block > code + button.btn.btn-secondary.btn-sm "Copiar"`: chave base32, URI otpauth, link de convite. O `code` usa `user-select: all`, então um clique seleciona tudo.
- `code.fingerprint` (ou `.code-block.fingerprint`): 18px, monoespaçado, com espaçamento. Serve para ditar e conferir em voz alta.
- `div.kit`: a Recovery Key, com contorno tracejado de atenção, 18px negrito e centralizada. Vem sempre acompanhada de um `.alert-warning` explicando que só aparece agora.
- `ul.code-list > li > code`: os 10 códigos de MFA em grade (2 colunas a 360px).
- `pre`: o JSON de uma versão do histórico (quebra linha, não rola a página).

### 3.12 Revelar / copiar segredo

```
div.secret[.is-revealed]
  div.secret-field > span.secret-label "Senha" + span.secret-value.secret-masked "••••••••"
  (revelado) label.field "Senha" + input[readonly].secret-value   | textarea[readonly]
  div.secret-actions
    btn-secondary "Revelar" ↔ btn-ghost "Ocultar"     (alternar; aria-pressed)
    btn-secondary "Copiar"
  p.status[role=status]
```

- Mascarado: os pontos ficam em `--text-muted`, espaçados e sem seleção.
- **Revelado** (`.is-revealed`): borda e filete de 4px em `--warning-border`, além de um `span.badge.badge-warning "Visível"` no cabeçalho do item. O usuário precisa perceber que o segredo está à mostra. Ao ocultar, fechar ou trocar de item, a tela remove a classe e os nós.
- `ver_sem_revelar`: Revelar e Copiar ficam `disabled` **e** há um `p.status` ou `.alert-info` visível com `AVISO_VER_SEM_REVELAR`. `title` sozinho não basta, porque não aparece no toque nem para todo leitor de tela.
- Copiar: status `.status-success` "Copiado. O clipboard será limpo em 30 s."

## 4. Acessibilidade

### Contraste (WCAG 2.x, calculado com a fórmula de luminância relativa)

| Par | Escuro | Claro | Mínimo |
|---|---|---|---|
| `--text` / `--bg` | 15.67 | 14.67 | 4.5 |
| `--text` / `--surface` | 13.74 | 15.87 | 4.5 |
| `--text` / `--surface-sunken` (input) | 15.52 | 14.15 | 4.5 |
| `--text-muted` / `--bg` | 7.47 | 5.92 | 4.5 |
| `--text-muted` / `--surface` | 6.55 | 6.40 | 4.5 |
| `--text-muted` / `--surface-sunken` | 7.40 | 5.71 | 4.5 |
| `--link` / `--bg` | 9.76 | 5.78 | 4.5 |
| `--link` / `--surface` | 8.56 | 6.25 | 4.5 |
| `--on-accent` / `--accent` (botão primário) | 7.53 | 7.53 | 4.5 |
| `--on-solid` / `--danger-solid` (botão perigo) | 5.54 | 6.57 | 4.5 |
| `--danger-text` / `--danger-bg` | 7.44 | 7.01 | 4.5 |
| `--danger-text` / `--surface` | 8.01 | 8.00 | 4.5 |
| `--success-text` / `--success-bg` | 7.40 | 6.02 | 4.5 |
| `--success-text` / `--surface` | 8.42 | 6.78 | 4.5 |
| `--warning-text` / `--warning-bg` | 9.15 | 7.13 | 4.5 |
| `--info-text` / `--info-bg` | 7.55 | 6.87 | 4.5 |
| `--focus` / `--bg` (anel de foco) | 9.76 | 5.78 | 3.0 |
| `--focus` / `--surface` | 8.56 | 6.25 | 3.0 |
| `--border-control` / `--surface-sunken` (contorno do input) | 4.17 | 3.35 | 3.0 |
| `--border-control` / `--surface` | 3.69 | 3.76 | 3.0 |

O dourado puro `#c9a227` sobre branco tem 2.42, por isso no tema claro ele só aparece como **fundo** (com `--on-accent`, 7.53) e o texto, o link e o foco usam `#7a5c00`. O antigo `#fff` sobre `#e5534b` (3.9) reprovava e foi trocado por `--danger-solid`. O `--text-muted` subiu de `#8b98a5` para `#9aa6b2` para folgar sobre `--surface`.

### Foco, alvos, responsivo

- `:focus-visible` global com anel de 2px em `--focus` e offset de 2px. Inputs ganham anel em qualquer `:focus`. Não use `outline: none` em lugar nenhum.
- Alvos: botão ≥ 40px (`.btn-sm`), padrão 44px. `.nav-link`, `.checkbox`, `.back-link` e `.brand` também têm ≥ 40px de altura.
- Responsivo até 360px sem rolagem horizontal: `overflow-wrap` no body, `min-width: 0` nos filhos flex, barras de ação com `flex-wrap`, tabela rolando dentro de `.table-wrap` e `.code-block` quebrando o texto.
- Ordem de leitura igual à visual: não reordene com CSS, exceto a nav, que é a mesma sequência levada para outra linha.
- O `[hidden]` vence qualquer `display` de componente (`!important`), então botões como "Mais antigos" continuam sumindo.

## 5. Tabela de migração (para o construtor)

As classes antigas funcionaram como aliases (`/* legado */` no CSS) durante a migração. Com todas as telas migradas, os aliases foram apagados: as classes da coluna "Hoje" não têm mais estilo.

| Hoje | Onde | Novo | Observação |
|---|---|---|---|
| `header.topbar > div.brand` | index.html | `header.topbar > div.topbar-inner > a.brand + nav.nav + div.topbar-actions` | nav e ações preenchidas pelo JS após o login; `aria-current="page"` na rota |
| links "Minha conta · Pessoas", `p` "← Minha conta · Auditoria" | cofre, pessoas, auditoria | nav da topbar; quando ainda for preciso, `a.back-link` | "Bloquear" vai para `.topbar-actions` como `.btn-ghost.btn-sm` |
| `main.container` | index.html | `main.container` (+ `.container-narrow` em login/convite/recuperar) | largura passa a 960px |
| `h1` solto | todas | `div.page-header > h1 (+ p.page-subtitle) (+ div.page-actions)` | |
| `.card` | todas | `section.card` + `div.card-header > h2.card-title` | `.card-danger` em Desativar MFA; `.card-accent` no painel do item e em "Senhas a trocar" |
| `.form` | todas | `form.form` | sem mudança; filtros da auditoria → `.form.form-wide > .form-grid` |
| `.form label` (texto + input) | todas | `label.field` | já empilha; adicione `.field-help`/`.field-error` e `aria-describedby` |
| `.form button[type=submit]` solto | todas | `div.form-actions > submit .btn-primary + .btn-ghost "Cancelar"` | |
| `button` sem classe | qualquer | `button.btn.btn-{variante}` | fallback temporário = secundário |
| `.btn-primary/.btn-secondary/.btn-ghost/.btn-sm` | todas | iguais | regra: uma primária por contexto |
| `.btn-danger` em lista ("Excluir", "Remover", "Apagar definitivo", "Desativar MFA") | cofre, pessoas, conta | `.btn-danger-outline` como gatilho; `.btn-danger` no diálogo | |
| `div.secret-item-actions` da coleção (5 botões iguais) | cofre | `div.action-bar`: Novo item `.btn-primary`, Membros `.btn-secondary`, `details.menu` (Lixeira, Renomear), Excluir coleção `.btn-danger-outline.push-end` | |
| `window.confirm` / `window.alert` | cofre, pessoas | `dialog.dialog(.dialog-danger)` + `showModal()` | foco inicial em Cancelar |
| `.secret-list` | cofre, pessoas, conta | `ul.list` | sessões e "Meus acessos" → `ul.list.list-divided` |
| `.secret-item` | idem | `li.list-item` | item aberto `.is-selected`; adulterado `.list-item-error` (não `span.error-msg` dentro) |
| `.secret-item-main/-info/-title/-actions` | idem | `.list-item-main/-info/-title/-actions` | |
| `.secret-item-sub` | idem | `.list-item-meta` | papel/estado/permissão viram `.badge` (§3.8) |
| `span.secret-item-sub` "Sua permissão: …" e "(?)" com `title` | cofre | `span.badge.badge-{tom}` "ver sem revelar" + aviso visível | `title` não basta |
| `ul` sem classe de sessões (`li` com texto + botão) | conta | `ul.list.list-divided > li.list-item > .list-item-main` | "(esta)" vira `.badge-success` "esta sessão" |
| `ul > li > code` dos códigos MFA | conta | `ul.code-list` | |
| `ul > li` destinatários da rotação + `code` | cofre | `ul.list.list-divided` + `code.fingerprint` | |
| `.id-display` | conta, convite, recuperar, pessoas | `div.code-block` | Recovery Key → `div.kit`; fingerprint → `.code-block.fingerprint` |
| `p.muted "Fingerprint …: X"` | convite | `p` + `code.fingerprint` | |
| `.alert.alert-warning` | conta, convite, recuperar, pessoas, cofre | igual (+ `strong.alert-title`) | rotação pendente pode receber título "Rotação pendente" |
| `.error-msg` estático (`role=alert`) | todas | `p.field-error` (no form) ou `div.alert.alert-danger` | vazio já fica oculto |
| `p[role=status]` + `className = 'muted'` | todas | `className = 'status'` | |
| `className = 'muted'` + "Derivando chave…" | login, conta, convite, recuperar, cofre | `className = 'status status-busy'` | botão com `aria-busy="true"` |
| `className = 'error-msg'` no status | todas | `className = 'status status-danger'` | |
| `className = 'ok'` / `p.ok` | conta, cofre, main | `status status-success` / `text-success` | |
| `p.muted` "Sem itens.", "Nada encontrado.", "Lixeira vazia.", "Nenhum evento…" | cofre, conta, auditoria | `div.empty (> strong.empty-title)` | |
| `p.muted` "Abrindo o cofre…", "Consultando convite…", "Carregando…" | cofre, convite, index | `p.status.status-busy[role=status]` | |
| `.muted` (texto auxiliar) | todas | `.muted` (ou `.text-muted`) | sem mudança |
| `.checkbox-label` | conta, convite, recuperar | `label.checkbox` | |
| `.tabela > table` | auditoria | `div.table-wrap[tabindex=0][role=region][aria-label] > table.table` | `td.num` no id, `td.nowrap` na data, resultado em `.badge` |
| `pre` da versão | cofre | `pre` | sem mudança |
| `geradorUi` (`div.secret-item-actions` + `span.secret-item-sub`) | cofre | campo em `div.input-group` (Mostrar/ocultar com `aria-pressed`) + `div.action-bar` (geradores `.btn-secondary.btn-sm`) + `span.field-help` | |
| `segredoBox` (`p` "Senha: ••••") e `label` + input readonly | cofre | `div.secret(.is-revealed)` §3.12 | |
| `input[type=search]` no `div.form` | cofre | `input[type=search][aria-label]` direto, ou em `label.field` | |
| `.modal-overlay`, `.modal`, `.toast`, `.vault-badge`, `.card-row`, `.dashboard-header`, `.btn-back`, `.secret-item-password`, `.modal-actions` | nenhum uso em JS | **removidas** | eram CSS morto |

## 6. Decisões em aberto

1. **Tema manual.** Hoje o tema segue só `prefers-color-scheme`. Um seletor claro/escuro exigiria duplicar o bloco de tokens sob um atributo (`[data-tema]`) e guardar a escolha, o que `localStorage` não permite neste projeto (varredura). Fica fora até alguém pedir.
2. **`<meta name="color-scheme" content="dark light">`** no `index.html` evitaria um piscar branco antes do CSS carregar. É uma linha, mas o `index.html` é do construtor.
3. **`window.confirm` → `<dialog>`** muda o fluxo (confirmação assíncrona). Fica a critério do construtor fazer agora ou numa etapa seguinte. Os testes unitários não dependem disso.
4. **Skip link.** O roteador por hash trataria `href="#app"` como rota, então não há "pular para o conteúdo". Se for necessário, implemente como botão que foca `#app` (`tabindex=-1`).
5. **Largura de 960px.** Formulários continuam em 28rem. Se as listas parecerem largas demais, aplique `.container-narrow` por tela.
