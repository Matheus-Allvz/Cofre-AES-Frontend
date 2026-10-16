// #/login: prelogin → KDF (aviso "Derivando chave…") → login [→ código MFA] → abre userKey e chave privada.
import { api, ErroApi, mensagem } from '../api.js';
import { el, trocar } from '../dom.js';
import { definir, estado } from '../estado.js';
import { abrirChaves, prepararLogin } from '../fluxos.js';
import { iniciarSessao } from '../sessao.js';

const pintar = () => new Promise((ok) => setTimeout(ok, 50)); // D7

/** 6 dígitos = TOTP do app; o resto vai como código de recuperação. */
export function segundoFator(codigo) {
  const v = codigo.trim();
  if (!v) return {};
  return /^\d{6}$/.test(v) ? { totp: v } : { codigo_recuperacao: v };
}

export function telaLogin(app) {
  const email = el('input', { type: 'email', required: true, autocomplete: 'username' });
  const senha = el('input', { type: 'password', required: true, autocomplete: 'current-password' });
  const codigo = el('input', { inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 16 });
  const campoCodigo = el('label', { class: 'field', hidden: true }, 'Código do app autenticador (ou código de recuperação)', codigo);
  const aviso = el('p', { class: estado.aviso ? 'status status-success' : 'status', role: 'status' }, estado.aviso);
  const botao = el('button', { type: 'submit', class: 'btn btn-primary' }, 'Entrar');
  definir({ aviso: null });
  let derivado = null; // { corpo, kek } entre a senha e o código do MFA

  function recomecar() {
    derivado = null;
    email.disabled = senha.disabled = false;
    campoCodigo.hidden = true;
    codigo.value = '';
  }

  async function entrar(ev) {
    ev.preventDefault();
    botao.disabled = true;
    aviso.className = 'status';
    try {
      if (!derivado) {
        aviso.className = 'status status-busy';
        aviso.textContent = 'Derivando chave…';
        await pintar();
        const pre = await api('POST', '/prelogin', { email: email.value });
        derivado = await prepararLogin(email.value, senha.value, pre);
      }
      const resp = await api('POST', '/login', { ...derivado.corpo, ...segundoFator(codigo.value) });
      iniciarSessao(resp, await abrirChaves(resp, derivado.kek));
      derivado = null;
      location.hash = resp.usuario.estado === 'ativo' && !resp.mfa_pendente ? '#/cofre' : '#/conta';
    } catch (e) {
      aviso.className = 'status status-danger';
      aviso.textContent = e instanceof ErroApi ? mensagem(e) : 'Não foi possível abrir as chaves da conta.';
      if (e instanceof ErroApi && ['mfa_requerido', 'mfa_invalido'].includes(e.codigo)) {
        email.disabled = senha.disabled = true; // a senha já foi derivada; só falta o código
        campoCodigo.hidden = false;
        codigo.value = '';
        codigo.focus();
      } else {
        recomecar();
      }
    } finally {
      senha.value = '';
      botao.disabled = false;
    }
  }

  trocar(
    app,
    el('div', { class: 'page-header' }, el('h1', {}, 'Entrar')),
    el('section', { class: 'card' },
      el('form', { class: 'form', onsubmit: entrar },
        el('label', { class: 'field' }, 'E-mail', email), el('label', { class: 'field' }, 'Senha-mestra', senha), campoCodigo,
        el('div', { class: 'form-actions' }, botao), aviso)),
    el('p', {}, el('a', { class: 'back-link', href: '#/recuperar' }, 'Esqueci a senha-mestra: usar o kit de emergência')),
  );
}
