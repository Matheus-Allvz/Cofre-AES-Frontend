// Cofre sem servidor (Fase 6): AAD de coleção/item (§3.3) amarra org, coleção, item, chave_ver e
// versão; blob adulterado, movido ou com versão errada não decifra e não derruba os demais.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../../public/js/cripto.js';
import {
  abrirItem, abrirSegredo, abrirSync, abrirVersao, copiarComLimpeza, montarColecao, montarEdicao, montarItem, montarNomeColecao, pode,
} from '../../public/js/cofre.js';

const ORG = '11111111-1111-4111-8111-111111111111';

async function pessoa(papel = 'owner', estado = 'ativo') {
  const par = await c.gerarParX25519();
  const id = crypto.randomUUID();
  return {
    eu: { usuario: { id, org_id: ORG }, privada: await c.importarPrivadaX25519(par.privadaPkcs8), publica: par.publica },
    membro: { id, papel, estado, chave_publica: c.b64u(par.publica) },
  };
}

// "Servidor" mínimo: devolve linhas no formato de GET /sync.
const linhaSync = (col, envelope, nomeCif) => ({
  id: col, nome_cif: nomeCif, chave_ver: 1, permissao: envelope.permissao, chave_colecao_cif: envelope.chave_colecao_cif, rotacao_pendente: false,
});
const linhaItem = (colId, corpo, versao = 1) => ({
  id: corpo.id, colecao_id: colId, tipo: corpo.tipo, versao, chave_ver: corpo.chave_ver, meta_cif: corpo.meta_cif, rotacao_senha_pendente: false,
});
const LOGIN = { meta: { titulo: 'Banco', usuario: 'ana', urls: ['https://banco.invalid'] }, segredo: { senha: 'S3nha!', notas: '' } };

async function cenario() {
  const dono = await pessoa();
  const outroDono = await pessoa();
  const admin = await pessoa('admin');
  const suspenso = await pessoa('owner', 'suspenso');
  const membros = [dono.membro, outroDono.membro, admin.membro, suspenso.membro];
  const { corpo, colecao } = await montarColecao({ eu: dono.eu, nome: 'Financeiro', membros });
  const sync = (eu, itens = []) => ({
    colecoes: [linhaSync(corpo.id, corpo.envelopes.find((e) => e.usuario_id === eu.usuario.id), corpo.nome_cif)],
    itens,
  });
  return { dono, outroDono, admin, corpo, colecao, sync };
}

test('montarColecao: envelope gerenciar só para mim e para owners ativos; cada um abre a coleção', async () => {
  const { dono, outroDono, corpo, sync } = await cenario();
  assert.deepEqual(new Set(corpo.envelopes.map((e) => e.usuario_id)), new Set([dono.eu.usuario.id, outroDono.eu.usuario.id]));
  assert.ok(corpo.envelopes.every((e) => e.permissao === 'gerenciar' && /^x1\./.test(e.chave_colecao_cif)));
  for (const p of [dono, outroDono]) {
    const col = (await abrirSync(sync(p.eu), p.eu)).colecoes.get(corpo.id);
    assert.equal(col.nome, 'Financeiro');
    assert.equal(col.chave.extractable, false);
  }
});

test('envelope de outro destinatário não abre: coleção marcada adulterada', async () => {
  const { admin, corpo, dono } = await cenario();
  const envDono = corpo.envelopes.find((e) => e.usuario_id === dono.eu.usuario.id);
  const r = await abrirSync({ colecoes: [linhaSync(corpo.id, envDono, corpo.nome_cif)], itens: [] }, admin.eu);
  assert.equal(r.colecoes.get(corpo.id).erro, 'adulterado');
});

test('item: ida e volta, e AAD com versão errada não decifra', async () => {
  const { dono, colecao, corpo } = await cenario();
  const item = await montarItem({ eu: dono.eu, colecao, tipo: 'login', ...LOGIN });
  assert.match(item.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const aberto = await abrirItem(ORG, colecao, linhaItem(corpo.id, item));
  assert.deepEqual(aberto.meta, LOGIN.meta);
  const resp = { segredo_cif: item.segredo_cif, versao: 1, chave_ver: 1 };
  assert.deepEqual(await abrirSegredo({ eu: dono.eu, colecao, item: aberto, resp }), LOGIN.segredo);
  // Mesmo blob anunciado como versão 2 (ou chave_ver 2): o AAD muda e o GCM recusa.
  assert.equal((await abrirItem(ORG, colecao, linhaItem(corpo.id, item, 2))).erro, 'adulterado');
  await assert.rejects(abrirSegredo({ eu: dono.eu, colecao, item: aberto, resp: { ...resp, versao: 2 } }));
  assert.equal((await abrirItem(ORG, colecao, { ...linhaItem(corpo.id, item), chave_ver: 2 })).erro, 'adulterado');
});

test('edição cifra com versao+1; histórico abre com a versão dele', async () => {
  const { dono, colecao, corpo } = await cenario();
  const item = await montarItem({ eu: dono.eu, colecao, tipo: 'nota', meta: { titulo: 'n' }, segredo: { conteudo: 'v1' } });
  const ed = await montarEdicao({
    eu: dono.eu, colecao, item: { id: item.id, versao: 1, tipo: 'nota' }, meta: { titulo: 'n' }, segredo: { conteudo: 'v2' }, senhaTrocada: true,
  });
  assert.equal(ed.ifMatch, '1');
  assert.equal(ed.corpo.senha_trocada, true);
  assert.equal((await abrirItem(ORG, colecao, { ...linhaItem(corpo.id, item, 2), meta_cif: ed.corpo.meta_cif })).meta.titulo, 'n');
  assert.equal((await abrirItem(ORG, colecao, { ...linhaItem(corpo.id, item, 1), meta_cif: ed.corpo.meta_cif })).erro, 'adulterado');
  const resp = { meta_cif: item.meta_cif, segredo_cif: item.segredo_cif, chave_ver: 1 };
  assert.deepEqual(await abrirVersao({ eu: dono.eu, colecao, item, versao: 1, resp }), { meta: { titulo: 'n' }, segredo: { conteudo: 'v1' } });
  await assert.rejects(abrirVersao({ eu: dono.eu, colecao, item, versao: 2, resp }));
});

test('segredo ou meta movidos de um item para outro não decifram (AAD com item_id)', async () => {
  const { dono, colecao, corpo } = await cenario();
  const a = await montarItem({ eu: dono.eu, colecao, tipo: 'login', ...LOGIN });
  const b = await montarItem({ eu: dono.eu, colecao, tipo: 'login', ...LOGIN });
  await assert.rejects(abrirSegredo({ eu: dono.eu, colecao, item: { id: b.id }, resp: { segredo_cif: a.segredo_cif, versao: 1, chave_ver: 1 } }));
  assert.equal((await abrirItem(ORG, colecao, { ...linhaItem(corpo.id, b), meta_cif: a.meta_cif })).erro, 'adulterado');
});

test('abrirSync: 1 caractere trocado no ct marca só aquele item; id não-UUID também', async () => {
  const { dono, colecao, corpo, sync } = await cenario();
  const itens = [];
  for (const t of ['x', 'y', 'z']) itens.push(await montarItem({ eu: dono.eu, colecao, tipo: 'nota', meta: { titulo: t }, segredo: { conteudo: t } }));
  const linhas = itens.map((i) => linhaItem(corpo.id, i));
  const [pre, iv, ct] = linhas[1].meta_cif.split('.');
  linhas[1].meta_cif = [pre, iv, (ct[0] === 'A' ? 'B' : 'A') + ct.slice(1)].join('.');
  linhas.push({ ...linhaItem(corpo.id, itens[0]), id: 'nao-e-uuid' });
  const r = await abrirSync(sync(dono.eu, linhas), dono.eu);
  assert.deepEqual(r.itens.map((i) => i.meta?.titulo ?? i.erro), ['x', 'adulterado', 'z', 'adulterado']);
});

test('renomear cifra com a chave_ver atual', async () => {
  const { dono, colecao, corpo } = await cenario();
  const r = await montarNomeColecao({ eu: dono.eu, colecao, nome: ' Novo ' });
  const envDono = corpo.envelopes.find((e) => e.usuario_id === dono.eu.usuario.id);
  const aberto = await abrirSync({ colecoes: [linhaSync(corpo.id, envDono, r.nome_cif)], itens: [] }, dono.eu);
  assert.equal(aberto.colecoes.get(corpo.id).nome, 'Novo');
});

test('conteúdo fora do §3.4 é recusado antes de cifrar', async () => {
  const { dono, colecao } = await cenario();
  await assert.rejects(montarItem({ eu: dono.eu, colecao, tipo: 'cartao', meta: { titulo: 'x' }, segredo: {} }), /tipo_invalido/);
  await assert.rejects(montarItem({ eu: dono.eu, colecao, tipo: 'nota', meta: { titulo: 'x', extra: 1 }, segredo: {} }), /conteudo_invalido/);
  await assert.rejects(montarItem({ eu: dono.eu, colecao, tipo: 'nota', meta: { titulo: ' ' }, segredo: {} }), /titulo_obrigatorio/);
});

test('níveis de permissão em ordem', () => {
  assert.ok(pode('gerenciar', 'editar') && pode('ver', 'ver') && !pode('ver_sem_revelar', 'ver') && !pode('editar', 'gerenciar'));
});

test('copiarComLimpeza: limpa se o conteúdo é o copiado ou se a leitura é negada; não mexe se mudou', async () => {
  const negado = async () => { throw new Error('NotAllowedError'); };
  const casos = [
    { ler: (cb) => cb.valor, mudar: null, final: '' },
    { ler: negado, mudar: 'outra coisa', final: '' },
    { ler: undefined, mudar: 'outra coisa', final: '' },
    { ler: (cb) => cb.valor, mudar: 'outra coisa', final: 'outra coisa' },
  ];
  for (const caso of casos) {
    const cb = { valor: null, async writeText(t) { this.valor = t; } };
    if (caso.ler) cb.readText = async () => caso.ler(cb);
    let tarefa;
    const agendar = (fn, ms) => { assert.equal(ms, 30_000); tarefa = fn; return 1; };
    await copiarComLimpeza('segredo', { clipboard: cb, agendar });
    assert.equal(cb.valor, 'segredo');
    if (caso.mudar) cb.valor = caso.mudar;
    await tarefa();
    assert.equal(cb.valor, caso.final);
  }
  await assert.rejects(copiarComLimpeza('x', { clipboard: {} }), /clipboard_indisponivel/);
});
