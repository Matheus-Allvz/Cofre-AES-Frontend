// #/pessoas (owner/admin): membros da organização, convite, confirmação por fingerprint,
// suspender/reativar, papel, promoção a owner (Fase 7) e remoção com relatório de offboarding.
import { api, ErroApi, mensagem } from '../api.js';
import * as cofre from '../cofre.js';
import { el, trocar } from '../dom.js';
import { estado } from '../estado.js';
import { fingerprintConfere, fingerprintDoMembro } from '../fluxos.js';
import { sair } from '../sessao.js';
import { selo, TOM_ESTADO, TOM_PAPEL } from '../casca.js';

function falhou(aviso, e) {
  if (e instanceof ErroApi && e.codigo === 'nao_autenticado') return sair(mensagem(e));
  aviso.className = 'status status-danger';
  aviso.textContent = e instanceof ErroApi ? mensagem(e) : 'Não foi possível concluir a ação.';
}

export async function telaPessoas(app) {
  const eu = estado.usuario;
  if (!eu) return location.replace('#/login');
  if (!['owner', 'admin'].includes(eu.papel)) {
    return trocar(app, titulo(), el('p', { class: 'alert alert-danger' }, mensagem(new ErroApi(403, 'sem_permissao'))));
  }
  const aviso = el('p', { class: 'status', role: 'status' });
  let membros;
  try {
    membros = await api('GET', '/membros');
  } catch (e) {
    trocar(app, titulo(), aviso);
    return falhou(aviso, e);
  }
  const recarregar = () => telaPessoas(app);
  const relatorio = el('div', { id: 'relatorio-saida' });
  const linhas = await Promise.all(membros.map((m) => linhaMembro(m, eu, aviso, recarregar, relatorio)));
  trocar(app, titulo(),
    secaoConvite(recarregar),
    relatorio,
    el('section', { class: 'card' }, el('h2', { class: 'card-title' }, 'Membros'), aviso, el('ul', { class: 'list' }, ...linhas)));
}

const titulo = () => el('div', { class: 'page-header' }, el('h1', {}, 'Pessoas'));

// ---------- Convite ----------

function secaoConvite(recarregar) {
  const email = el('input', { type: 'email', required: true, autocomplete: 'off' });
  const papel = el('select', {}, el('option', { value: 'member' }, 'member'), el('option', { value: 'admin' }, 'admin'));
  const botao = el('button', { type: 'submit', class: 'btn btn-primary' }, 'Convidar');
  const aviso = el('p', { class: 'status', role: 'status' });
  const resultado = el('div');
  async function convidar(ev) {
    ev.preventDefault();
    botao.disabled = true;
    try {
      const r = await api('POST', '/convites', { email: email.value.trim(), papel: papel.value });
      const link = `${location.origin}${r.link}`;
      email.value = '';
      aviso.textContent = '';
      trocar(resultado,
        el('div', { class: 'alert alert-warning', role: 'alert' },
          'Este link aparece só agora. Entregue-o por um canal seguro (pessoalmente, chat corporativo) e depois confira o fingerprint com a pessoa.'),
        el('div', { class: 'code-block' }, el('code', {}, link),
          el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => navigator.clipboard?.writeText(link).catch(() => {}) }, 'Copiar')),
        el('div', { class: 'action-bar' }, el('button', { type: 'button', class: 'btn btn-secondary', onclick: recarregar }, 'Entreguei o link')));
    } catch (e) {
      falhou(aviso, e);
    } finally {
      botao.disabled = false;
    }
  }
  return el('section', { class: 'card' }, el('h2', { class: 'card-title' }, 'Convidar pessoa'),
    el('form', { class: 'form', onsubmit: convidar },
      el('label', { class: 'field' }, 'E-mail', email), el('label', { class: 'field' }, 'Papel', papel),
      el('div', { class: 'form-actions' }, botao), aviso),
    el('div', { class: 'stack-sm' }, resultado));
}

// ---------- Um membro ----------

/**
 * Envelopes `gerenciar` para `alvo` (D13), das coleções que eu (owner) abro: todas na promoção a
 * owner; na reativação de owner, só as em que ele ainda não tem envelope (as criadas enquanto
 * estava suspenso) — o servidor recusa substituir um envelope existente (409 envelope_existente).
 * As collectionKeys são reabertas do sync e descartadas depois.
 */
async function envelopesOwner(alvo, { soFaltantes = false } = {}) {
  const meu = { usuario: estado.usuario, privada: estado.privada, publica: estado.publica };
  const { colecoes } = await cofre.abrirSync(await api('GET', '/sync'), meu);
  let alvos = [...colecoes.values()];
  if (soFaltantes) {
    const tem = await Promise.all(alvos.map(async (col) => (await api('GET', `/colecoes/${encodeURIComponent(col.id)}/membros`))
      .some((m) => m.usuario_id === alvo.id)));
    alvos = alvos.filter((_, i) => !tem[i]);
  }
  return cofre.montarEnvelopesOwner({ eu: meu, colecoes: alvos, alvo });
}

function falhaEnvelopes(aviso, e) {
  if (e instanceof ErroApi) return falhou(aviso, e);
  aviso.className = 'status status-danger';
  aviso.textContent = {
    chave_publica_divergente: 'A chave pública desta pessoa não confere com o fingerprint confirmado. Não continue.',
    fingerprint_nao_confirmado: 'Esta pessoa ainda não teve o fingerprint confirmado.',
    colecao_ilegivel: 'Alguma coleção não abre neste navegador (possível adulteração): não dá para entregar a chave dela.',
  }[e.message] ?? 'Não foi possível preparar os acessos das coleções.';
}

/** RF-U03: o que a pessoa removida alcançava; nomes vêm do cofre aberto quando possível. */
function mostrarRelatorio(alvo, m, relatorio) {
  const nomes = estado.cofre?.colecoes;
  const itens = relatorio.reduce((n, r) => n + r.itens.length, 0);
  trocar(alvo, el('section', { class: 'card card-accent' },
    el('h2', { class: 'card-title' }, `Relatório de saída: ${m.email}`),
    el('p', {}, relatorio.length
      ? `Alcançava ${relatorio.length} coleção(ões) e ${itens} item(ns), inclusive lixeira. Elas ficaram com rotação pendente e os itens em "Senhas a trocar" no Cofre.`
      : 'Não alcançava nenhuma coleção.'),
    relatorio.length ? el('ul', { class: 'list list-divided' }, ...relatorio.map((r) => el('li', { class: 'list-item' },
      `${nomes?.get(r.colecao_id)?.nome ?? r.colecao_id}: ${r.itens.length} item(ns)`))) : null,
    el('p', { class: 'muted' }, 'Quem gerencia cada coleção vê o aviso de rotação ao abrir o Cofre.')));
}

async function linhaMembro(m, eu, aviso, recarregar, relatorio) {
  const souEu = m.id === eu.id;
  const podeMexer = !souEu && (m.papel !== 'owner' || eu.papel === 'owner');
  const acoes = el('div', { class: 'list-item-actions' });
  const li = el('li', { class: 'list-item stack-sm' },
    el('div', { class: 'list-item-main' },
      el('div', { class: 'list-item-info' },
        el('span', { class: 'list-item-title' }, `${m.nome ?? '(sem nome)'}${souEu ? ' (você)' : ''}`),
        el('span', { class: 'list-item-meta' }, `${m.email} · `, selo(TOM_PAPEL, m.papel), ' · ', selo(TOM_ESTADO, m.estado))),
      acoes));

  async function agir(metodo, caminho, corpo, pergunta) {
    if (pergunta && !window.confirm(pergunta)) return;
    try {
      await api(metodo, caminho, corpo);
      recarregar();
    } catch (e) {
      falhou(aviso, e);
    }
  }
  const botao = (texto, classe, fn) => el('button', { type: 'button', class: `btn btn-sm ${classe}`, onclick: fn }, texto);
  const url = `/membros/${encodeURIComponent(m.id)}`;
  if (!podeMexer) return li;

  if (m.estado === 'aceito') acoes.append(botao('Conferir fingerprint', 'btn-primary', () => conferir(li, m, aviso, recarregar)));
  if (m.estado === 'ativo') {
    acoes.append(botao('Suspender', 'btn-secondary', () => agir('POST', `${url}/suspender`, undefined,
      `Suspender ${m.email}? As sessões dela caem na hora.`)));
  }
  if (m.estado === 'suspenso') {
    acoes.append(botao('Reativar', 'btn-secondary', async () => {
      // Owner reativado precisa da chave das coleções criadas enquanto estava suspenso (D13).
      if (m.papel !== 'owner') return agir('POST', `${url}/reativar`);
      try {
        await agir('POST', `${url}/reativar`, { envelopes: await envelopesOwner(m, { soFaltantes: true }) });
      } catch (e) {
        falhaEnvelopes(aviso, e);
      }
    }));
  }
  if (m.estado === 'ativo' && m.papel !== 'owner' && eu.papel === 'owner') {
    acoes.append(botao('Tornar owner', 'btn-secondary', async () => {
      if (!window.confirm(`Tornar ${m.email} owner? Owner recebe acesso de gerência a TODAS as coleções.`)) return;
      try {
        await agir('PUT', `${url}/papel`, { papel: 'owner', envelopes: await envelopesOwner(m) });
      } catch (e) {
        falhaEnvelopes(aviso, e);
      }
    }));
  }
  if (['ativo', 'suspenso'].includes(m.estado)) { // aceito: confirmar primeiro
    const outro = m.papel === 'admin' ? 'member' : 'admin'; // owner é rebaixado a admin; promoção acima
    acoes.append(botao(`Tornar ${outro}`, 'btn-secondary', () => agir('PUT', `${url}/papel`, { papel: outro },
      `Mudar o papel de ${m.email} para ${outro}?`)));
  }
  acoes.append(botao('Remover', 'btn-danger-outline', async () => {
    if (!window.confirm(`Remover ${m.email}? O acesso é cortado, as coleções dela pedem rotação e o nome/e-mail são anonimizados. Não dá para desfazer.`)) return;
    try {
      const r = await api('DELETE', url);
      await recarregar();
      mostrarRelatorio(document.getElementById('relatorio-saida') ?? relatorio, m, r.relatorio);
    } catch (e) {
      falhou(aviso, e);
    }
  }));
  return li;
}

/** Confirmação aceito → ativo: fingerprint calculado aqui da chave pública × o que a pessoa dita. */
async function conferir(li, m, aviso, recarregar) {
  let calculado;
  try {
    calculado = await fingerprintDoMembro(m);
  } catch {
    aviso.className = 'status status-danger';
    aviso.textContent = 'A chave pública recebida do servidor é inválida. Não confirme esta pessoa.';
    return;
  }
  const ditado = el('input', { required: true, autocomplete: 'off', spellcheck: 'false', maxlength: 80 });
  const erro = el('p', { class: 'status status-danger', role: 'alert' });
  const botao = el('button', { type: 'submit', class: 'btn btn-primary' }, 'Confirmar');
  async function enviar(ev) {
    ev.preventDefault();
    if (!fingerprintConfere(ditado.value, calculado)) {
      erro.textContent = 'Não confere. Não ative esta conta: a chave pública pode ter sido trocada. Confira de novo com a pessoa.';
      return;
    }
    botao.disabled = true;
    try {
      await api('POST', `/membros/${encodeURIComponent(m.id)}/confirmar`, { fingerprint: calculado });
      recarregar();
    } catch (e) {
      falhou(erro, e);
      botao.disabled = false;
    }
  }
  li.append(el('form', { class: 'form', onsubmit: enviar },
    el('p', {}, 'Fingerprint calculado neste navegador a partir da chave pública de ', el('strong', {}, m.email), ':'),
    el('div', { class: 'code-block fingerprint' }, el('code', {}, calculado)),
    el('p', { class: 'muted' },
      'Peça para a pessoa ler o fingerprint mostrado em "Minha conta" dela, por voz ou chat (fora deste sistema), e digite o que ela ditar.'),
    el('label', { class: 'field' }, 'Fingerprint ditado pela pessoa', ditado), el('div', { class: 'form-actions' }, botao), erro));
  ditado.focus();
}
