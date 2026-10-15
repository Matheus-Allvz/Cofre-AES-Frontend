// RF-T11: busca local sobre os itens decifrados (título, usuário, URLs), sem acento e sem caixa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { buscar, normalizar } from '../../public/js/busca.js';

const itens = [
  { id: 1, meta: { titulo: 'Conta Bancária', usuario: 'joão@ex.invalid', urls: ['https://banco.ex.invalid/login'] } },
  { id: 2, meta: { titulo: 'Servidor de Produção', usuario: 'root' } },
  { id: 3, meta: { titulo: 'Chave da API de Pagamentos', validade: '2027-01-01' } },
  { id: 4, erro: 'adulterado' },
];
const ids = (r) => r.map((i) => i.id);

test('normalizar tira acento, caixa e espaços extras', () => {
  assert.equal(normalizar('  ÁRVORE   Ção  '), 'arvore cao');
  assert.equal(normalizar(undefined), '');
});

test('busca por título, usuário e URL, sem acento; todos os termos precisam casar', () => {
  assert.deepEqual(ids(buscar(itens, 'bancaria')), [1]);
  assert.deepEqual(ids(buscar(itens, 'JOAO')), [1]);
  assert.deepEqual(ids(buscar(itens, 'banco.ex.invalid/login')), [1]);
  assert.deepEqual(ids(buscar(itens, 'producao root')), [2]);
  assert.deepEqual(ids(buscar(itens, 'producao joao')), []);
  assert.deepEqual(ids(buscar(itens, 'pagamentos')), [3]);
  assert.deepEqual(ids(buscar(itens, '2027')), [], 'validade não é campo de busca');
  assert.deepEqual(ids(buscar(itens, '   ')), [1, 2, 3, 4], 'termo vazio lista tudo');
});

test('a busca não toca a rede: busca.js não importa api.js nem chama fetch', () => {
  const src = readFileSync(new URL('../../public/js/busca.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\bfetch\b|api\.js|XMLHttpRequest/);
  // nenhuma rota de busca no cliente: nenhum caminho /busca nas chamadas de api
  const js = new URL('../../public/js/', import.meta.url);
  for (const f of readdirSync(js, { recursive: true }).filter((f) => f.endsWith('.js'))) {
    assert.doesNotMatch(readFileSync(new URL(f, js), 'utf8'), /api\([^)]*['"`]\/(busca|search)/, f);
  }
});
