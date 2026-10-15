// Início e fim da sessão no browser: chaves em memória + bloqueio por inatividade (D16, RF-I09).
import { api } from './api.js';
import { definir, limpar } from './estado.js';
import { vigiarInatividade } from './inatividade.js';

let pararInatividade = null;

/** Depois do login: guarda usuário/chaves e arma o bloqueio com a inatividade da política. */
export function iniciarSessao(resp, chaves) {
  definir({ usuario: resp.usuario, politica: resp.politica, ...chaves });
  pararInatividade?.();
  pararInatividade = vigiarInatividade({
    minutos: resp.politica.inatividade_min,
    bloquear: () => sair('Cofre bloqueado por inatividade. Entre de novo.'),
  });
}

/** Bloquear = logout: revoga no servidor e descarta as chaves da memória (D16). */
export async function sair(aviso = null) {
  pararInatividade?.();
  pararInatividade = null;
  limpar();
  try {
    await api('POST', '/logout', undefined, { keepalive: true });
  } catch {
    // Sessão já inválida: o descarte local basta.
  }
  definir({ aviso });
  location.replace('#/login');
}
