// RF-T08: gerador de senha/passphrase (alfabeto, classes, uniformidade) e a lista de palavras vendorizada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLASSES, gerarPassphrase, gerarSenha, inteiroUniforme, lerPalavras } from '../../public/js/gerador.js';

const LISTA = lerPalavras(readFileSync(new URL('../../public/vendor/bip39-pt/portuguese.txt', import.meta.url), 'utf8'));

/** Valor crítico do qui-quadrado (aproximação de Wilson–Hilferty); z(0,999) = 3,0902. */
const critico = (gl, z = 3.0902) => gl * (1 - 2 / (9 * gl) + z * Math.sqrt(2 / (9 * gl))) ** 3;

test('10 000 senhas de 20 chars: só o alfabeto pedido e cada classe exigida presente', () => {
  for (const classes of [Object.keys(CLASSES), ['minusculas', 'digitos'], ['maiusculas', 'simbolos']]) {
    const alfabeto = new Set(classes.flatMap((k) => [...CLASSES[k]]));
    for (let i = 0; i < 10_000; i++) {
      const s = gerarSenha({ tamanho: 20, classes });
      assert.equal(s.length, 20);
      assert.ok([...s].every((ch) => alfabeto.has(ch)), s);
      for (const k of classes) assert.ok([...CLASSES[k]].some((ch) => s.includes(ch)), `${k} ausente em ${s}`);
    }
  }
});

test('qui-quadrado sobre 100 000 caracteres abaixo do crítico p=0,001', () => {
  // Senhas de 100 chars: a chance de faltar alguma classe (e haver rejeição) é ~1e-5, então a
  // contagem testa o sorteio por caractere (inteiroUniforme) sem o efeito da exigência de classes.
  const alfabeto = Object.values(CLASSES).join('');
  const contagem = new Map([...alfabeto].map((ch) => [ch, 0]));
  for (let i = 0; i < 1000; i++) for (const ch of gerarSenha({ tamanho: 100 })) contagem.set(ch, contagem.get(ch) + 1);
  const esperado = 100_000 / alfabeto.length;
  const x2 = [...contagem.values()].reduce((s, o) => s + (o - esperado) ** 2 / esperado, 0);
  assert.ok(x2 < critico(alfabeto.length - 1), `x2=${x2.toFixed(1)} crítico=${critico(alfabeto.length - 1).toFixed(1)}`);
});

test('inteiroUniforme rejeita o resto do módulo e valida o intervalo', () => {
  // n = 3·2^30: sorteios ≥ 3·2^30 (o "resto") são descartados até vir um aceitável.
  const n = 3 * 2 ** 30;
  const fila = [2 ** 32 - 1, 3 * 2 ** 30, 5];
  assert.equal(inteiroUniforme(n, (b) => { b[0] = fila.shift(); return b; }), 5);
  assert.equal(fila.length, 0);
  for (const ruim of [0, 1.5, 2 ** 32 + 1]) assert.throws(() => inteiroUniforme(ruim), /intervalo_invalido/);
});

test('parâmetros inválidos de senha e passphrase são recusados', () => {
  assert.throws(() => gerarSenha({ tamanho: 7 }), /tamanho_invalido/);
  assert.throws(() => gerarSenha({ tamanho: 129 }), /tamanho_invalido/);
  assert.throws(() => gerarSenha({ classes: [] }), /classes_invalidas/);
  assert.throws(() => gerarSenha({ classes: ['emoji'] }), /classes_invalidas/);
  assert.throws(() => gerarPassphrase(LISTA.slice(0, 100)), /lista_invalida/);
  assert.throws(() => gerarPassphrase(LISTA, { palavras: 3 }), /tamanho_invalido/);
});

test('passphrase: palavras da lista, separador pedido', () => {
  const set = new Set(LISTA);
  for (let i = 0; i < 1000; i++) {
    const p = gerarPassphrase(LISTA, { palavras: 6, separador: ' ' }).split(' ');
    assert.equal(p.length, 6);
    assert.ok(p.every((w) => set.has(w)));
  }
});

test('lista de palavras vendorizada: ≥ 2048, sem duplicatas, só [a-z]', () => {
  assert.ok(LISTA.length >= 2048);
  assert.equal(new Set(LISTA).size, LISTA.length);
  assert.throws(() => lerPalavras(`${LISTA.join('\n')}\n${LISTA[0]}`), /lista_invalida/);
  assert.throws(() => lerPalavras(LISTA.slice(1).join('\n')), /lista_invalida/);
});
