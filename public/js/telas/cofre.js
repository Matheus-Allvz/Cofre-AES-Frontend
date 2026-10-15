// #/cofre: coleções e itens (Fase 6); membros da coleção, rotação e senhas a trocar (Fase 7). sync → abre envelopes e metas em memória → lista com busca
// local; revelar/copiar/histórico pelas rotas auditadas; lixeira. O segredo revelado vive só no
// painel do item aberto: fechar o item, abrir outro, recarregar ou bloquear descarta o painel.
// Ids de coleção/item nos caminhos já passaram por aad.* (UUID) ao decifrar; os da lixeira e do
// histórico, que podem vir de linha ilegível, vão com encodeURIComponent.
import { api, ErroApi, mensagem } from '../api.js';
import { buscar } from '../busca.js';
import * as cofre from '../cofre.js';
import { el, trocar, urlSegura } from '../dom.js';
import { definir, estado } from '../estado.js';
import { carregarPalavras, gerarPassphrase, gerarSenha } from '../gerador.js';
import { sair } from '../sessao.js';

const eu = () => ({ usuario: estado.usuario, privada: estado.privada, publica: estado.publica });
const quando = (iso) => new Date(iso).toLocaleString('pt-BR');
const botao = (texto, classe, onclick, extra = {}) => el('button', { type: 'button', class: `btn btn-sm ${classe}`, onclick, ...extra }, texto);
const ROTULOS = {
  titulo: 'Título', usuario: 'Usuário', urls: 'URLs (uma por linha)', validade: 'Validade',
  senha: 'Senha', notas: 'Notas', conteudo: 'Conteúdo', valor: 'Valor da chave',
};
const NOMES_TIPO = { login: 'Login', nota: 'Nota segura', chave_api: 'Chave de API' };
const PRINCIPAL = { login: 'senha', nota: 'conteudo', chave_api: 'valor' }; // campo que "Copiar" copia

function falhou(aviso, e, texto = 'Não foi possível concluir a ação.') {
  if (e instanceof ErroApi && e.codigo === 'nao_autenticado') return sair(mensagem(e));
  aviso.className = 'error-msg';
  aviso.textContent = e instanceof ErroApi ? mensagem(e) : texto;
}

export async function telaCofre(app) {
  if (!estado.usuario) return location.replace('#/login');
  const aviso = el('p', { class: 'muted', role: 'status' }, 'Abrindo o cofre…');
  trocar(app, el('h1', {}, 'Cofre'), aviso);
  let dados;
  try {
    dados = await cofre.abrirSync(await api('GET', '/sync'), eu());
  } catch (e) {
    // Conta ainda não ativa ou MFA pendente: a tela da conta explica o que falta.
    if (e instanceof ErroApi && ['sem_permissao', 'mfa_configuracao_requerida'].includes(e.codigo)) return location.replace('#/conta');
    return falhou(aviso, e, 'Não foi possível abrir o cofre.');
  }
  definir({ cofre: dados }); // chaves das coleções: só memória, descartadas por limpar()
  const recarregar = () => telaCofre(app);
  const painel = el('div');
  const lista = el('div');
  const busca = el('input', { type: 'search', placeholder: 'Buscar por título, usuário ou URL', autocomplete: 'off', 'aria-label': 'Buscar' });
  const ctx = { dados, painel, recarregar, aviso };

  const pintarLista = () => trocar(lista, ...[...dados.colecoes.values()].map((col) => secaoColecao(ctx, col, busca.value)));
  busca.addEventListener('input', pintarLista);
  pintarLista();
  aviso.textContent = '';
  const gestor = ['owner', 'admin'].includes(estado.usuario.papel);
  trocar(app,
    el('h1', {}, 'Cofre'),
    el('p', {}, el('a', { href: '#/conta' }, 'Minha conta'), gestor ? ' · ' : null, gestor ? el('a', { href: '#/pessoas' }, 'Pessoas') : null, ' · ',
      botao('Bloquear', 'btn-ghost', () => sair('Cofre bloqueado.'))),
    aviso,
    senhasATrocar(ctx),
    el('div', { class: 'form' }, busca),
    painel,
    lista,
    formNovaColecao(ctx));
}

// ---------- coleções ----------

function formNovaColecao({ recarregar, aviso }) {
  const nome = el('input', { required: true, maxlength: 200, autocomplete: 'off' });
  const enviar = el('button', { type: 'submit', class: 'btn btn-primary' }, 'Criar coleção');
  async function criar(ev) {
    ev.preventDefault();
    enviar.disabled = true;
    try {
      const membros = await api('GET', '/membros'); // owners ativos recebem envelope (D13)
      const { corpo } = await cofre.montarColecao({ eu: eu(), nome: nome.value, membros });
      await api('POST', '/colecoes', corpo);
      recarregar();
    } catch (e) {
      falhou(aviso, e);
      enviar.disabled = false;
    }
  }
  return el('section', { class: 'card' }, el('h2', {}, 'Nova coleção'),
    el('p', { class: 'muted' }, 'Todos os owners ativos da organização recebem acesso de gerência (regra da organização).'),
    el('form', { class: 'form', onsubmit: criar }, el('label', {}, 'Nome', nome), enviar));
}

function rotuloPermissao(permissao) {
  if (permissao !== 'ver_sem_revelar') return el('span', { class: 'secret-item-sub' }, `Sua permissão: ${permissao}`);
  return el('span', { class: 'secret-item-sub', title: cofre.AVISO_VER_SEM_REVELAR }, 'Sua permissão: ver sem revelar (?)');
}

function secaoColecao(ctx, col, termo) {
  if (col.erro) {
    return el('section', { class: 'card' }, el('p', { class: 'error-msg' }, 'Coleção ilegível: a chave ou o nome não decifram (possível adulteração).'));
  }
  const { dados, painel, recarregar, aviso } = ctx;
  const itens = buscar(dados.itens.filter((i) => i.colecaoId === col.id), termo);
  const acoes = el('div', { class: 'secret-item-actions' });
  if (cofre.pode(col.permissao, 'editar')) {
    acoes.append(
      botao('Novo item', 'btn-primary', () => trocar(painel, formItem(ctx, col, null))),
      botao('Lixeira', 'btn-secondary', () => abrirLixeira(ctx, col)));
  }
  if (cofre.pode(col.permissao, 'gerenciar')) {
    acoes.append(
      botao('Membros', 'btn-secondary', () => painelMembros(ctx, col)),
      botao('Renomear', 'btn-secondary', () => trocar(painel, formRenomear(ctx, col))),
      botao('Excluir coleção', 'btn-danger', async () => {
        if (!window.confirm(`Excluir a coleção "${col.nome}"? Só funciona vazia (inclusive a lixeira).`)) return;
        try {
          await api('DELETE', `/colecoes/${col.id}`);
          recarregar();
        } catch (e) {
          falhou(aviso, e);
        }
      }));
  }
  const linhas = itens.map((i) => (i.erro
    ? el('li', { class: 'secret-item' }, el('span', { class: 'error-msg' }, 'Item adulterado: não decifra com a chave da coleção.'))
    : el('li', { class: 'secret-item' },
      el('div', { class: 'secret-item-main' },
        el('div', { class: 'secret-item-info' },
          el('span', { class: 'secret-item-title' }, i.meta.titulo),
          el('span', { class: 'secret-item-sub' }, [NOMES_TIPO[i.tipo], i.meta.usuario].filter(Boolean).join(' · '))),
        el('div', { class: 'secret-item-actions' }, botao('Abrir', 'btn-secondary', () => trocar(painel, detalhe(ctx, col, i))))))));
  return el('section', { class: 'card' },
    el('h2', {}, col.nome), rotuloPermissao(col.permissao),
    col.rotacaoPendente && cofre.pode(col.permissao, 'gerenciar') ? bannerRotacao(ctx, col) : null,
    col.permissao === 'ver_sem_revelar' ? el('p', { class: 'muted' }, cofre.AVISO_VER_SEM_REVELAR) : null,
    acoes,
    linhas.length ? el('ul', { class: 'secret-list' }, ...linhas) : el('p', { class: 'muted' }, termo ? 'Nada encontrado.' : 'Sem itens.'));
}

function formRenomear({ painel, recarregar }, col) {
  const nome = el('input', { required: true, maxlength: 200, value: col.nome });
  const erro = el('p', { class: 'error-msg', role: 'alert' });
  async function enviar(ev) {
    ev.preventDefault();
    try {
      await api('PUT', `/colecoes/${col.id}`, await cofre.montarNomeColecao({ eu: eu(), colecao: col, nome: nome.value }));
      recarregar();
    } catch (e) {
      falhou(erro, e);
    }
  }
  return el('section', { class: 'card' }, el('h2', {}, 'Renomear coleção'),
    el('form', { class: 'form', onsubmit: enviar }, el('label', {}, 'Nome', nome),
      el('button', { type: 'submit', class: 'btn btn-primary' }, 'Salvar'), botao('Cancelar', 'btn-ghost', () => trocar(painel)), erro));
}

// ---------- item: detalhe, revelar, copiar ----------

/** GET /itens/{id}/segredo (auditado) → segredo decifrado. */
async function revelar(col, item) {
  const resp = await api('GET', `/itens/${item.id}/segredo`);
  return cofre.abrirSegredo({ eu: eu(), colecao: col, item, resp });
}

function detalhe(ctx, col, item) {
  const { painel, recarregar } = ctx;
  const tipo = cofre.TIPOS[item.tipo];
  const aviso = el('p', { class: 'muted', role: 'status' });
  let revelado = null; // só neste painel; trocar(painel) descarta
  const segredoBox = el('div');
  const mascarado = () => trocar(segredoBox, ...tipo.segredo.map((k) => el('p', {}, `${ROTULOS[k]}: ••••••••`)));
  mascarado();
  const podeVer = cofre.pode(col.permissao, 'ver');
  const semRevelar = podeVer ? {} : { disabled: true, title: cofre.AVISO_VER_SEM_REVELAR };

  async function obter() {
    if (!revelado) revelado = await revelar(col, item);
    return revelado;
  }
  async function mostrar() {
    try {
      const s = await obter();
      trocar(segredoBox, ...tipo.segredo.map((k) => el('label', {}, ROTULOS[k],
        el(k === 'notas' || k === 'conteudo' ? 'textarea' : 'input', { readonly: true, value: s[k] ?? '' }, k === 'notas' || k === 'conteudo' ? (s[k] ?? '') : null))));
    } catch (e) {
      falhou(aviso, e, 'O segredo não decifra: item adulterado ou movido.');
    }
  }
  async function copiar() {
    try {
      const valor = (await obter())[PRINCIPAL[item.tipo]] ?? '';
      await cofre.copiarComLimpeza(valor);
      api('POST', `/itens/${item.id}/copiado`).catch(() => {}); // melhor esforço
      aviso.className = 'ok';
      aviso.textContent = 'Copiado. O clipboard será limpo em 30 s (se ainda tiver este conteúdo).';
    } catch (e) {
      falhou(aviso, e, 'Não foi possível copiar.');
    }
  }
  const fechar = () => { revelado = null; trocar(painel); };
  const acoes = el('div', { class: 'secret-item-actions' },
    botao('Revelar', 'btn-secondary', mostrar, semRevelar),
    botao('Ocultar', 'btn-ghost', () => { revelado = null; mascarado(); }),
    botao('Copiar', 'btn-secondary', copiar, semRevelar));
  if (podeVer) acoes.append(botao('Histórico', 'btn-secondary', () => historico(ctx, col, item, painelHist)));
  if (cofre.pode(col.permissao, 'editar')) {
    acoes.append(
      botao('Editar', 'btn-secondary', async () => {
        try {
          trocar(painel, formItem(ctx, col, item, await obter()));
        } catch (e) {
          falhou(aviso, e);
        }
      }),
      botao('Excluir', 'btn-danger', async () => {
        if (!window.confirm(`Mover "${item.meta.titulo}" para a lixeira? Fica 30 dias lá.`)) return;
        try {
          await api('DELETE', `/itens/${item.id}`);
          recarregar();
        } catch (e) {
          falhou(aviso, e);
        }
      }));
  }
  acoes.append(botao('Fechar', 'btn-ghost', fechar));
  const painelHist = el('div');
  return el('section', { class: 'card' },
    el('h2', {}, item.meta.titulo),
    el('p', { class: 'muted' }, `${NOMES_TIPO[item.tipo]} · versão ${item.versao} · atualizado ${quando(item.atualizadoEm)}`),
    ...camposMeta(item.meta),
    podeVer ? null : el('p', { class: 'muted' }, cofre.AVISO_VER_SEM_REVELAR),
    segredoBox, acoes, aviso, painelHist);
}

function camposMeta(meta) {
  const nos = [];
  if (meta.usuario) nos.push(el('p', {}, `Usuário: ${meta.usuario}`));
  if (meta.validade) nos.push(el('p', {}, `Validade: ${meta.validade}`));
  for (const u of meta.urls ?? []) {
    nos.push(el('p', {}, 'URL: ', urlSegura(u) ? el('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, u) : u));
  }
  return nos;
}

// ---------- criar / editar ----------

function formItem(ctx, col, item, segredoAtual = null) {
  const { painel, recarregar } = ctx;
  const tipoSel = el('select', { disabled: Boolean(item) }, ...Object.entries(NOMES_TIPO).map(([v, t]) => el('option', { value: v, selected: item?.tipo === v }, t)));
  const campos = el('div');
  const erro = el('p', { class: 'error-msg', role: 'alert' });
  let entradas = {};
  const principalOriginal = segredoAtual?.[PRINCIPAL[item?.tipo]];

  function pintar() {
    const t = cofre.TIPOS[tipoSel.value];
    entradas = {};
    const nos = [];
    for (const k of [...t.meta, ...t.segredo]) {
      const inicial = k === 'urls' ? (item?.meta.urls ?? []).join('\n') : (item?.meta[k] ?? segredoAtual?.[k] ?? '');
      const multi = ['urls', 'notas', 'conteudo'].includes(k);
      const segredo = k === 'senha' || k === 'valor';
      const entrada = multi ? el('textarea', { rows: 3 }, inicial)
        : el('input', { type: segredo ? 'password' : k === 'validade' ? 'date' : 'text', value: inicial, autocomplete: 'off', required: k === 'titulo' });
      entradas[k] = entrada;
      nos.push(el('label', {}, ROTULOS[k], entrada));
      if (k === 'senha') nos.push(geradorUi(entrada));
    }
    trocar(campos, ...nos);
  }
  tipoSel.addEventListener('change', pintar);
  pintar();

  async function salvar(ev) {
    ev.preventDefault();
    const t = cofre.TIPOS[tipoSel.value];
    const ler = (k) => (k === 'urls' ? entradas.urls.value.split('\n').map((u) => u.trim()).filter(Boolean) : entradas[k].value);
    const meta = Object.fromEntries(t.meta.map((k) => [k, ler(k)]).filter(([k, v]) => k === 'titulo' || (Array.isArray(v) ? v.length : v)));
    const segredo = Object.fromEntries(t.segredo.map((k) => [k, ler(k)]));
    try {
      if (item) {
        // Valor principal (senha/conteúdo/valor) mudou: tira o item do painel "Senhas a trocar".
        const senhaTrocada = segredo[PRINCIPAL[item.tipo]] !== principalOriginal;
        const ed = await cofre.montarEdicao({ eu: eu(), colecao: col, item, meta, segredo, senhaTrocada });
        await api('PUT', `/itens/${item.id}`, ed.corpo, { headers: { 'If-Match': ed.ifMatch } });
      } else {
        await api('POST', `/colecoes/${col.id}/itens`, await cofre.montarItem({ eu: eu(), colecao: col, tipo: tipoSel.value, meta, segredo }));
      }
      recarregar();
    } catch (e) {
      if (e instanceof ErroApi && ['conflito_versao', 'chave_ver_desatualizada'].includes(e.codigo)) {
        window.alert(mensagem(e)); // re-sincroniza: o item mudou em outro lugar
        return recarregar();
      }
      falhou(erro, e, e.message === 'titulo_obrigatorio' ? 'Informe o título.' : undefined);
    }
  }
  return el('section', { class: 'card' }, el('h2', {}, item ? 'Editar item' : `Novo item em ${col.nome}`),
    el('form', { class: 'form', onsubmit: salvar }, el('label', {}, 'Tipo', tipoSel), campos,
      el('button', { type: 'submit', class: 'btn btn-primary' }, 'Salvar'), botao('Cancelar', 'btn-ghost', () => trocar(painel)), erro));
}

function geradorUi(entrada) {
  const aviso = el('span', { class: 'secret-item-sub' });
  const mostrar = () => { entrada.type = entrada.type === 'password' ? 'text' : 'password'; };
  return el('div', { class: 'secret-item-actions' },
    botao('Gerar senha (20)', 'btn-secondary', () => { entrada.value = gerarSenha({ tamanho: 20 }); entrada.type = 'text'; }),
    botao('Gerar passphrase (6 palavras)', 'btn-secondary', async () => {
      try {
        entrada.value = gerarPassphrase(await carregarPalavras(), { palavras: 6 });
        entrada.type = 'text';
      } catch {
        aviso.textContent = 'Lista de palavras indisponível.';
      }
    }),
    botao('Mostrar/ocultar', 'btn-ghost', mostrar), aviso);
}

// ---------- histórico ----------

async function historico(ctx, col, item, alvo) {
  const aviso = el('p', { class: 'muted', role: 'status' });
  let versoes, nomes;
  try {
    versoes = await api('GET', `/itens/${item.id}/versoes`);
    nomes = new Map((await api('GET', '/membros').catch(() => [])).map((m) => [m.id, m.nome ?? m.email]));
  } catch (e) {
    trocar(alvo, aviso);
    return falhou(aviso, e);
  }
  const linhas = versoes.map((v) => {
    const box = el('div');
    const ver = async () => {
      try {
        const resp = await api('GET', `/itens/${item.id}/versoes/${encodeURIComponent(v.versao)}`);
        const { meta, segredo } = await cofre.abrirVersao({ eu: eu(), colecao: col, item, versao: v.versao, resp });
        trocar(box, el('pre', {}, JSON.stringify({ ...meta, ...segredo }, null, 2)), ...restaurar(meta, segredo));
      } catch (e) {
        falhou(aviso, e, 'Esta versão não decifra (adulterada ou movida).');
      }
    };
    const restaurar = (meta, segredo) => (cofre.pode(col.permissao, 'editar')
      ? [botao(`Restaurar a versão ${v.versao}`, 'btn-primary', async () => {
        try {
          const ed = await cofre.montarEdicao({ eu: eu(), colecao: col, item, meta, segredo, senhaTrocada: false });
          await api('PUT', `/itens/${item.id}`, ed.corpo, { headers: { 'If-Match': ed.ifMatch } });
          ctx.recarregar();
        } catch (e) {
          if (e instanceof ErroApi && e.codigo === 'conflito_versao') return ctx.recarregar();
          falhou(aviso, e);
        }
      })]
      : []);
    return el('li', { class: 'secret-item' },
      el('span', {}, `Versão ${v.versao} · por ${nomes.get(v.editado_por) ?? v.editado_por} · ${quando(v.em)} `),
      botao('Ver', 'btn-secondary', ver), box);
  });
  trocar(alvo, el('h2', {}, 'Histórico (versões anteriores)'),
    linhas.length ? el('ul', { class: 'secret-list' }, ...linhas) : el('p', { class: 'muted' }, 'Sem versões anteriores.'), aviso);
}

// ---------- lixeira ----------

async function abrirLixeira(ctx, col) {
  const { painel, recarregar } = ctx;
  const aviso = el('p', { class: 'muted', role: 'status' });
  let itens;
  try {
    const linhas = await api('GET', `/colecoes/${col.id}/lixeira`);
    itens = await Promise.all(linhas.map((l) => cofre.abrirItem(estado.usuario.org_id, col, l)));
  } catch (e) {
    trocar(painel, aviso);
    return falhou(aviso, e);
  }
  const acao = (texto, classe, fn) => botao(texto, classe, async () => {
    try {
      await fn();
      recarregar();
    } catch (e) {
      falhou(aviso, e);
    }
  });
  const linhas = itens.map((i) => el('li', { class: 'secret-item' },
    el('span', {}, `${i.meta?.titulo ?? 'Item adulterado'} · excluído ${quando(i.excluidoEm)} `),
    acao('Restaurar', 'btn-secondary', () => api('POST', `/itens/${encodeURIComponent(i.id)}/restaurar`)),
    cofre.pode(col.permissao, 'gerenciar')
      ? acao('Apagar definitivo', 'btn-danger', () => (window.confirm('Apagar de vez este item e o histórico dele?') ? api('DELETE', `/itens/${encodeURIComponent(i.id)}/definitivo`) : null))
      : null));
  trocar(painel, el('section', { class: 'card' }, el('h2', {}, `Lixeira de ${col.nome}`),
    el('p', { class: 'muted' }, 'Itens ficam 30 dias na lixeira e depois são apagados.'),
    linhas.length ? el('ul', { class: 'secret-list' }, ...linhas) : el('p', { class: 'muted' }, 'Lixeira vazia.'),
    aviso, botao('Fechar', 'btn-ghost', () => trocar(painel))));
}

// ---------- Fase 7: senhas a trocar, rotação, membros ----------

/** RF-U04: itens que alguém que saiu já viu; somem ao editar com o valor novo (senha_trocada). */
function senhasATrocar(ctx) {
  const { dados, painel } = ctx;
  const pendentes = dados.itens.filter((i) => i.rotacaoSenhaPendente && !i.erro && dados.colecoes.get(i.colecaoId)?.chave);
  if (!pendentes.length) return null;
  return el('section', { class: 'card' },
    el('h2', {}, `Senhas a trocar (${pendentes.length})`),
    el('p', { class: 'muted' },
      'Alguém que tinha acesso a estes itens saiu. Troque a senha/valor no sistema de origem e depois edite o item com o valor novo.'),
    el('ul', { class: 'secret-list' }, ...pendentes.map((i) => {
      const col = dados.colecoes.get(i.colecaoId);
      return el('li', { class: 'secret-item' },
        el('div', { class: 'secret-item-main' },
          el('div', { class: 'secret-item-info' },
            el('span', { class: 'secret-item-title' }, i.meta.titulo),
            el('span', { class: 'secret-item-sub' }, `${col.nome} · ${NOMES_TIPO[i.tipo]}`)),
          el('div', { class: 'secret-item-actions' }, botao('Abrir', 'btn-secondary', () => trocar(painel, detalhe(ctx, col, i))))));
    })));
}

function bannerRotacao({ recarregar }, col) {
  const aviso = el('p', { class: 'muted', role: 'status' });
  const executar = botao('Rotacionar a chave agora', 'btn-primary', async () => {
    executar.disabled = true;
    aviso.className = 'muted';
    aviso.textContent = 'Recifrando a coleção com uma chave nova…';
    try {
      await cofre.rotacionarColecao({ eu: eu(), colecao: col, pedir: (m, c, corpo) => api(m, c, corpo) });
      recarregar();
    } catch (e) {
      if (e instanceof ErroApi && ['chave_ver_desatualizada', 'conflito_versao', 'rotacao_incompleta', 'ocupado'].includes(e.codigo)) {
        window.alert(`${mensagem(e)} O cofre foi recarregado: rotacione de novo.`);
        return recarregar(); // re-sincroniza e o banner volta com o estado novo
      }
      executar.disabled = false;
      falhou(aviso, e, e.message === 'adulterado'
        ? 'Algum item desta coleção não decifra (possível adulteração). A rotação não foi feita.'
        : 'Não foi possível rotacionar.');
    }
  });
  return el('div', { class: 'alert alert-warning', role: 'alert' },
    el('p', {}, 'Rotação pendente: alguém perdeu o acesso a esta coleção e ainda tem a chave antiga. '
      + 'Rotacionar gera uma chave nova, recifra nome, itens (inclusive lixeira) e histórico e entrega a chave só aos membros atuais.'),
    executar, aviso);
}

const nomeDe = (p) => (p ? `${p.nome ?? '(sem nome)'} <${p.email}>` : '(pessoa removida)');

async function painelMembros(ctx, col) {
  const { painel } = ctx;
  const aviso = el('p', { class: 'muted', role: 'status' });
  let membros, pessoas;
  try {
    [membros, pessoas] = await Promise.all([api('GET', `/colecoes/${col.id}/membros`), api('GET', '/membros')]);
  } catch (e) {
    trocar(painel, aviso);
    return falhou(aviso, e);
  }
  const reabrir = () => painelMembros(ctx, col);
  const porId = new Map(pessoas.map((p) => [p.id, p]));
  const linhas = membros.map((m) => {
    const p = porId.get(m.usuario_id);
    const owner = p?.papel === 'owner';
    const sel = el('select', { disabled: owner, 'aria-label': 'Permissão' },
      ...cofre.PERMISSOES.map((v) => el('option', { value: v, selected: v === m.permissao }, v)));
    const salvar = botao('Salvar', 'btn-secondary', async () => {
      try {
        await api('PUT', `/colecoes/${col.id}/membros/${encodeURIComponent(m.usuario_id)}`, { permissao: sel.value });
        reabrir();
      } catch (e) {
        falhou(aviso, e);
      }
    }, { disabled: owner });
    const remover = botao('Remover', 'btn-danger', async () => {
      if (!window.confirm(`Remover ${nomeDe(p)} desta coleção? Ela continua sabendo o que já viu: a coleção vai pedir rotação da chave e todos os itens ficam em "Senhas a trocar".`)) return;
      try {
        await api('DELETE', `/colecoes/${col.id}/membros/${encodeURIComponent(m.usuario_id)}`);
        ctx.recarregar();
      } catch (e) {
        falhou(aviso, e);
      }
    }, { disabled: owner });
    return el('li', { class: 'secret-item' },
      el('span', {}, `${nomeDe(p)}${owner ? ' · owner (sempre gerenciar)' : ''}`), sel, salvar, remover);
  });
  trocar(painel, el('section', { class: 'card' }, el('h2', {}, `Membros de ${col.nome}`),
    el('ul', { class: 'secret-list' }, ...linhas), aviso,
    formAdicionarMembro(ctx, col, pessoas.filter((p) => cofre.podeReceberAcesso(p) && !membros.some((m) => m.usuario_id === p.id)), reabrir),
    botao('Fechar', 'btn-ghost', () => trocar(painel))));
}

/** Só pessoas ativas com fingerprint confirmado; a chave pública é conferida contra ele antes de envelopar. */
function formAdicionarMembro(ctx, col, candidatos, reabrir) {
  if (!candidatos.length) return el('p', { class: 'muted' }, 'Ninguém mais pode receber acesso (só pessoas ativas com fingerprint confirmado).');
  const pessoa = el('select', { 'aria-label': 'Pessoa' }, ...candidatos.map((p) => el('option', { value: p.id }, nomeDe(p))));
  const fp = el('code', {});
  const mostrarFp = () => { fp.textContent = candidatos.find((p) => p.id === pessoa.value)?.fingerprint_confirmado ?? ''; };
  pessoa.addEventListener('change', mostrarFp);
  mostrarFp();
  const permissao = el('select', { 'aria-label': 'Permissão' }, ...cofre.PERMISSOES.map((v) => el('option', { value: v, selected: v === 'ver' }, v)));
  const erro = el('p', { class: 'error-msg', role: 'alert' });
  async function enviar(ev) {
    ev.preventDefault();
    try {
      const membro = candidatos.find((p) => p.id === pessoa.value);
      await api('POST', `/colecoes/${col.id}/membros`, await cofre.montarMembro({ eu: eu(), colecao: col, membro, permissao: permissao.value }));
      reabrir();
    } catch (e) {
      if (e instanceof ErroApi && e.codigo === 'chave_ver_desatualizada') {
        window.alert(mensagem(e));
        return ctx.recarregar();
      }
      falhou(erro, e, e.message === 'chave_publica_divergente'
        ? 'A chave pública desta pessoa não confere com o fingerprint confirmado. Não dê acesso e avise um administrador.'
        : undefined);
    }
  }
  return el('form', { class: 'form', onsubmit: enviar },
    el('h3', {}, 'Dar acesso'),
    el('label', {}, 'Pessoa', pessoa),
    el('p', { class: 'muted' }, 'Fingerprint confirmado: ', fp),
    el('label', {}, 'Permissão', permissao),
    el('button', { type: 'submit', class: 'btn btn-primary' }, 'Dar acesso'), erro);
}
