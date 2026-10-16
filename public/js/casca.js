// App shell (Fase 10): topbar com marca, navegação e "Bloquear", e a largura do <main>.
// Só apresentação: as rotas, os redirecionamentos e as checagens de acesso continuam nas telas.
import { el, trocar } from './dom.js';
import { estado } from './estado.js';
import { sair } from './sessao.js';

const ROTAS_DA_SESSAO = ['cofre', 'conta', 'pessoas', 'auditoria'];
export const TOM_PAPEL = { owner: 'badge badge-accent', admin: 'badge badge-info' };

/** Repinta a topbar para a rota atual. Fora da sessão (login, convite, recuperar), só a marca. */
export function pintarCasca(rota) {
  const topo = document.querySelector('.topbar-inner');
  const app = document.getElementById('app');
  const u = estado.usuario;
  const naSessao = Boolean(u) && ROTAS_DA_SESSAO.includes(rota);
  app.className = naSessao ? 'container' : 'container container-narrow';
  const ativo = naSessao && u.estado === 'ativo';
  const marca = el('a', { class: 'brand', href: !naSessao ? '#/login' : ativo ? '#/cofre' : '#/conta' },
    'Cofre AES ', el('span', { class: 'brand-sub' }, 'Empresarial'));
  if (!naSessao) return trocar(topo, marca);

  const gestor = ativo && ['owner', 'admin'].includes(u.papel);
  const link = (r, texto) => el('a', { class: 'nav-link', href: `#/${r}`, 'aria-current': r === rota ? 'page' : null }, texto);
  trocar(topo, marca,
    el('nav', { class: 'nav', 'aria-label': 'Principal' },
      ativo ? link('cofre', 'Cofre') : null,
      gestor ? link('pessoas', 'Pessoas') : null,
      gestor ? link('auditoria', 'Auditoria') : null,
      link('conta', 'Minha conta')),
    el('div', { class: 'topbar-actions' },
      el('span', { class: 'topbar-user' }, u.nome ?? u.email ?? ''),
      u.papel ? selo(TOM_PAPEL, u.papel) : null,
      el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => sair('Cofre bloqueado.') }, 'Bloquear')));
}

// Badges (design system §3.8): o texto é sempre o próprio valor; a classe só dá o tom.
export const TOM_ESTADO = { ativo: 'badge badge-success', aceito: 'badge badge-warning', suspenso: 'badge badge-danger' };
export const TOM_PERMISSAO = { gerenciar: 'badge badge-accent', editar: 'badge badge-info', ver_sem_revelar: 'badge badge-warning' };
export const selo = (tons, valor, texto = valor) => el('span', { class: tons[valor] ?? 'badge' }, texto);
