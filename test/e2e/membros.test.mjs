// [FE-E2E] Membros (Fase 5) contra a API real: convite → aceite → o owner confere o fingerprint
// calculado no cliente dele a partir de GET /membros → ativo; suspender/reativar; remover.
// Roda depois de contas.test.mjs (ordem alfabética), que deixa o owner com MFA em `compartilhado`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintConfere, fingerprintDoMembro } from '../../public/js/fluxos.js';
import { EMAIL_OWNER, aceitar, compartilhado, configurarMfa, entrar, navegador, opcoes } from './comum.mjs';

const EMAIL = 'pessoa@e2e.invalid';
const SENHA = 'senha-mestra da pessoa (e2e)';

test('owner convida, member aceita, owner confirma com o fingerprint calculado do GET /membros → ativo', opcoes, async () => {
  const owner = navegador();
  const { senha, mfa } = compartilhado.owner;
  assert.equal((await entrar(owner, EMAIL_OWNER, senha, { codigo_recuperacao: mfa.codigos[4] })).status, 200);
  const conv = await owner('POST', '/convites', { email: EMAIL, papel: 'member' });
  assert.equal(conv.status, 201);

  const pessoa = navegador();
  const { aceite, fingerprint: daPessoa } = await aceitar(pessoa, conv.dados.link.slice('/#/convite/'.length), SENHA, 'Pessoa E2E');
  assert.equal(aceite.estado, 'aceito');
  assert.equal((await entrar(pessoa, EMAIL, SENHA)).status, 200);
  const { gerar } = await configurarMfa(pessoa); // política padrão: MFA obrigatório
  const antes = await pessoa('GET', '/org');
  assert.deepEqual([antes.status, antes.dados], [403, { erro: 'sem_permissao' }]);

  // Cliente do owner: chave pública de GET /membros → fingerprint local; a pessoa "dita" o dela.
  const m = (await owner('GET', '/membros')).dados.find((x) => x.email === EMAIL);
  assert.equal(m.estado, 'aceito');
  assert.equal(m.fingerprint_confirmado, null);
  const calculado = await fingerprintDoMembro(m);
  assert.ok(fingerprintConfere(daPessoa, calculado), 'o fingerprint ditado confere com o calculado pelo owner');

  const errado = await owner('POST', `/membros/${m.id}/confirmar`, { fingerprint: '0000 '.repeat(8).trim() });
  assert.deepEqual([errado.status, errado.dados], [422, { erro: 'fingerprint_divergente' }]);
  const ok = await owner('POST', `/membros/${m.id}/confirmar`, { fingerprint: calculado });
  assert.equal(ok.status, 200, JSON.stringify(ok.dados));
  assert.deepEqual(ok.dados, { id: m.id, estado: 'ativo', fingerprint_confirmado: calculado });
  assert.equal((await pessoa('GET', '/org')).status, 200); // mesma sessão, já ativa
  compartilhado.pessoa = { id: m.id, gerar };
});

test('suspender derruba a sessão e bloqueia o login; reativar devolve o login; remover anonimiza', opcoes, async () => {
  const owner = navegador();
  const { senha, mfa } = compartilhado.owner;
  assert.equal((await entrar(owner, EMAIL_OWNER, senha, { codigo_recuperacao: mfa.codigos[5] })).status, 200);
  const { id, gerar } = compartilhado.pessoa;
  const pessoa = navegador();
  assert.equal((await entrar(pessoa, EMAIL, SENHA, { totp: await gerar() })).status, 200);

  assert.equal((await owner('POST', `/membros/${id}/suspender`)).status, 200);
  assert.equal((await pessoa('GET', '/eu')).status, 401);
  const suspensa = await entrar(navegador(), EMAIL, SENHA);
  assert.deepEqual([suspensa.status, suspensa.dados], [403, { erro: 'conta_suspensa' }]);

  assert.equal((await owner('POST', `/membros/${id}/reativar`)).status, 200);
  assert.equal((await entrar(navegador(), EMAIL, SENHA, { totp: await gerar() })).status, 200);

  const proprio = (await owner('GET', '/eu')).dados.usuario.id;
  const auto = await owner('POST', `/membros/${proprio}/suspender`);
  assert.deepEqual([auto.status, auto.dados], [409, { erro: 'ultimo_owner' }]);

  const r = await owner('DELETE', `/membros/${id}`);
  assert.deepEqual([r.status, r.dados], [200, { relatorio: [] }]);
  const lista = (await owner('GET', '/membros')).dados;
  assert.ok(!lista.some((x) => x.id === id || x.email === EMAIL));
  const removida = await entrar(navegador(), EMAIL, SENHA);
  assert.deepEqual([removida.status, removida.dados], [401, { erro: 'credenciais_invalidas' }]);
});
