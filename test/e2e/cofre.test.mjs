// [FE-E2E] Cofre (Fase 6) contra a API real, com os mesmos módulos do front (cofre.js/cripto.js):
// coleção e itens dos 3 tipos, revelar auditado, histórico com restauração, lixeira, adulteração
// direto no banco (DoD 9) e zero-knowledge com sentinelas no pg_dump e nos logs (DoD 8, RNF-C01).
// Precisa do owner com MFA deixado por contas.test.mjs: o import abaixo registra aqueles testes
// antes destes (a ordem alfabética do index.js poria "cofre" antes de "contas").
import './contas.test.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { abrirItem, abrirSegredo, abrirSync, abrirVersao, montarColecao, montarEdicao, montarItem } from '../../public/js/cofre.js';
import { abrirChaves } from '../../public/js/fluxos.js';
import { EMAIL_OWNER, RAND, compartilhado, entrar, navegador, opcoes, sentinela } from './comum.mjs';
import { SENHA_NOVA, SENHA_OWNER } from './contas.test.mjs';

const S = (nome) => `SENT-${nome}-${RAND}`;
const SENTINELAS = [S('SENHA'), S('SENHA2'), S('SENHA3'), S('TITULO'), S('NOTA'), S('CONTEUDO'), S('VALOR'), S('COLECAO'), SENHA_OWNER, SENHA_NOVA];

/** Só no banco do E2E (projeto compose cofre-e2e), como dono. */
const noBanco = (...args) => execFileSync('docker', ['compose', '-p', 'cofre-e2e', 'exec', '-T', 'db', ...args], { encoding: 'utf8', maxBuffer: 64 << 20 });
const sql = (comando) => noBanco('psql', '-U', 'cofre_dono', '-d', 'cofre', '-v', 'ON_ERROR_STOP=1', '-At', '-c', comando);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** O sentinela e o base64/base64url dele em cada um dos 3 alinhamentos (sem as bordas parciais). */
function variantes(s) {
  const out = [s];
  for (let pre = 0; pre < 3; pre++) {
    const b64 = Buffer.concat([Buffer.alloc(pre), Buffer.from(s)]).toString('base64');
    const miolo = b64.slice(Math.ceil((pre * 4) / 3) + 1, -4);
    out.push(miolo, miolo.replace(/\+/g, '-').replace(/\//g, '_'));
  }
  return out;
}

const ctx = {};

async function sincronizar() {
  const r = await ctx.nav('GET', '/sync');
  assert.equal(r.status, 200);
  assert.ok(!JSON.stringify(r.dados).includes('segredo_cif'));
  const aberto = await abrirSync(r.dados, ctx.eu);
  ctx.colecao = aberto.colecoes.get(ctx.colecaoId);
  return aberto;
}

const itemPorTitulo = (aberto, titulo) => aberto.itens.find((i) => i.meta?.titulo === titulo);

async function revelar(item) {
  const r = await ctx.nav('GET', `/itens/${item.id}/segredo`);
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  return abrirSegredo({ eu: ctx.eu, colecao: ctx.colecao, item, resp: r.dados });
}

test('owner cria coleção e um item de cada tipo; sync decifra nomes e metas; revelar/copiar auditados', opcoes, async () => {
  ctx.nav = navegador();
  const { mfa } = compartilhado.owner;
  const login = await entrar(ctx.nav, EMAIL_OWNER, SENHA_NOVA, { codigo_recuperacao: mfa.codigos[6] });
  assert.equal(login.status, 200, JSON.stringify(login.dados));
  ctx.eu = { usuario: login.dados.usuario, ...(await abrirChaves(login.dados, login.kek)) };
  sentinela(...SENTINELAS);

  const membros = (await ctx.nav('GET', '/membros')).dados;
  const { corpo } = await montarColecao({ eu: ctx.eu, nome: S('COLECAO'), membros });
  assert.equal((await ctx.nav('POST', '/colecoes', corpo)).status, 201);
  ctx.colecaoId = corpo.id;
  await sincronizar();
  assert.equal(ctx.colecao.nome, S('COLECAO'));

  const novos = [
    { tipo: 'login', meta: { titulo: S('TITULO'), usuario: 'ana', urls: ['https://exemplo.invalid/login'] }, segredo: { senha: S('SENHA'), notas: S('NOTA') } },
    { tipo: 'nota', meta: { titulo: 'Nota do e2e' }, segredo: { conteudo: S('CONTEUDO') } },
    { tipo: 'chave_api', meta: { titulo: 'Chave do e2e', validade: '2030-01-01' }, segredo: { valor: S('VALOR'), notas: '' } },
  ];
  for (const n of novos) {
    const item = await montarItem({ eu: ctx.eu, colecao: ctx.colecao, ...n });
    const r = await ctx.nav('POST', `/colecoes/${ctx.colecaoId}/itens`, item);
    assert.deepEqual([r.status, r.dados], [201, { versao: 1 }]);
  }
  const aberto = await sincronizar();
  assert.deepEqual(aberto.itens.map((i) => i.meta.titulo).sort(), [S('TITULO'), 'Chave do e2e', 'Nota do e2e'].sort());
  const itemLogin = itemPorTitulo(aberto, S('TITULO'));
  assert.deepEqual(await revelar(itemLogin), novos[0].segredo);
  assert.equal((await ctx.nav('POST', `/itens/${itemLogin.id}/copiado`)).status, 204);
});

test('histórico: duas edições e restaurar a v1 → senha original, versao 4; If-Match velho → 409', opcoes, async () => {
  let item = itemPorTitulo(await sincronizar(), S('TITULO'));
  const original = await revelar(item);
  for (const senha of [S('SENHA2'), S('SENHA3')]) {
    const ed = await montarEdicao({ eu: ctx.eu, colecao: ctx.colecao, item, meta: item.meta, segredo: { ...original, senha }, senhaTrocada: true });
    const r = await ctx.nav('PUT', `/itens/${item.id}`, ed.corpo, { 'If-Match': ed.ifMatch });
    assert.deepEqual([r.status, r.dados], [200, { versao: item.versao + 1 }]);
    item = itemPorTitulo(await sincronizar(), S('TITULO'));
  }
  assert.equal(item.versao, 3);
  const lista = await ctx.nav('GET', `/itens/${item.id}/versoes`);
  assert.deepEqual(lista.dados.map((v) => v.versao), [2, 1]);

  const v1 = await ctx.nav('GET', `/itens/${item.id}/versoes/1`);
  assert.equal(v1.status, 200);
  const antiga = await abrirVersao({ eu: ctx.eu, colecao: ctx.colecao, item, versao: 1, resp: v1.dados });
  assert.equal(antiga.segredo.senha, S('SENHA'));
  const ed = await montarEdicao({ eu: ctx.eu, colecao: ctx.colecao, item, ...antiga });
  const velho = await ctx.nav('PUT', `/itens/${item.id}`, ed.corpo, { 'If-Match': '2' });
  assert.deepEqual([velho.status, velho.dados], [409, { erro: 'conflito_versao' }]);
  const r = await ctx.nav('PUT', `/itens/${item.id}`, ed.corpo, { 'If-Match': ed.ifMatch });
  assert.deepEqual([r.status, r.dados], [200, { versao: 4 }]);

  item = itemPorTitulo(await sincronizar(), S('TITULO'));
  assert.equal(item.versao, 4);
  assert.equal((await revelar(item)).senha, S('SENHA'));
});

test('lixeira: excluído some do sync, aparece decifrável na lixeira e volta ao restaurar', opcoes, async () => {
  const nota = itemPorTitulo(await sincronizar(), 'Nota do e2e');
  assert.equal((await ctx.nav('DELETE', `/itens/${nota.id}`)).status, 204);
  assert.equal(itemPorTitulo(await sincronizar(), 'Nota do e2e'), undefined);
  const lixo = await ctx.nav('GET', `/colecoes/${ctx.colecaoId}/lixeira`);
  assert.ok(!JSON.stringify(lixo.dados).includes('segredo_cif'));
  const [noLixo] = await Promise.all(lixo.dados.map((l) => abrirItem(ctx.eu.usuario.org_id, ctx.colecao, l)));
  assert.equal(noLixo.meta.titulo, 'Nota do e2e');
  assert.equal((await ctx.nav('POST', `/itens/${nota.id}/restaurar`)).status, 204);
  assert.ok(itemPorTitulo(await sincronizar(), 'Nota do e2e'));
});

test('adulteração no banco: meta com 1 caractere trocado → "adulterado" só nele; segredo movido não decifra', opcoes, async () => {
  const aberto = await sincronizar();
  const chave = itemPorTitulo(aberto, 'Chave do e2e');
  const nota = itemPorTitulo(aberto, 'Nota do e2e');
  const login = itemPorTitulo(aberto, S('TITULO'));
  for (const id of [chave.id, nota.id, login.id]) assert.match(id, UUID);

  const meta = sql(`SELECT meta_cif FROM itens WHERE id = '${chave.id}'`).trim();
  const [pre, iv, ct] = meta.split('.');
  const adulterado = [pre, iv, (ct[0] === 'A' ? 'B' : 'A') + ct.slice(1)].join('.');
  assert.match(adulterado, /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$/);
  sql(`UPDATE itens SET meta_cif = '${adulterado}' WHERE id = '${chave.id}'`);
  sql(`UPDATE itens SET segredo_cif = (SELECT segredo_cif FROM itens WHERE id = '${login.id}') WHERE id = '${nota.id}'`);

  const depois = await sincronizar();
  const porId = new Map(depois.itens.map((i) => [i.id, i]));
  assert.equal(porId.get(chave.id).erro, 'adulterado');
  assert.equal(porId.get(nota.id).meta.titulo, 'Nota do e2e');
  assert.equal(porId.get(login.id).meta.titulo, S('TITULO'));
  await assert.rejects(revelar(porId.get(nota.id))); // AAD com outro item_id
  assert.equal((await revelar(porId.get(login.id))).senha, S('SENHA')); // o original segue íntegro
});

test('RNF-C01: pg_dump do banco e logs da API sem nenhum sentinela (nem em base64/base64url)', opcoes, async () => {
  const dump = noBanco('pg_dump', '-U', 'cofre_dono', 'cofre');
  assert.match(dump, /COPY public\.itens/); // o dump é do banco certo e tem os itens
  const logs = execFileSync('docker', ['compose', '-p', 'cofre-e2e', 'logs', '--no-log-prefix', 'api'], { encoding: 'utf8', maxBuffer: 64 << 20 });
  assert.match(logs, /"rota": ?"\/api\/v1\/sync"/);
  for (const s of SENTINELAS) {
    for (const v of variantes(s)) {
      assert.ok(!dump.includes(v), `sentinela no pg_dump: ${s} (${v})`);
      assert.ok(!logs.includes(v), `sentinela nos logs: ${s} (${v})`);
    }
  }
});
