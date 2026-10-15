// #/convite/<token>: consulta o convite, define a senha-mestra, gera as chaves, exibe o kit e aceita.
import { api, mensagem } from '../api.js';
import { validarSenhaMestra } from '../cripto.js';
import { baixarTexto, el, trocar } from '../dom.js';
import { definir } from '../estado.js';
import { montarAceite, textoKit } from '../fluxos.js';

const pintar = () => new Promise((ok) => setTimeout(ok, 50)); // deixa o aviso aparecer antes do KDF (D7)
const campo = (rotulo, input) => el('label', {}, rotulo, input);

export async function telaConvite(app, token) {
  trocar(app, el('p', { class: 'muted' }, 'Consultando convite…'));
  let convite;
  try {
    convite = await api('POST', '/convites/consultar', { token });
  } catch (e) {
    trocar(app, el('h1', {}, 'Convite'), el('p', { class: 'error-msg', role: 'alert' }, mensagem(e)));
    return;
  }

  const nome = el('input', { name: 'nome', required: true, maxlength: 100, autocomplete: 'name' });
  const senha = el('input', { type: 'password', required: true, autocomplete: 'new-password' });
  const conf = el('input', { type: 'password', required: true, autocomplete: 'new-password' });
  const aviso = el('p', { class: 'muted', role: 'status' });
  const botao = el('button', { type: 'submit', class: 'btn btn-primary' }, 'Gerar minhas chaves');

  async function enviar(ev) {
    ev.preventDefault();
    aviso.className = 'muted';
    if (!validarSenhaMestra(senha.value)) {
      aviso.className = 'error-msg';
      aviso.textContent = 'A senha-mestra precisa de pelo menos 12 caracteres.';
      return;
    }
    if (senha.value !== conf.value) {
      aviso.className = 'error-msg';
      aviso.textContent = 'A confirmação não confere com a senha-mestra.';
      return;
    }
    botao.disabled = true;
    aviso.textContent = 'Derivando chave e gerando suas chaves…';
    await pintar();
    try {
      const gerado = await montarAceite({ token, nome: nome.value.trim(), senha: senha.value, usuarioId: convite.usuario_id });
      mostrarKit(app, convite, gerado);
    } catch {
      aviso.className = 'error-msg';
      aviso.textContent = 'Não foi possível gerar as chaves neste navegador.';
      botao.disabled = false;
    } finally {
      senha.value = '';
      conf.value = '';
    }
  }

  trocar(
    app,
    el('h1', {}, 'Aceitar convite'),
    el('p', {}, `${convite.org_nome} convidou ${convite.email} (${convite.papel}).`),
    el('p', { class: 'muted' }, 'A senha-mestra nunca sai deste navegador: o servidor não consegue recuperá-la. Mínimo de 12 caracteres.'),
    el('form', { class: 'form', onsubmit: enviar },
      campo('Seu nome', nome), campo('Senha-mestra', senha), campo('Confirme a senha-mestra', conf), botao, aviso),
  );
}

function mostrarKit(app, convite, { corpo, recoveryKey, fingerprint }) {
  const texto = textoKit({ orgNome: convite.org_nome, email: convite.email, recoveryKey, fingerprint });
  const erro = el('p', { class: 'error-msg', role: 'alert' });
  const concluir = el('button', { type: 'button', class: 'btn btn-primary', disabled: true, onclick: aceitar }, 'Concluir cadastro');
  const guardei = el('input', { type: 'checkbox', onchange: () => { concluir.disabled = !guardei.checked; } });

  async function aceitar() {
    concluir.disabled = true;
    try {
      await api('POST', '/convites/aceitar', corpo);
      definir({ aviso: 'Cadastro concluído. Entre com sua senha-mestra.' });
      location.replace('#/login'); // tira o token do histórico da aba
    } catch (e) {
      erro.textContent = mensagem(e);
      concluir.disabled = !guardei.checked;
    }
  }

  trocar(
    app,
    el('h1', {}, 'Kit de emergência'),
    el('div', { class: 'alert alert-warning' },
      'Esta Recovery Key aparece só agora. Ela é a única forma de recuperar a conta se você esquecer a senha-mestra. Baixe o kit e guarde fora do computador.'),
    el('div', { class: 'id-display' }, el('code', {}, recoveryKey)),
    el('p', { class: 'muted' }, `Fingerprint da sua chave pública: ${fingerprint}`),
    el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => baixarTexto('cofre-kit-emergencia.txt', texto) },
      'Baixar kit (.txt)'),
    el('label', { class: 'checkbox-label' }, guardei, 'Guardei o kit de emergência em local seguro'),
    concluir,
    erro,
  );
}
