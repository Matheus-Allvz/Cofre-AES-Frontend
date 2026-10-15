// Gerador de senha e passphrase (RF-T08). Só crypto.getRandomValues, com rejeição de viés.
// Sem DOM: roda no browser e no Node (testes).

export const CLASSES = Object.freeze({
  minusculas: 'abcdefghijklmnopqrstuvwxyz',
  maiusculas: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digitos: '0123456789',
  simbolos: '!@#$%&*()-_=+[]{};:,.?/',
});

const TETO = 2 ** 32;

/** Inteiro uniforme em [0, n): descarta os sorteios do "resto" que viciariam o módulo. */
export function inteiroUniforme(n, aleatorio = (b) => globalThis.crypto.getRandomValues(b)) {
  if (!Number.isInteger(n) || n < 1 || n > TETO) throw new Error('intervalo_invalido');
  const limite = TETO - (TETO % n);
  const buf = new Uint32Array(1);
  for (;;) {
    aleatorio(buf);
    if (buf[0] < limite) return buf[0] % n;
  }
}

/**
 * Senha com `tamanho` caracteres do alfabeto das `classes`, com ao menos um de cada classe.
 * Senha sem alguma classe é descartada inteira e sorteada de novo: o resultado é uniforme sobre
 * o conjunto das senhas válidas (por caractere, classes pequenas ficam um pouco mais frequentes
 * em senhas curtas — é o preço de exigir cada classe).
 */
export function gerarSenha({ tamanho = 20, classes = Object.keys(CLASSES) } = {}) {
  if (!classes.length || classes.some((k) => !(k in CLASSES))) throw new Error('classes_invalidas');
  if (!Number.isInteger(tamanho) || tamanho < Math.max(8, classes.length) || tamanho > 128) {
    throw new Error('tamanho_invalido');
  }
  const alfabeto = classes.map((k) => CLASSES[k]).join('');
  for (;;) {
    let s = '';
    for (let i = 0; i < tamanho; i++) s += alfabeto[inteiroUniforme(alfabeto.length)];
    if (classes.every((k) => [...CLASSES[k]].some((ch) => s.includes(ch)))) return s;
  }
}

/** Passphrase: `palavras` da lista vendorizada (2048 → 11 bits por palavra). */
export function gerarPassphrase(lista, { palavras = 6, separador = '-' } = {}) {
  if (!Array.isArray(lista) || lista.length < 2048) throw new Error('lista_invalida');
  if (!Number.isInteger(palavras) || palavras < 4 || palavras > 20) throw new Error('tamanho_invalido');
  return Array.from({ length: palavras }, () => lista[inteiroUniforme(lista.length)]).join(separador);
}

export const URL_PALAVRAS = '/vendor/bip39-pt/portuguese.txt';

/** Texto da lista (uma palavra por linha) → array; recusa lista curta, repetida ou estranha. */
export function lerPalavras(texto) {
  const lista = String(texto).split('\n').map((p) => p.trim()).filter(Boolean);
  if (lista.length < 2048 || new Set(lista).size !== lista.length || lista.some((p) => !/^[a-z]+$/.test(p))) {
    throw new Error('lista_invalida');
  }
  return lista;
}

let cache = null;

/** Browser: baixa a lista uma vez (mesma origem; CSP connect-src 'self'). */
export async function carregarPalavras() {
  if (!cache) {
    const r = await fetch(URL_PALAVRAS, { cache: 'force-cache' });
    if (!r.ok) throw new Error('lista_indisponivel');
    cache = lerPalavras(await r.text());
  }
  return cache;
}
