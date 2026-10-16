// #/conta: dados da conta, MFA, sessões ativas, política (owner/admin), troca de senha-mestra e logout.
import { api, ErroApi, mensagem } from '../api.js';
import { fingerprint } from '../cripto.js';
import { baixarTexto, el, trocar } from '../dom.js';
import { estado } from '../estado.js';
import { authHashDaSenha, montarTrocaSenha, textoCodigosMfa } from '../fluxos.js';
import { sair } from '../sessao.js';
import { selo, TOM_ESTADO, TOM_PAPEL } from '../casca.js';

const pintar = () => new Promise((ok) => setTimeout(ok, 50)); // D7
const senhaInput = (auto = 'current-password') => el('input', { type: 'password', required: true, autocomplete: auto });
const codigoInput = () => el('input', { inputmode: 'numeric', autocomplete: 'one-time-code', required: true, maxlength: 16 });
const quando = (iso) => new Date(iso).toLocaleString('pt-BR');

/** Erro de API → texto no `aviso`; sessão que caiu volta ao login. */
function falhou(aviso, e, texto = 'Não foi possível concluir a ação.') {
  if (e instanceof ErroApi && e.codigo === 'nao_autenticado') return sair(mensagem(e));
  aviso.className = 'status status-danger';
  aviso.textContent = e instanceof ErroApi ? mensagem(e) : texto;
}

function copiar(texto) {
  return el('button', {
    type: 'button',
    class: 'btn btn-secondary btn-sm',
    onclick: () => navigator.clipboard?.writeText(texto).catch(() => {}),
  }, 'Copiar');
}

export async function telaConta(app) {
  if (!estado.usuario) {
    location.replace('#/login');
    return;
  }
  let perfil;
  try {
    perfil = await api('GET', '/eu');
  } catch (e) {
    return sair(e instanceof ErroApi ? mensagem(e) : null);
  }
  const u = perfil.usuario;
  const recarregar = () => telaConta(app);
  const gestor = u.estado === 'ativo' && ['owner', 'admin'].includes(u.papel);

  const cabecalho = el('section', { class: 'card' },
    el('p', {}, `${u.nome} · ${u.email}`),
    el('p', { class: 'muted' }, 'Papel: ', selo(TOM_PAPEL, u.papel), ' · Estado: ', selo(TOM_ESTADO, u.estado)),
    u.estado === 'aceito' ? el('p', { class: 'alert alert-info' }, 'Aguardando o administrador conferir seu fingerprint para ativar a conta.') : null,
    el('p', { class: 'muted' }, 'Seu fingerprint (dite ao administrador quando ele pedir, por voz ou chat):'),
    el('div', { class: 'code-block fingerprint' }, el('code', {}, await fingerprint(estado.publica))),
    el('div', { class: 'cluster' },
      u.estado === 'ativo' ? el('a', { class: 'back-link', href: '#/cofre' }, 'Cofre →') : null,
      gestor ? el('a', { class: 'back-link', href: '#/pessoas' }, 'Pessoas da organização →') : null,
      gestor ? el('a', { class: 'back-link', href: '#/auditoria' }, 'Auditoria →') : null),
    el('div', { class: 'action-bar' }, el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => sair() }, 'Sair')));

  if (perfil.mfa_pendente) {
    // Política exige MFA: o servidor só libera /eu, /eu/mfa/* e /logout até configurar.
    trocar(app, el('div', { class: 'page-header' }, el('h1', {}, 'Minha conta')), cabecalho,
      el('div', { class: 'alert alert-warning', role: 'alert' }, 'A política da organização exige MFA. Configure o app autenticador para continuar.'),
      secaoMfa(perfil, recarregar));
    return;
  }
  trocar(app, el('div', { class: 'page-header' }, el('h1', {}, 'Minha conta')), cabecalho,
    secaoMfa(perfil, recarregar),
    await secaoSessoes(),
    await secaoMeusEventos(),
    gestor ? await secaoPolitica() : null,
    secaoSenha(perfil));
}

// ---------- MFA ----------

function secaoMfa(perfil, recarregar) {
  const sec = el('section', { class: 'card' }, el('h2', {}, 'Verificação em duas etapas (MFA)'));
  const aviso = el('p', { class: 'status', role: 'status' });
  if (!perfil.mfa_ativo) {
    const botao = el('button', { type: 'button', class: 'btn btn-primary', onclick: iniciar }, 'Configurar app autenticador');
    sec.append(el('p', { class: 'muted' }, 'MFA desativado.'), botao, aviso);

    async function iniciar() {
      botao.disabled = true;
      try {
        const { segredo_base32: segredo, otpauth_uri: uri } = await api('POST', '/eu/mfa/iniciar');
        const codigo = codigoInput();
        const confirmar = el('button', { type: 'submit', class: 'btn btn-primary' }, 'Confirmar código');
        async function enviar(ev) {
          ev.preventDefault();
          confirmar.disabled = true;
          try {
            const { codigos_recuperacao: codigos } = await api('POST', '/eu/mfa/confirmar', { codigo: codigo.value.trim() });
            mostrarCodigos(sec, perfil.usuario.email, codigos, recarregar);
          } catch (e) {
            falhou(aviso, e);
            confirmar.disabled = false;
          }
        }
        sec.replaceChildren(
          el('h2', {}, 'Configurar app autenticador'),
          el('p', {}, 'No app autenticador, adicione uma conta com a chave abaixo (ou cole a URI). Depois digite o código de 6 dígitos que ele mostrar.'),
          el('p', { class: 'muted' }, 'Chave (base32):'),
          el('div', { class: 'code-block' }, el('code', {}, segredo), copiar(segredo)),
          el('p', { class: 'muted' }, 'URI otpauth://'),
          el('div', { class: 'code-block' }, el('code', {}, uri), copiar(uri)),
          el('form', { class: 'form', onsubmit: enviar },
            el('label', { class: 'field' }, 'Código do app', codigo), el('div', { class: 'form-actions' }, confirmar), aviso),
        );
        codigo.focus();
      } catch (e) {
        falhou(aviso, e);
        botao.disabled = false;
      }
    }
    return sec;
  }

  sec.append(el('p', { class: 'text-success' }, 'MFA ativo.'));
  if (perfil.politica.mfa_obrigatorio) {
    sec.append(el('p', { class: 'muted' }, 'A política da organização exige MFA: não é possível desativar.'));
    return sec;
  }
  const senha = senhaInput();
  const codigo = codigoInput();
  const botao = el('button', { type: 'submit', class: 'btn btn-danger' }, 'Desativar MFA');
  async function desativar(ev) {
    ev.preventDefault();
    botao.disabled = true;
    aviso.className = 'status status-busy';
    aviso.textContent = 'Derivando chave…';
    await pintar();
    try {
      const auth = await authHashDaSenha(perfil, senha.value);
      await api('DELETE', '/eu/mfa', { auth_hash: auth, codigo: codigo.value.trim() });
      recarregar();
    } catch (e) {
      falhou(aviso, e);
      botao.disabled = false;
    } finally {
      senha.value = '';
    }
  }
  sec.classList.add('card-danger');
  sec.append(el('form', { class: 'form', onsubmit: desativar },
    el('label', { class: 'field' }, 'Senha-mestra', senha), el('label', { class: 'field' }, 'Código do app ou de recuperação', codigo),
    el('div', { class: 'form-actions' }, botao), aviso));
  return sec;
}

/** Códigos de recuperação: exibidos uma vez; "concluir" só depois de marcar que guardou. */
function mostrarCodigos(sec, email, codigos, recarregar) {
  const concluir = el('button', { type: 'button', class: 'btn btn-primary', disabled: true, onclick: recarregar }, 'Concluir');
  const guardei = el('input', { type: 'checkbox', onchange: () => { concluir.disabled = !guardei.checked; } });
  sec.replaceChildren(
    el('h2', {}, 'MFA ativado'),
    el('div', { class: 'alert alert-warning' },
      'Estes 10 códigos de recuperação aparecem só agora. Cada um vale uma vez, no lugar do código do app (ex.: se perder o celular).'),
    el('ul', { class: 'code-list' }, ...codigos.map((c) => el('li', {}, el('code', {}, c)))),
    el('div', { class: 'action-bar' },
      el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => baixarTexto('cofre-codigos-mfa.txt', textoCodigosMfa({ email, codigos })) },
        'Baixar códigos (.txt)')),
    el('label', { class: 'checkbox' }, guardei, 'Guardei os códigos em local seguro'),
    el('div', { class: 'form-actions' }, concluir),
  );
}

// ---------- Sessões ----------

// ---------- Meus acessos (RF-A06: o usuário vê os próprios eventos de login) ----------

const NOMES_EVENTO = {
  'auth.login': 'Login', 'auth.logout': 'Saída', 'auth.bloqueio': 'Bloqueio por tentativas', 'auth.mfa': 'Segundo fator',
  'auth.senha_trocada': 'Troca de senha-mestra', 'auth.recuperacao': 'Recuperação pelo kit', 'auth.sessao_revogada': 'Sessão encerrada',
};

async function secaoMeusEventos() {
  const sec = el('section', { class: 'card', id: 'meus-eventos' }, el('h2', {}, 'Meus acessos'));
  const aviso = el('p', { class: 'status', role: 'status' });
  const lista = el('ul', { class: 'list list-divided' });
  const mais = el('button', { type: 'button', class: 'btn btn-secondary btn-sm', hidden: true }, 'Mais antigos');
  let cursor = null;
  async function carregar() {
    try {
      const q = cursor ? `?limite=20&antes_de_id=${cursor}` : '?limite=20';
      const eventos = await api('GET', `/eu/eventos${q}`);
      lista.append(...eventos.map((e) => el('li', { class: 'list-item' },
        el('div', { class: 'list-item-info' },
          el('span', {}, `${quando(e.em)} · ${NOMES_EVENTO[e.tipo] ?? e.tipo} · `,
            el('span', { class: e.resultado === 'ok' ? 'badge badge-success' : 'badge badge-danger' }, e.resultado === 'ok' ? 'ok' : 'FALHOU')),
          el('span', { class: 'list-item-meta' }, ` ${e.ip ?? ''} ${e.user_agent ?? ''}`)))));
      cursor = eventos.at(-1)?.id ?? cursor;
      mais.hidden = eventos.length < 20;
      aviso.textContent = lista.childElementCount ? 'Se algum acesso não foi seu, troque a senha-mestra e encerre as sessões.' : 'Nenhum evento.';
    } catch (e) {
      falhou(aviso, e);
    }
  }
  mais.addEventListener('click', carregar);
  await carregar();
  sec.append(aviso, lista, mais);
  return sec;
}

async function secaoSessoes() {
  const sec = el('section', { class: 'card' }, el('h2', {}, 'Sessões ativas'));
  const aviso = el('p', { class: 'status', role: 'status' });
  let lista;
  try {
    lista = await api('GET', '/eu/sessoes');
  } catch (e) {
    falhou(aviso, e);
    return sec.appendChild(aviso).parentNode;
  }
  const itens = lista.map((s) => {
    const encerrar = el('button', { type: 'button', class: 'btn btn-secondary btn-sm' }, s.atual ? 'Sair desta' : 'Encerrar');
    const li = el('li', { class: 'list-item' },
      el('div', { class: 'list-item-main' },
        el('div', { class: 'list-item-info' },
          el('span', {}, s.atual ? el('span', { class: 'badge badge-success' }, '(esta)') : null, s.atual ? ' ' : null,
            `${s.user_agent ?? 'navegador desconhecido'} · IP ${s.ip ?? '?'} · criada ${quando(s.criada_em)} · último uso ${quando(s.ultimo_uso)}`)),
        el('div', { class: 'list-item-actions' }, encerrar)));
    encerrar.addEventListener('click', async () => {
      if (s.atual) return sair();
      encerrar.disabled = true;
      try {
        await api('DELETE', `/eu/sessoes/${encodeURIComponent(s.id)}`);
        li.remove();
      } catch (e) {
        falhou(aviso, e);
        encerrar.disabled = false;
      }
    });
    return li;
  });
  sec.append(el('ul', { class: 'list list-divided' }, ...itens), aviso);
  return sec;
}

// ---------- Política (owner/admin) ----------

async function secaoPolitica() {
  const sec = el('section', { class: 'card' }, el('h2', {}, 'Política da organização'));
  const aviso = el('p', { class: 'status', role: 'status' });
  let org;
  try {
    org = await api('GET', '/org');
  } catch (e) {
    falhou(aviso, e);
    return sec.appendChild(aviso).parentNode;
  }
  const mfa = el('input', { type: 'checkbox', checked: org.politica.mfa_obrigatorio });
  const minutos = el('input', { type: 'number', min: 5, max: 60, step: 1, required: true, value: org.politica.inatividade_min });
  const botao = el('button', { type: 'submit', class: 'btn btn-primary' }, 'Salvar política');
  async function salvar(ev) {
    ev.preventDefault();
    botao.disabled = true;
    try {
      const nova = await api('PUT', '/org/politica', { mfa_obrigatorio: mfa.checked, inatividade_min: Number(minutos.value) });
      aviso.className = 'status status-success';
      aviso.textContent = `Política salva: MFA ${nova.mfa_obrigatorio ? 'obrigatório' : 'opcional'}, bloqueio após ${nova.inatividade_min} min.`;
    } catch (e) {
      falhou(aviso, e);
    } finally {
      botao.disabled = false;
    }
  }
  sec.append(el('form', { class: 'form', onsubmit: salvar },
    el('label', { class: 'checkbox' }, mfa, 'Exigir MFA de todos'),
    el('label', { class: 'field' }, 'Bloquear após quantos minutos sem uso (5 a 60)', minutos),
    el('div', { class: 'form-actions' }, botao), aviso));
  return sec;
}

// ---------- Troca de senha-mestra ----------

function secaoSenha(perfil) {
  const atual = senhaInput();
  const nova = senhaInput('new-password');
  const conf = senhaInput('new-password');
  const totp = perfil.mfa_ativo ? codigoInput() : null;
  const aviso = el('p', { class: 'status', role: 'status' });
  const botao = el('button', { type: 'submit', class: 'btn btn-primary' }, 'Trocar senha-mestra');

  async function trocarSenha(ev) {
    ev.preventDefault();
    aviso.className = 'status status-danger';
    if (nova.value !== conf.value) {
      aviso.textContent = 'A confirmação não confere com a nova senha-mestra.';
      return;
    }
    botao.disabled = true;
    aviso.className = 'status status-busy';
    aviso.textContent = 'Derivando chaves…';
    await pintar();
    try {
      const atualizado = await api('GET', '/eu');
      const corpo = await montarTrocaSenha({ perfil: atualizado, senhaAtual: atual.value, senhaNova: nova.value });
      if (totp) corpo.totp = totp.value.trim();
      await api('POST', '/eu/senha', corpo);
      aviso.className = 'status status-success';
      aviso.textContent = 'Senha-mestra trocada. As outras sessões foram encerradas.';
    } catch (e) {
      falhou(aviso, e, e.message === 'senha_curta' ? 'A nova senha-mestra precisa de pelo menos 12 caracteres.'
        : e.message === 'senha_atual_incorreta' ? 'Senha-mestra atual incorreta.'
          : 'Não foi possível trocar a senha-mestra.');
    } finally {
      botao.disabled = false;
      atual.value = nova.value = conf.value = '';
      if (totp) totp.value = '';
    }
  }

  return el('section', { class: 'card' },
    el('h2', {}, 'Trocar senha-mestra'),
    el('form', { class: 'form', onsubmit: trocarSenha },
      el('label', { class: 'field' }, 'Senha-mestra atual', atual),
      el('label', { class: 'field' }, 'Nova senha-mestra (mínimo 12 caracteres)', nova),
      el('label', { class: 'field' }, 'Confirme a nova senha-mestra', conf),
      totp ? el('label', { class: 'field' }, 'Código do app autenticador', totp) : null,
      el('div', { class: 'form-actions' }, botao), aviso));
}
