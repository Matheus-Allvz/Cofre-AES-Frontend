// #/login: prelogin → KDF (aviso "Derivando chave…") → login → abre userKey e chave privada.
import { api, ErroApi, mensagem } from '../api.js';
import { el, trocar } from '../dom.js';
import { definir, estado } from '../estado.js';
import { abrirChaves, prepararLogin } from '../fluxos.js';

const pintar = () => new Promise((ok) => setTimeout(ok, 50)); // D7

export function telaLogin(app) {
  const email = el('input', { type: 'email', required: true, autocomplete: 'username' });
  const senha = el('input', { type: 'password', required: true, autocomplete: 'current-password' });
  const aviso = el('p', { class: estado.aviso ? 'ok' : 'muted', role: 'status' }, estado.aviso);
  const botao = el('button', { type: 'submit', class: 'btn btn-primary' }, 'Entrar');
  definir({ aviso: null });

  async function entrar(ev) {
    ev.preventDefault();
    botao.disabled = true;
    aviso.className = 'muted';
    aviso.textContent = 'Derivando chave…';
    await pintar();
    try {
      const pre = await api('POST', '/prelogin', { email: email.value });
      const { corpo, kek } = await prepararLogin(email.value, senha.value, pre);
      const resp = await api('POST', '/login', corpo);
      definir({ usuario: resp.usuario, ...(await abrirChaves(resp, kek)) });
      location.hash = '#/conta';
    } catch (e) {
      aviso.className = 'error-msg';
      aviso.textContent = e instanceof ErroApi ? mensagem(e) : 'Não foi possível abrir as chaves da conta.';
      botao.disabled = false;
    } finally {
      senha.value = '';
    }
  }

  trocar(
    app,
    el('h1', {}, 'Entrar'),
    el('form', { class: 'form', onsubmit: entrar },
      el('label', {}, 'E-mail', email), el('label', {}, 'Senha-mestra', senha), botao, aviso),
  );
}
