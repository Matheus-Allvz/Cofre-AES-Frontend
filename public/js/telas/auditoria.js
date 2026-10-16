// #/auditoria (owner/admin, RF-A06): eventos da organização com filtros (tipo, pessoa, alvo, período)
// e paginação por cursor (antes_de_id = id do último evento recebido). Tudo por textContent (dom.js).
import { api, ErroApi, mensagem } from '../api.js';
import { el, trocar } from '../dom.js';
import { estado } from '../estado.js';
import { sair } from '../sessao.js';

const LIMITE = 50;
// §5.6 da arquitetura: sugestões do campo "tipo" (o servidor aceita qualquer tipo no formato a.b).
export const TIPOS_EVENTO = Object.freeze([
  'auth.login', 'auth.logout', 'auth.bloqueio', 'auth.mfa', 'auth.senha_trocada', 'auth.recuperacao', 'auth.sessao_revogada',
  'mfa.ativado', 'mfa.desativado', 'mfa.codigo_recuperacao_usado', 'convite.criado', 'convite.revogado', 'convite.aceito',
  'membro.confirmado', 'membro.suspenso', 'membro.reativado', 'membro.removido', 'membro.papel_alterado', 'politica.alterada',
  'colecao.criada', 'colecao.renomeada', 'colecao.excluida', 'colecao.membro_adicionado', 'colecao.permissao_alterada',
  'colecao.membro_removido', 'colecao.rotacao_iniciada', 'colecao.rotacionada', 'item.criado', 'item.editado', 'item.revelado',
  'item.versao_revelada', 'item.copiado', 'item.excluido', 'item.restaurado', 'item.purgado', 'org.criada', 'requisicao.recusada',
]);

const quando = (iso) => new Date(iso).toLocaleString('pt-BR');

/** Filtros do formulário → query string de GET /auditoria (só os preenchidos; datas em ISO). */
export function consulta(filtros, antesDeId = null) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) {
    const t = String(v ?? '').trim();
    if (!t) continue;
    q.set(k, k === 'de' || k === 'ate' ? new Date(t).toISOString() : t);
  }
  if (antesDeId) q.set('antes_de_id', String(antesDeId));
  q.set('limite', String(LIMITE));
  return `/auditoria?${q}`;
}

export async function telaAuditoria(app) {
  const eu = estado.usuario;
  if (!eu) return location.replace('#/login');
  const titulo = el('div', { class: 'page-header' }, el('h1', {}, 'Auditoria')); // navegação na topbar (casca.js)
  if (!['owner', 'admin'].includes(eu.papel)) {
    return trocar(app, titulo, el('p', { class: 'alert alert-danger' }, mensagem(new ErroApi(403, 'sem_permissao'))));
  }
  const aviso = el('p', { class: 'status', role: 'status' });
  let pessoas = [];
  try {
    pessoas = await api('GET', '/membros');
  } catch (e) {
    if (e instanceof ErroApi && e.codigo === 'nao_autenticado') return sair(mensagem(e));
  }
  const nomes = new Map(pessoas.map((p) => [p.id, p.email]));
  const campos = {
    tipo: el('input', { list: 'tipos-evento', autocomplete: 'off', placeholder: 'ex.: item.revelado', 'aria-label': 'Tipo' }),
    ator_id: el('select', { 'aria-label': 'Pessoa' }, el('option', { value: '' }, 'Todas'),
      ...pessoas.map((p) => el('option', { value: p.id }, `${p.nome ?? '(sem nome)'} <${p.email}>`))),
    alvo_id: el('input', { autocomplete: 'off', placeholder: 'id do item, coleção ou pessoa', 'aria-label': 'Alvo' }),
    de: el('input', { type: 'datetime-local', 'aria-label': 'De' }),
    ate: el('input', { type: 'datetime-local', 'aria-label': 'Até' }),
  };
  const corpo = el('tbody');
  const mais = el('button', { type: 'button', class: 'btn btn-secondary', hidden: true }, 'Mais antigos');
  let cursor = null;

  const linha = (e) => el('tr', {},
    el('td', { class: 'num' }, String(e.id)), el('td', { class: 'nowrap' }, quando(e.em)), el('td', {}, e.tipo),
    el('td', {}, el('span', { class: e.resultado === 'ok' ? 'badge badge-success' : 'badge badge-danger' }, e.resultado)),
    el('td', {}, e.ator_id ? (nomes.get(e.ator_id) ?? e.ator_id) : '—'),
    el('td', {}, e.alvo_id ? `${e.alvo_tipo ?? ''} ${nomes.get(e.alvo_id) ?? e.alvo_id}`.trim() : '—'),
    el('td', {}, e.ip ?? '—'),
    el('td', {}, el('code', {}, Object.keys(e.meta ?? {}).length ? JSON.stringify(e.meta) : '')));

  async function carregar(novo) {
    const filtros = Object.fromEntries(Object.entries(campos).map(([k, c]) => [k, c.value]));
    if (novo) cursor = null;
    mais.disabled = true;
    try {
      const eventos = await api('GET', consulta(filtros, cursor));
      if (novo) trocar(corpo);
      corpo.append(...eventos.map(linha));
      cursor = eventos.at(-1)?.id ?? cursor;
      mais.hidden = eventos.length < LIMITE;
      aviso.className = 'status';
      aviso.textContent = corpo.childElementCount ? `${corpo.childElementCount} evento(s).` : 'Nenhum evento com esses filtros.';
    } catch (e) {
      if (e instanceof ErroApi && e.codigo === 'nao_autenticado') return sair(mensagem(e));
      aviso.className = 'status status-danger';
      aviso.textContent = e instanceof ErroApi ? mensagem(e) : 'Não foi possível carregar a auditoria.';
    } finally {
      mais.disabled = false;
    }
  }
  mais.addEventListener('click', () => carregar(false));
  const form = el('form', { class: 'form form-wide', onsubmit: (ev) => { ev.preventDefault(); carregar(true); } },
    el('datalist', { id: 'tipos-evento' }, ...TIPOS_EVENTO.map((t) => el('option', { value: t }))),
    el('div', { class: 'form-grid' },
      el('label', { class: 'field' }, 'Tipo', campos.tipo), el('label', { class: 'field' }, 'Pessoa', campos.ator_id),
      el('label', { class: 'field' }, 'Alvo', campos.alvo_id),
      el('label', { class: 'field' }, 'De', campos.de), el('label', { class: 'field' }, 'Até', campos.ate)),
    el('div', { class: 'form-actions' }, el('button', { type: 'submit', class: 'btn btn-primary' }, 'Filtrar')));
  trocar(app, titulo,
    el('section', { class: 'card' }, form),
    el('section', { class: 'card' }, aviso,
      el('div', { class: 'table-wrap', tabindex: 0, role: 'region', 'aria-label': 'Eventos de auditoria' }, el('table', { id: 'auditoria', class: 'table' },
        el('thead', {}, el('tr', {}, ...['#', 'Quando', 'Tipo', 'Resultado', 'Quem', 'Alvo', 'IP', 'Detalhes'].map((t) => el('th', {}, t)))),
        corpo)),
      el('div', { class: 'action-bar' }, mais)));
  await carregar(true);
}
