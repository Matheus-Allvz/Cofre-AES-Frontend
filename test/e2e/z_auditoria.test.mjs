// [FE-E2E] Auditoria (Fase 8) contra a API real, depois dos outros E2E (ordem alfabética): a consulta
// que a tela #/auditoria faz (telas/auditoria.js → consulta()) filtra o item.revelado da colega do
// compartilhar.test.mjs; o cursor não repete nem pula; "Minha conta" vê os próprios logins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consulta } from '../../public/js/telas/auditoria.js';
import { EMAIL_OWNER, compartilhado, entrar, navegador, opcoes } from './comum.mjs';

test('auditoria: filtro tipo+ator, paginação por cursor e os próprios eventos de login', opcoes, async () => {
  const owner = navegador();
  const { senha, mfa } = compartilhado.owner;
  assert.equal((await entrar(owner, EMAIL_OWNER, senha, { codigo_recuperacao: mfa.codigos[8] })).status, 200);
  const colega = (await owner('GET', '/membros')).dados.find((p) => p.email === 'colega@e2e.invalid');
  assert.ok(colega, 'colega criada em compartilhar.test.mjs');

  const r = await owner('GET', consulta({ tipo: 'item.revelado', ator_id: colega.id }));
  assert.equal(r.status, 200);
  assert.ok(r.dados.length >= 1);
  assert.ok(r.dados.every((e) => e.tipo === 'item.revelado' && e.ator_id === colega.id && e.resultado === 'ok'));

  const todos = (await owner('GET', '/auditoria?limite=200')).dados.map((e) => e.id);
  const vistos = [];
  let cursor = null;
  for (let i = 0; i < 3; i++) {
    const pagina = (await owner('GET', `/auditoria?limite=2${cursor ? `&antes_de_id=${cursor}` : ''}`)).dados;
    assert.equal(pagina.length, 2);
    vistos.push(...pagina.map((e) => e.id));
    cursor = pagina.at(-1).id;
  }
  assert.deepEqual(vistos, todos.slice(0, 6));

  const anon = await navegador()('GET', '/auditoria');
  assert.equal(anon.status, 401);
  const meus = (await owner('GET', '/eu/eventos')).dados;
  assert.ok(meus.some((e) => e.tipo === 'auth.login' && e.resultado === 'ok'));
  assert.ok(meus.every((e) => e.tipo.startsWith('auth.')));
});
