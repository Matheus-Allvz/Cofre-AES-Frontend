// RF-I09: bloqueio automático do cofre. Sem DOM próprio: alvo e relógio injetáveis (teste com relógio falso).
const INTERACAO = ['pointerdown', 'keydown'];
const CAPTURA = { capture: true }; // pega a interação mesmo se algum handler parar a propagação

/**
 * Chama `bloquear()` uma única vez: após `minutos` sem pointerdown/keydown em `alvo`, ou no pagehide
 * (aba fechada/navegada). Devolve `parar()`, que desliga tudo sem bloquear.
 */
export function vigiarInatividade({ minutos, bloquear, alvo = globalThis, relogio = globalThis }) {
  let timer = null;
  let ativo = true;

  function parar() {
    ativo = false;
    relogio.clearTimeout(timer);
    for (const tipo of INTERACAO) alvo.removeEventListener(tipo, rearmar, CAPTURA);
    alvo.removeEventListener('pagehide', disparar, CAPTURA);
  }

  function disparar() {
    if (!ativo) return;
    parar();
    bloquear();
  }

  function rearmar() {
    relogio.clearTimeout(timer);
    timer = relogio.setTimeout(disparar, minutos * 60_000);
  }

  for (const tipo of INTERACAO) alvo.addEventListener(tipo, rearmar, CAPTURA);
  alvo.addEventListener('pagehide', disparar, CAPTURA);
  rearmar();
  return parar;
}
