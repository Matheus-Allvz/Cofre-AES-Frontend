// #/conta: dados da conta, troca de senha-mestra e logout.
import { api, ErroApi, mensagem } from '../api.js';
import { fingerprint } from '../cripto.js';
import { el, trocar } from '../dom.js';
import { definir, estado, limpar } from '../estado.js';
import { montarTrocaSenha } from '../fluxos.js';

const pintar = () => new Promise((ok) => setTimeout(ok, 50)); // D7

/** Logout = revoga no servidor e descarta as chaves da memória (D16). */
export async function sair(aviso = null) {
  try {
    await api('POST', '/logout');
  } catch {
    // Sessão já inválida: o descarte local basta.
  }
  limpar();
  definir({ aviso });
  location.replace('#/login');
}

export async function telaConta(app) {
  if (!estado.usuario) {
    location.replace('#/login');
    return;
  }
  const u = estado.usuario;
  const atual = el('input', { type: 'password', required: true, autocomplete: 'current-password' });
  const nova = el('input', { type: 'password', required: true, autocomplete: 'new-password' });
  const conf = el('input', { type: 'password', required: true, autocomplete: 'new-password' });
  const aviso = el('p', { class: 'muted', role: 'status' });
  const botao = el('button', { type: 'submit', class: 'btn btn-primary' }, 'Trocar senha-mestra');

  async function trocarSenha(ev) {
    ev.preventDefault();
    aviso.className = 'error-msg';
    if (nova.value !== conf.value) {
      aviso.textContent = 'A confirmação não confere com a nova senha-mestra.';
      return;
    }
    botao.disabled = true;
    aviso.className = 'muted';
    aviso.textContent = 'Derivando chaves…';
    await pintar();
    try {
      const perfil = await api('GET', '/eu');
      await api('POST', '/eu/senha', await montarTrocaSenha({ perfil, senhaAtual: atual.value, senhaNova: nova.value }));
      aviso.className = 'ok';
      aviso.textContent = 'Senha-mestra trocada. As outras sessões foram encerradas.';
    } catch (e) {
      if (e instanceof ErroApi && e.status === 401 && e.codigo === 'nao_autenticado') return sair(mensagem(e));
      aviso.className = 'error-msg';
      aviso.textContent = e instanceof ErroApi ? mensagem(e)
        : e.message === 'senha_curta' ? 'A nova senha-mestra precisa de pelo menos 12 caracteres.'
          : e.message === 'senha_atual_incorreta' ? 'Senha-mestra atual incorreta.'
            : 'Não foi possível trocar a senha-mestra.';
    } finally {
      botao.disabled = false;
      atual.value = nova.value = conf.value = '';
    }
  }

  trocar(
    app,
    el('h1', {}, 'Minha conta'),
    el('section', { class: 'card' },
      el('p', {}, `${u.nome} · ${u.email}`),
      el('p', { class: 'muted' }, `Papel: ${u.papel} · Estado: ${u.estado}`),
      u.estado === 'aceito' ? el('p', { class: 'muted' }, 'Aguardando o administrador conferir seu fingerprint para ativar a conta.') : null,
      el('p', { class: 'muted' }, `Fingerprint: ${await fingerprint(estado.publica)}`),
      el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => sair() }, 'Sair')),
    el('section', { class: 'card' },
      el('h2', {}, 'Trocar senha-mestra'),
      el('form', { class: 'form', onsubmit: trocarSenha },
        el('label', {}, 'Senha-mestra atual', atual),
        el('label', {}, 'Nova senha-mestra (mínimo 12 caracteres)', nova),
        el('label', {}, 'Confirme a nova senha-mestra', conf),
        botao, aviso)),
  );
}
