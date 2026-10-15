// Fase 7 sem servidor: tipo no AAD (§3.3), chaves do JSON conferidas contra o tipo (§3.4),
// rollback do segredo, envelope x1 para membro novo / owner, rotação com chave nova.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../../public/js/cripto.js';
import {
  abrirItem, abrirSegredo, abrirSync, abrirVersao, chavePublicaConfirmada, montarColecao, montarEnvelopesOwner, montarItem,
  montarMembro, montarRotacao, podeReceberAcesso, rotacionarColecao,
} from '../../public/js/cofre.js';

const ORG = '11111111-1111-4111-8111-111111111111';

async function pessoa(papel = 'member', estado = 'ativo') {
  const par = await c.gerarParX25519();
  const id = crypto.randomUUID();
  return {
    eu: { usuario: { id, org_id: ORG }, privada: await c.importarPrivadaX25519(par.privadaPkcs8), publica: par.publica },
    membro: { id, papel, estado, chave_publica: c.b64u(par.publica), fingerprint_confirmado: await c.fingerprint(par.publica) },
  };
}

const linhaCol = (id, chaveVer, nomeCif, env, permissao = 'gerenciar') => ({
  id, nome_cif: nomeCif, chave_ver: chaveVer, permissao, chave_colecao_cif: env, rotacao_pendente: false,
});
const linhaItem = (colId, i, versao = 1) => ({
  id: i.id, colecao_id: colId, tipo: i.tipo, versao, chave_ver: i.chave_ver, meta_cif: i.meta_cif, rotacao_senha_pendente: false,
});
const LOGIN = { meta: { titulo: 'Banco', usuario: 'ana' }, segredo: { senha: 'S3nha!', notas: '' } };

async function cenario() {
  const dono = await pessoa('owner');
  const { corpo, colecao } = await montarColecao({ eu: dono.eu, nome: 'Fin', membros: [dono.membro] });
  const item = await montarItem({ eu: dono.eu, colecao, tipo: 'login', ...LOGIN });
  return { dono, corpo, colecao, item };
}

test('tipo no AAD: trocar o tipo da linha (login → nota ou chave_api) torna o item adulterado', async () => {
  const { colecao, corpo, item } = await cenario();
  assert.equal((await abrirItem(ORG, colecao, linhaItem(corpo.id, item))).meta.titulo, 'Banco');
  for (const tipo of ['nota', 'chave_api']) {
    assert.equal((await abrirItem(ORG, colecao, { ...linhaItem(corpo.id, item), tipo })).erro, 'adulterado');
  }
});

test('JSON decifrado com chaves de outro tipo → adulterado (mesmo com AAD válido)', async () => {
  const { dono, colecao, corpo } = await cenario();
  const id = crypto.randomUUID();
  const meta = await c.cifrarV1(colecao.chave, JSON.stringify({ titulo: 'x', conteudo: 'intruso' }), c.aad.itemMeta(ORG, corpo.id, id, 'login', 1, 1));
  assert.equal((await abrirItem(ORG, colecao, { id, colecao_id: corpo.id, tipo: 'login', versao: 1, chave_ver: 1, meta_cif: meta })).erro, 'adulterado');
  const segredo = await c.cifrarV1(colecao.chave, JSON.stringify({ valor: 'x' }), c.aad.itemSegredo(ORG, corpo.id, id, 'login', 1, 1));
  const item = { id, tipo: 'login', versao: 1, chaveVer: 1 };
  await assert.rejects(abrirSegredo({ eu: dono.eu, colecao, item, resp: { segredo_cif: segredo, versao: 1, chave_ver: 1 } }), /adulterado/);
  await assert.rejects(abrirVersao({ eu: dono.eu, colecao, item, versao: 1, resp: { meta_cif: meta, segredo_cif: segredo, chave_ver: 1 } }), /adulterado/);
});

test('abrirSegredo: versao/chave_ver da resposta diferentes do sync → adulterado (rollback barato)', async () => {
  const { dono, colecao, corpo, item } = await cenario();
  const aberto = await abrirItem(ORG, colecao, linhaItem(corpo.id, item));
  const resp = { segredo_cif: item.segredo_cif, versao: 1, chave_ver: 1 };
  assert.deepEqual(await abrirSegredo({ eu: dono.eu, colecao, item: aberto, resp }), LOGIN.segredo);
  // Servidor devolve o segredo legítimo da v1 para um item que o sync diz estar na v3.
  await assert.rejects(abrirSegredo({ eu: dono.eu, colecao, item: { ...aberto, versao: 3 }, resp }), /adulterado/);
  await assert.rejects(abrirSegredo({ eu: dono.eu, colecao, item: aberto, resp: { ...resp, chave_ver: 2 } }), /adulterado/);
});

test('montarMembro: o membro novo abre a coleção; envelope com AAD de outro usuario_dest não abre', async () => {
  const { dono, corpo, colecao } = await cenario();
  const ana = await pessoa();
  const bia = await pessoa();
  const env = await montarMembro({ eu: dono.eu, colecao, membro: ana.membro, permissao: 'ver' });
  assert.deepEqual(Object.keys(env).sort(), ['chave_colecao_cif', 'chave_ver', 'permissao', 'usuario_id']);
  const sync = (p, e) => ({ colecoes: [linhaCol(corpo.id, 1, corpo.nome_cif, e.chave_colecao_cif, 'ver')], itens: [] });
  assert.equal((await abrirSync(sync(ana, env), ana.eu)).colecoes.get(corpo.id).nome, 'Fin');
  // Checklist: x1 cujo AAD usa outro usuario_dest → o destinatário não abre.
  const bytes = await c.abrirX1(dono.eu, colecao.envelope, c.aad.envColecao(ORG, corpo.id, dono.eu.usuario.id, 1));
  const errado = await c.envelopeX1(bia.eu.publica, bytes, c.aad.envColecao(ORG, corpo.id, ana.eu.usuario.id, 1));
  await assert.rejects(c.abrirX1(bia.eu, errado, c.aad.envColecao(ORG, corpo.id, bia.eu.usuario.id, 1)));
  assert.equal((await abrirSync(sync(bia, { chave_colecao_cif: errado }), bia.eu)).colecoes.get(corpo.id).erro, 'adulterado');
});

test('só ativo com fingerprint confirmado e conferido recebe acesso', async () => {
  const { dono, colecao } = await cenario();
  const ana = await pessoa();
  const outra = await pessoa();
  assert.equal(podeReceberAcesso(ana.membro), true);
  for (const m of [{ ...ana.membro, estado: 'aceito' }, { ...ana.membro, estado: 'suspenso' }, { ...ana.membro, fingerprint_confirmado: null }]) {
    assert.equal(podeReceberAcesso(m), false);
    await assert.rejects(montarMembro({ eu: dono.eu, colecao, membro: m, permissao: 'ver' }), /destinatario_invalido/);
  }
  // Servidor troca a chave pública mas mantém o fingerprint confirmado antigo.
  const trocada = { ...ana.membro, chave_publica: outra.membro.chave_publica };
  await assert.rejects(chavePublicaConfirmada(trocada), /chave_publica_divergente/);
  await assert.rejects(montarMembro({ eu: dono.eu, colecao, membro: trocada, permissao: 'ver' }), /chave_publica_divergente/);
  await assert.rejects(montarMembro({ eu: dono.eu, colecao, membro: ana.membro, permissao: 'dono' }), /permissao_invalida/);
});

test('montarEnvelopesOwner: um envelope gerenciar por coleção; o novo owner abre todas', async () => {
  const dono = await pessoa('owner');
  const novo = await pessoa('admin');
  const cols = [];
  for (const nome of ['A', 'B']) cols.push(await montarColecao({ eu: dono.eu, nome, membros: [dono.membro] }));
  const envs = await montarEnvelopesOwner({ eu: dono.eu, colecoes: cols.map((x) => x.colecao), alvo: novo.membro });
  assert.deepEqual(envs.map((e) => e.colecao_id), cols.map((x) => x.corpo.id));
  const sync = { colecoes: cols.map((x, i) => linhaCol(x.corpo.id, 1, x.corpo.nome_cif, envs[i].chave_colecao_cif)), itens: [] };
  const aberto = await abrirSync(sync, novo.eu);
  assert.deepEqual([...aberto.colecoes.values()].map((x) => x.nome), ['A', 'B']);
  await assert.rejects(montarEnvelopesOwner({ eu: dono.eu, colecoes: [{ id: cols[0].corpo.id, erro: 'adulterado' }], alvo: novo.membro }), /colecao_ilegivel/);
});

/** Coleção com dono + ana, um item com uma versão anterior (v1) e um na lixeira. */
async function cenarioRotacao() {
  const { dono, corpo, colecao, item } = await cenario();
  const ana = await pessoa();
  const envAna = await montarMembro({ eu: dono.eu, colecao, membro: ana.membro, permissao: 'ver' });
  const edicao = await c.cifrarV1(colecao.chave, JSON.stringify({ senha: 'nova', notas: '' }), c.aad.itemSegredo(ORG, corpo.id, item.id, 'login', 1, 2));
  const meta2 = await c.cifrarV1(colecao.chave, JSON.stringify(LOGIN.meta), c.aad.itemMeta(ORG, corpo.id, item.id, 'login', 1, 2));
  const lixo = await montarItem({ eu: dono.eu, colecao, tipo: 'nota', meta: { titulo: 'L' }, segredo: { conteudo: 'na lixeira' } });
  const itens = [
    { id: item.id, colecao_id: corpo.id, tipo: 'login', versao: 2, chave_ver: 1, meta_cif: meta2, segredo_cif: edicao },
    { ...linhaItem(corpo.id, lixo), segredo_cif: lixo.segredo_cif },
  ];
  const versoes = [{ item_id: item.id, tipo: 'login', versao: 1, chave_ver: 1, meta_cif: item.meta_cif, segredo_cif: item.segredo_cif }];
  const membros = [{ usuario_id: dono.eu.usuario.id }, { usuario_id: ana.eu.usuario.id }];
  return { dono, ana, envAna, corpo, colecao, item, lixo, itens, versoes, membros };
}

test('montarRotacao: chave nova para os membros; a chave antiga não decifra nada recifrado', async () => {
  const s = await cenarioRotacao();
  const r = await montarRotacao({ eu: s.dono.eu, colecao: s.colecao, membros: s.membros, pessoas: [s.ana.membro], itens: s.itens, versoes: s.versoes });
  assert.equal(r.chave_ver_atual, 1);
  assert.deepEqual(r.envelopes.map((e) => e.usuario_id), s.membros.map((m) => m.usuario_id));
  assert.deepEqual(r.itens.map((i) => [i.id, i.versao]), [[s.item.id, 2], [s.lixo.id, 1]]);
  assert.deepEqual(r.versoes.map((v) => [v.item_id, v.versao]), [[s.item.id, 1]]);
  // A ana (membro atual) abre a chave nova (chave_ver 2) e decifra tudo.
  const linhaNova = linhaCol(s.corpo.id, 2, r.nome_cif, r.envelopes[1].chave_colecao_cif, 'ver');
  const aberto = await abrirSync({ colecoes: [linhaNova], itens: [{ ...linhaItem(s.corpo.id, { ...s.itens[0], chave_ver: 2, meta_cif: r.itens[0].meta_cif }, 2) }] }, s.ana.eu);
  const col = aberto.colecoes.get(s.corpo.id);
  assert.equal(col.nome, 'Fin');
  assert.equal(aberto.itens[0].meta.titulo, 'Banco');
  const resp = { segredo_cif: r.itens[0].segredo_cif, versao: 2, chave_ver: 2 };
  assert.equal((await abrirSegredo({ eu: s.ana.eu, colecao: col, item: aberto.itens[0], resp })).senha, 'nova');
  // A chave antiga (que um ex-membro guardou) não abre nenhum blob novo.
  const antiga = await c.abrirX1(s.ana.eu, s.envAna.chave_colecao_cif, c.aad.envColecao(ORG, s.corpo.id, s.ana.eu.usuario.id, 1));
  for (const [blob, aad] of [
    [r.itens[0].meta_cif, c.aad.itemMeta(ORG, s.corpo.id, s.item.id, 'login', 2, 2)],
    [r.itens[0].segredo_cif, c.aad.itemSegredo(ORG, s.corpo.id, s.item.id, 'login', 2, 2)],
    [r.versoes[0].segredo_cif, c.aad.itemSegredo(ORG, s.corpo.id, s.item.id, 'login', 2, 1)],
    [r.nome_cif, c.aad.colecaoNome(ORG, s.corpo.id, 2)],
  ]) {
    await assert.rejects(c.decifrarV1(antiga, blob, aad));
  }
});

test('montarRotacao recusa blob adulterado e membro com chave divergente', async () => {
  const s = await cenarioRotacao();
  const base = { eu: s.dono.eu, colecao: s.colecao, membros: s.membros, pessoas: [s.ana.membro], itens: s.itens, versoes: s.versoes };
  await assert.rejects(montarRotacao({ ...base, itens: [{ ...s.itens[0], tipo: 'nota' }, s.itens[1]] }), /adulterado/);
  await assert.rejects(montarRotacao({ ...base, versoes: [{ ...s.versoes[0], versao: 2 }] }), /adulterado/);
  const outra = await pessoa();
  await assert.rejects(montarRotacao({ ...base, pessoas: [{ ...s.ana.membro, chave_publica: outra.membro.chave_publica }] }), /chave_publica_divergente/);
  await assert.rejects(montarRotacao({ ...base, pessoas: [] }), /fingerprint_nao_confirmado/);
});

test('rotacionarColecao: busca membros, lixeira, segredos e versões pela API e envia o corpo completo', async () => {
  const s = await cenarioRotacao();
  const pedidos = [];
  const respostas = {
    [`GET /colecoes/${s.corpo.id}/membros`]: s.membros.map((m) => ({ ...m, permissao: 'ver', chave_ver: 1 })),
    'GET /membros': [s.dono.membro, s.ana.membro],
    'GET /sync': { colecoes: [], itens: [{ ...s.itens[0] }, { id: crypto.randomUUID(), colecao_id: crypto.randomUUID() }] },
    [`GET /colecoes/${s.corpo.id}/lixeira`]: [{ ...s.itens[1], segredo_cif: undefined }],
    [`GET /itens/${s.item.id}/segredo`]: { segredo_cif: s.itens[0].segredo_cif, versao: 2, chave_ver: 1 },
    [`GET /itens/${s.lixo.id}/segredo`]: { segredo_cif: s.lixo.segredo_cif, versao: 1, chave_ver: 1 },
    [`GET /itens/${s.item.id}/versoes`]: [{ versao: 1, chave_ver: 1 }],
    [`GET /itens/${s.lixo.id}/versoes`]: [],
    [`GET /itens/${s.item.id}/versoes/1`]: { meta_cif: s.item.meta_cif, segredo_cif: s.item.segredo_cif, chave_ver: 1 },
  };
  const pedir = async (metodo, caminho, corpo) => {
    pedidos.push(`${metodo} ${caminho}`);
    if (metodo === 'POST') return { corpo };
    return respostas[`${metodo} ${caminho}`];
  };
  const { corpo } = await rotacionarColecao({ eu: s.dono.eu, colecao: s.colecao, pedir });
  assert.equal(pedidos.at(-1), `POST /colecoes/${s.corpo.id}/rotacionar`);
  assert.deepEqual(corpo.itens.map((i) => i.id), [s.item.id, s.lixo.id]);
  assert.deepEqual(corpo.versoes.map((v) => [v.item_id, v.versao]), [[s.item.id, 1]]);
  // Segredo com versão diferente da linha (rollback) interrompe antes de enviar.
  respostas[`GET /itens/${s.item.id}/segredo`] = { ...respostas[`GET /itens/${s.item.id}/segredo`], versao: 1 };
  pedidos.length = 0;
  await assert.rejects(rotacionarColecao({ eu: s.dono.eu, colecao: s.colecao, pedir }), /adulterado/);
  assert.ok(!pedidos.some((p) => p.startsWith('POST')));
});
