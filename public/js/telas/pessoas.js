// #/pessoas (owner/admin): membros da organização, convite, confirmação por fingerprint,
// suspender/reativar, papel admin↔member e remoção.
import { api, ErroApi, mensagem } from '../api.js';
import { el, trocar } from '../dom.js';
import { estado } from '../estado.js';
import { fingerprintConfere, fingerprintDoMembro } from '../fluxos.js';
import { sair } from '../sessao.js';

function falhou(aviso, e) {
  if (e instanceof ErroApi && e.codigo === 'nao_autenticado') return sair(mensagem(e));
  aviso.className = 'error-msg';
  aviso.textContent = e instanceof ErroApi ? mensagem(e) : 'Não foi possível concluir a ação.';
}

export async function telaPessoas(app) {
  const eu = estado.usuario;
  if (!eu) return location.replace('#/login');
  const voltar = el('p', {}, el('a', { href: '#/conta' }, '← Minha conta'));
  if (!['owner', 'admin'].includes(eu.papel)) {
    return trocar(app, el('h1', {}, 'Pessoas'), voltar, el('p', { class: 'error-msg' }, mensagem(new ErroApi(403, 'sem_permissao'))));
  }
  const aviso = el('p', { class: 'muted', role: 'status' });
  let membros;
  try {
    membros = await api('GET', '/membros');
  } catch (e) {
    trocar(app, el('h1', {}, 'Pessoas'), voltar, aviso);
    return falhou(aviso, e);
  }
  const recarregar = () => telaPessoas(app);
  const linhas = await Promise.all(membros.map((m) => linhaMembro(m, eu, aviso, recarregar)));
  trocar(app, el('h1', {}, 'Pessoas'), voltar,
    secaoConvite(recarregar),
    el('section', { class: 'card' }, el('h2', {}, 'Membros'), aviso, el('ul', { class: 'secret-list' }, ...linhas)));
}

// ---------- Convite ----------

function secaoConvite(recarregar) {
  const email = el('input', { type: 'email', required: true, autocomplete: 'off' });
  const papel = el('select', {}, el('option', { value: 'member' }, 'member'), el('option', { value: 'admin' }, 'admin'));
  const botao = el('button', { type: 'submit', class: 'btn btn-primary' }, 'Convidar');
  const aviso = el('p', { class: 'muted', role: 'status' });
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
        el('div', { class: 'id-display' }, el('code', {}, link),
          el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => navigator.clipboard?.writeText(link).catch(() => {}) }, 'Copiar')),
        el('button', { type: 'button', class: 'btn btn-secondary', onclick: recarregar }, 'Entreguei o link'));
    } catch (e) {
      falhou(aviso, e);
    } finally {
      botao.disabled = false;
    }
  }
  return el('section', { class: 'card' }, el('h2', {}, 'Convidar pessoa'),
    el('form', { class: 'form', onsubmit: convidar }, el('label', {}, 'E-mail', email), el('label', {}, 'Papel', papel), botao, aviso),
    resultado);
}

// ---------- Um membro ----------

async function linhaMembro(m, eu, aviso, recarregar) {
  const souEu = m.id === eu.id;
  const podeMexer = !souEu && (m.papel !== 'owner' || eu.papel === 'owner');
  const acoes = el('div', { class: 'secret-item-actions' });
  const li = el('li', { class: 'secret-item' },
    el('div', { class: 'secret-item-main' },
      el('div', { class: 'secret-item-info' },
        el('span', { class: 'secret-item-title' }, `${m.nome ?? '(sem nome)'}${souEu ? ' (você)' : ''}`),
        el('span', { class: 'secret-item-sub' }, `${m.email} · ${m.papel} · ${m.estado}`)),
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
  if (m.estado === 'suspenso') acoes.append(botao('Reativar', 'btn-secondary', () => agir('POST', `${url}/reativar`)));
  if (['ativo', 'suspenso'].includes(m.estado)) { // aceito: confirmar primeiro
    const outro = m.papel === 'admin' ? 'member' : 'admin'; // owner só é rebaixado (promoção: Fase 7)
    acoes.append(botao(`Tornar ${outro}`, 'btn-secondary', () => agir('PUT', `${url}/papel`, { papel: outro },
      `Mudar o papel de ${m.email} para ${outro}?`)));
  }
  acoes.append(botao('Remover', 'btn-danger', () => agir('DELETE', url, undefined,
    `Remover ${m.email}? O acesso é cortado e o nome/e-mail são anonimizados. Não dá para desfazer.`)));
  return li;
}

/** Confirmação aceito → ativo: fingerprint calculado aqui da chave pública × o que a pessoa dita. */
async function conferir(li, m, aviso, recarregar) {
  let calculado;
  try {
    calculado = await fingerprintDoMembro(m);
  } catch {
    aviso.className = 'error-msg';
    aviso.textContent = 'A chave pública recebida do servidor é inválida. Não confirme esta pessoa.';
    return;
  }
  const ditado = el('input', { required: true, autocomplete: 'off', spellcheck: 'false', maxlength: 80 });
  const erro = el('p', { class: 'error-msg', role: 'alert' });
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
    el('div', { class: 'id-display' }, el('code', {}, calculado)),
    el('p', { class: 'muted' },
      'Peça para a pessoa ler o fingerprint mostrado em "Minha conta" dela, por voz ou chat (fora deste sistema), e digite o que ela ditar.'),
    el('label', {}, 'Fingerprint ditado pela pessoa', ditado), botao, erro));
  ditado.focus();
}
