// #/recuperar: kit de emergência (+ MFA) → nova senha-mestra e kit NOVO (RF-U06).
import { api, ErroApi, mensagem } from '../api.js';
import { validarSenhaMestra } from '../cripto.js';
import { baixarTexto, el, trocar } from '../dom.js';
import { definir } from '../estado.js';
import { montarConclusao, prepararRecuperacao, textoKit } from '../fluxos.js';
import { segundoFator } from './login.js';

const pintar = () => new Promise((ok) => setTimeout(ok, 50)); // D7

export function telaRecuperar(app) {
  const email = el('input', { type: 'email', required: true, autocomplete: 'username' });
  const kit = el('input', { required: true, autocomplete: 'off', spellcheck: 'false', placeholder: 'XXXX-XXXX-…' });
  const codigo = el('input', { inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 16 });
  const senha = el('input', { type: 'password', required: true, autocomplete: 'new-password' });
  const conf = el('input', { type: 'password', required: true, autocomplete: 'new-password' });
  const aviso = el('p', { class: 'status', role: 'status' });
  const botao = el('button', { type: 'submit', class: 'btn btn-primary' }, 'Recuperar acesso');

  async function enviar(ev) {
    ev.preventDefault();
    aviso.className = 'status status-danger';
    if (!validarSenhaMestra(senha.value)) {
      aviso.textContent = 'A nova senha-mestra precisa de pelo menos 12 caracteres.';
      return;
    }
    if (senha.value !== conf.value) {
      aviso.textContent = 'A confirmação não confere com a nova senha-mestra.';
      return;
    }
    botao.disabled = true;
    aviso.className = 'status status-busy';
    aviso.textContent = 'Conferindo o kit…';
    let rk;
    try {
      const preparo = await prepararRecuperacao(kit.value);
      rk = preparo.rk;
      const corpo = { email: email.value, recup_auth: preparo.recupAuth, ...segundoFator(codigo.value) };
      const resp = await api('POST', '/recuperar/iniciar', corpo);
      aviso.textContent = 'Derivando chaves…';
      await pintar();
      mostrarKitNovo(app, email.value, await montarConclusao({ resp, rk, senhaNova: senha.value }));
    } catch (e) {
      rk?.fill(0);
      aviso.className = 'status status-danger';
      aviso.textContent = e instanceof ErroApi ? mensagem(e)
        : e.message === 'recovery_key_invalida' ? 'Recovery Key inválida: confira as 52 letras e números do kit.'
          : 'Não foi possível recuperar a conta com este kit.';
      botao.disabled = false;
    } finally {
      senha.value = conf.value = codigo.value = '';
    }
  }

  trocar(
    app,
    el('div', { class: 'page-header' }, el('h1', {}, 'Recuperar acesso')),
    el('p', { class: 'muted' }, 'Use a Recovery Key do kit de emergência. Se a conta tem MFA, informe também o código do app (ou um código de recuperação). Um kit novo será gerado e o antigo deixa de valer; todas as sessões são encerradas.'),
    el('section', { class: 'card' },
      el('form', { class: 'form', onsubmit: enviar },
        el('label', { class: 'field' }, 'E-mail', email),
        el('label', { class: 'field' }, 'Recovery Key', kit),
        el('label', { class: 'field' }, 'Código do app autenticador (se tiver MFA)', codigo),
        el('label', { class: 'field' }, 'Nova senha-mestra (mínimo 12 caracteres)', senha),
        el('label', { class: 'field' }, 'Confirme a nova senha-mestra', conf),
        el('div', { class: 'form-actions' }, botao), aviso)),
    el('p', {}, el('a', { class: 'back-link', href: '#/login' }, 'Voltar ao login')),
  );
}

function mostrarKitNovo(app, email, { corpo, recoveryKey }) {
  const texto = textoKit({ email, recoveryKey });
  const erro = el('p', { class: 'status status-danger', role: 'alert' });
  const concluir = el('button', { type: 'button', class: 'btn btn-primary', disabled: true, onclick: enviar }, 'Concluir recuperação');
  const guardei = el('input', { type: 'checkbox', onchange: () => { concluir.disabled = !guardei.checked; } });

  async function enviar() {
    concluir.disabled = true;
    try {
      await api('POST', '/recuperar/concluir', corpo);
      definir({ aviso: 'Acesso recuperado. Entre com a nova senha-mestra.' });
      location.replace('#/login');
    } catch (e) {
      erro.textContent = mensagem(e);
      concluir.disabled = !guardei.checked;
    }
  }

  trocar(
    app,
    el('div', { class: 'page-header' }, el('h1', {}, 'Novo kit de emergência')),
    el('section', { class: 'card' },
      el('div', { class: 'alert alert-warning' },
        'O kit anterior deixa de valer ao concluir. Esta nova Recovery Key aparece só agora: baixe e guarde fora do computador. Conclua em até 5 minutos.'),
      el('div', { class: 'kit' }, recoveryKey),
      el('div', { class: 'action-bar' },
        el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => baixarTexto('cofre-kit-emergencia.txt', texto) }, 'Baixar kit (.txt)')),
      el('label', { class: 'checkbox' }, guardei, 'Guardei o novo kit de emergência em local seguro'),
      el('div', { class: 'form-actions' }, concluir),
      erro),
  );
}
