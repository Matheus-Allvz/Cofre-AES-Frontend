// [FE-E2E] Compartilhamento, revogação e offboarding (Fase 7) contra a API real, com os mesmos
// módulos do front (cofre.js/cripto.js): owner compartilha com member (`ver`), member lê a senha
// e guarda a collectionKey; owner tira o acesso; rotação; com a chave antiga o ex-membro NÃO
// decifra o meta_cif nem o segredo_cif novos (DoD 2). Depois: senhas a trocar, remoção da org com
// relatório, promoção a owner com envelopes de todas as coleções e sentinelas fora do pg_dump.
import './contas.test.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as c from '../../public/js/cripto.js';
import {
  abrirSegredo, abrirSync, montarColecao, montarEdicao, montarEnvelopesOwner, montarItem, montarMembro, rotacionarColecao,
} from '../../public/js/cofre.js';
import { abrirChaves, fingerprintConfere, fingerprintDoMembro } from '../../public/js/fluxos.js';
import { EMAIL_OWNER, RAND, aceitar, compartilhado, configurarMfa, entrar, navegador, opcoes, sentinela } from './comum.mjs';

const S = (nome) => `SENT-COMP-${nome}-${RAND}`;
const SENHA_ITEM = S('SENHA');
const SENHA_TROCADA = S('TROCADA');
const ctx = {};

const noBanco = (...args) => execFileSync('docker', ['compose', '-p', 'cofre-e2e', 'exec', '-T', 'db', ...args], { encoding: 'utf8', maxBuffer: 64 << 20 });
const sql = (comando) => noBanco('psql', '-U', 'cofre_dono', '-d', 'cofre', '-v', 'ON_ERROR_STOP=1', '-At', '-c', comando).trim();

/** `pedir` de cofre.rotacionarColecao sobre o "navegador" do E2E: JSON ou exceção com o código. */
const pedirDe = (nav) => async (metodo, caminho, corpo) => {
  const r = await nav(metodo, caminho, corpo);
  if (r.status >= 400) throw Object.assign(new Error(r.dados?.erro ?? `http_${r.status}`), { status: r.status, codigo: r.dados?.erro });
  return r.dados;
};

async function entrarComChaves(nav, email, senha, fator) {
  const login = await entrar(nav, email, senha, fator);
  assert.equal(login.status, 200, JSON.stringify(login.dados));
  return { usuario: login.dados.usuario, ...(await abrirChaves(login.dados, login.kek)) };
}

async function sincronizar(nav, quem) {
  const r = await nav('GET', '/sync');
  assert.equal(r.status, 200);
  return abrirSync(r.dados, quem);
}

/** Convite → aceite → login → MFA (política ligada) → owner confere o fingerprint → ativo. */
async function novaPessoa(email, senha, nome) {
  const conv = await ctx.owner('POST', '/convites', { email, papel: 'member' });
  assert.equal(conv.status, 201);
  const nav = navegador();
  const { fingerprint } = await aceitar(nav, conv.dados.link.slice('/#/convite/'.length), senha, nome);
  const login = await entrar(nav, email, senha);
  assert.equal(login.status, 200);
  const chaves = { usuario: login.dados.usuario, ...(await abrirChaves(login.dados, login.kek)) };
  await configurarMfa(nav); // a política foi ligada em contas.test.mjs
  const m = (await ctx.owner('GET', '/membros')).dados.find((x) => x.email === email);
  const calculado = await fingerprintDoMembro(m);
  assert.ok(fingerprintConfere(fingerprint, calculado));
  assert.equal((await ctx.owner('POST', `/membros/${m.id}/confirmar`, { fingerprint: calculado })).status, 200);
  return { nav, id: m.id, eu: chaves };
}

test('owner compartilha com member (ver); member lê a senha e guarda a collectionKey', opcoes, async () => {
  sentinela(SENHA_ITEM, SENHA_TROCADA);
  ctx.owner = navegador();
  const { senha, mfa } = compartilhado.owner;
  ctx.eu = await entrarComChaves(ctx.owner, EMAIL_OWNER, senha, { codigo_recuperacao: mfa.codigos[7] });
  const colega = await novaPessoa('colega@e2e.invalid', 'senha-mestra da colega (e2e)', 'Colega E2E');
  ctx.colega = colega;

  const pessoas = (await ctx.owner('GET', '/membros')).dados;
  const { corpo, colecao } = await montarColecao({ eu: ctx.eu, nome: S('COLECAO'), membros: pessoas });
  assert.equal((await ctx.owner('POST', '/colecoes', corpo)).status, 201);
  ctx.colId = corpo.id;
  const item = await montarItem({ eu: ctx.eu, colecao, tipo: 'login', meta: { titulo: 'Compartilhado', usuario: 'equipe' }, segredo: { senha: SENHA_ITEM, notas: '' } });
  assert.equal((await ctx.owner('POST', `/colecoes/${ctx.colId}/itens`, item)).status, 201);
  ctx.itemId = item.id;

  // A UI só oferece ativos com fingerprint confirmado; o envelope vai para a chave conferida.
  const alvo = pessoas.find((p) => p.id === colega.id);
  const env = await montarMembro({ eu: ctx.eu, colecao, membro: alvo, permissao: 'ver' });
  const r = await ctx.owner('POST', `/colecoes/${ctx.colId}/membros`, env);
  assert.deepEqual([r.status, r.dados], [201, { usuario_id: colega.id, permissao: 'ver', chave_ver: 1 }]);

  const dela = await sincronizar(colega.nav, ctx.colega.eu);
  const col = dela.colecoes.get(ctx.colId);
  assert.equal(col.nome, S('COLECAO'));
  const it = dela.itens.find((i) => i.id === ctx.itemId);
  const seg = await colega.nav('GET', `/itens/${ctx.itemId}/segredo`);
  assert.equal(seg.status, 200);
  assert.equal((await abrirSegredo({ eu: ctx.colega.eu, colecao: col, item: it, resp: seg.dados })).senha, SENHA_ITEM);
  // "Guardou no teste" a collectionKey em bytes (o que um ex-membro mal-intencionado faria).
  const sync = (await colega.nav('GET', '/sync')).dados.colecoes.find((x) => x.id === ctx.colId);
  ctx.chaveAntiga = await c.abrirX1(ctx.colega.eu, sync.chave_colecao_cif, c.aad.envColecao(ctx.eu.usuario.org_id, ctx.colId, colega.id, 1));
  assert.equal(ctx.chaveAntiga.length, 32);
  // Controle: com essa chave o blob ANTES da rotação abre (a falha depois é da rotação, não do teste).
  const antigo = sql(`SELECT segredo_cif FROM itens WHERE id = '${ctx.itemId}'`);
  const aadAntigo = c.aad.itemSegredo(ctx.eu.usuario.org_id, ctx.colId, ctx.itemId, 'login', 1, 1);
  assert.match(new TextDecoder().decode(await c.decifrarV1(ctx.chaveAntiga, antigo, aadAntigo)), new RegExp(SENHA_ITEM));
});

test('owner remove o member: coleção com rotação pendente, item em "senhas a trocar", member recebe 404', opcoes, async () => {
  const r = await ctx.owner('DELETE', `/colecoes/${ctx.colId}/membros/${ctx.colega.id}`);
  assert.equal(r.status, 204);
  const meu = await sincronizar(ctx.owner, ctx.eu);
  assert.equal(meu.colecoes.get(ctx.colId).rotacaoPendente, true);
  assert.equal(meu.itens.find((i) => i.id === ctx.itemId).rotacaoSenhaPendente, true);
  for (const caminho of [`/itens/${ctx.itemId}/segredo`, `/itens/${ctx.itemId}/versoes`, `/colecoes/${ctx.colId}/lixeira`]) {
    const x = await ctx.colega.nav('GET', caminho);
    assert.deepEqual([x.status, x.dados], [404, { erro: 'nao_encontrado' }], caminho);
  }
  assert.ok(!(await ctx.colega.nav('GET', '/sync')).dados.colecoes.some((x) => x.id === ctx.colId));
});

test('rotação: nova chave_ver; com a collectionKey antiga o ex-membro não decifra meta_cif nem segredo_cif novos', opcoes, async () => {
  const antes = await sincronizar(ctx.owner, ctx.eu);
  const r = await rotacionarColecao({ eu: ctx.eu, colecao: antes.colecoes.get(ctx.colId), pedir: pedirDe(ctx.owner) });
  assert.deepEqual(r, { chave_ver: 2 });
  const depois = await sincronizar(ctx.owner, ctx.eu);
  const col = depois.colecoes.get(ctx.colId);
  assert.deepEqual([col.chaveVer, col.rotacaoPendente, col.nome], [2, false, S('COLECAO')]);
  const item = depois.itens.find((i) => i.id === ctx.itemId);
  const seg = (await ctx.owner('GET', `/itens/${ctx.itemId}/segredo`)).dados;
  assert.equal((await abrirSegredo({ eu: ctx.eu, colecao: col, item, resp: seg })).senha, SENHA_ITEM);

  // Blobs novos lidos direto do banco (o que o ex-membro conseguiria por outro caminho).
  const [meta, segredo] = sql(`SELECT meta_cif || ' ' || segredo_cif FROM itens WHERE id = '${ctx.itemId}'`).split(' ');
  assert.equal(segredo, seg.segredo_cif);
  const org = ctx.eu.usuario.org_id;
  for (const chaveVer of [1, 2]) { // nem com o AAD novo nem com o antigo
    await assert.rejects(c.decifrarV1(ctx.chaveAntiga, meta, c.aad.itemMeta(org, ctx.colId, ctx.itemId, 'login', chaveVer, 1)));
    await assert.rejects(c.decifrarV1(ctx.chaveAntiga, segredo, c.aad.itemSegredo(org, ctx.colId, ctx.itemId, 'login', chaveVer, 1)));
  }
  const x = await ctx.colega.nav('GET', `/itens/${ctx.itemId}/segredo`);
  assert.deepEqual([x.status, x.dados], [404, { erro: 'nao_encontrado' }]);
  const evento = sql("SELECT meta::text FROM eventos WHERE tipo = 'colecao.rotacionada' ORDER BY id DESC LIMIT 1");
  assert.deepEqual(JSON.parse(evento), { chave_ver: 2, membros: 1, itens: 1, versoes: 0 });
});

test('senha trocada: editar com a senha nova tira o item do painel', opcoes, async () => {
  const aberto = await sincronizar(ctx.owner, ctx.eu);
  const col = aberto.colecoes.get(ctx.colId);
  const item = aberto.itens.find((i) => i.id === ctx.itemId);
  const ed = await montarEdicao({ eu: ctx.eu, colecao: col, item, meta: item.meta, segredo: { senha: SENHA_TROCADA, notas: '' }, senhaTrocada: true });
  assert.equal((await ctx.owner('PUT', `/itens/${ctx.itemId}`, ed.corpo, { 'If-Match': ed.ifMatch })).status, 200);
  const depois = await sincronizar(ctx.owner, ctx.eu);
  assert.equal(depois.itens.find((i) => i.id === ctx.itemId).rotacaoSenhaPendente, false);
});

test('remover pessoa da org devolve o relatório e marca a coleção; promover a owner entrega todas as coleções', opcoes, async () => {
  const saida = await novaPessoa('saida@e2e.invalid', 'senha-mestra de quem sai (e2e)', 'Saída E2E');
  let aberto = await sincronizar(ctx.owner, ctx.eu);
  const pessoas = (await ctx.owner('GET', '/membros')).dados;
  const env = await montarMembro({ eu: ctx.eu, colecao: aberto.colecoes.get(ctx.colId), membro: pessoas.find((p) => p.id === saida.id), permissao: 'editar' });
  assert.equal((await ctx.owner('POST', `/colecoes/${ctx.colId}/membros`, env)).status, 201);
  const rem = await ctx.owner('DELETE', `/membros/${saida.id}`);
  assert.deepEqual([rem.status, rem.dados], [200, { relatorio: [{ colecao_id: ctx.colId, itens: [ctx.itemId] }] }]);
  aberto = await sincronizar(ctx.owner, ctx.eu);
  assert.equal(aberto.colecoes.get(ctx.colId).rotacaoPendente, true);
  assert.deepEqual(await rotacionarColecao({ eu: ctx.eu, colecao: aberto.colecoes.get(ctx.colId), pedir: pedirDe(ctx.owner) }), { chave_ver: 3 });

  // Promoção: sem envelope de alguma coleção → 422; com todas → a colega abre todas como gerenciar.
  aberto = await sincronizar(ctx.owner, ctx.eu);
  const alvo = (await ctx.owner('GET', '/membros')).dados.find((p) => p.id === ctx.colega.id);
  const envelopes = await montarEnvelopesOwner({ eu: ctx.eu, colecoes: aberto.colecoes.values(), alvo });
  assert.ok(envelopes.length >= 2, 'há a coleção do cofre.test e a desta fase');
  const falta = await ctx.owner('PUT', `/membros/${alvo.id}/papel`, { papel: 'owner', envelopes: envelopes.slice(1) });
  assert.deepEqual([falta.status, falta.dados], [422, { erro: 'envelopes_incompletos' }]);
  const ok = await ctx.owner('PUT', `/membros/${alvo.id}/papel`, { papel: 'owner', envelopes });
  assert.deepEqual([ok.status, ok.dados], [200, { id: alvo.id, papel: 'owner' }]);
  const dela = await sincronizar(ctx.colega.nav, ctx.colega.eu);
  assert.deepEqual([...dela.colecoes.values()].map((x) => [x.id, x.permissao, Boolean(x.nome)]).sort(),
    [...aberto.colecoes.values()].map((x) => [x.id, 'gerenciar', true]).sort());
  // Volta a admin (os outros E2E contam com um owner só).
  const rebaixa = await ctx.owner('PUT', `/membros/${alvo.id}/papel`, { papel: 'admin' });
  assert.equal(rebaixa.status, 200);
});

test('RNF-C01: sentinelas desta fase fora do pg_dump', opcoes, async () => {
  const dump = noBanco('pg_dump', '-U', 'cofre_dono', 'cofre');
  assert.match(dump, /COPY public\.colecao_membros/);
  for (const s of [SENHA_ITEM, SENHA_TROCADA, S('COLECAO')]) assert.ok(!dump.includes(s), s);
});
