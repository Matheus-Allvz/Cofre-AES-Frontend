// [FE-E2E] Contas contra a API real, com os mesmos módulos do front (cripto.js/fluxos.js).
// Pré-requisito: bash scripts/e2e-backend.sh <backend>; set -a; . ./.e2e.env; set +a.
// MFA é opcional por padrão (Fase 7); o owner liga a política e o fluxo passa pela configuração de TOTP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarTrocaSenha } from '../../public/js/fluxos.js';
import {
  API, CONVITE, EMAIL_OWNER, RAND, aceitar, compartilhado, configurarMfa, confereChaves, entrar, navegador, opcoes,
} from './comum.mjs';

if (!API) console.warn('[FE-E2E] pulado: E2E_API ausente');

// Sentinelas (RNF-C01): nenhuma das duas pode aparecer no banco nem nos logs (cofre.test.mjs).
export const SENHA_OWNER = `SENT-MESTRA-${RAND} do owner`;
export const SENHA_NOVA = `SENT-MESTRA-${RAND} nova do owner`;
const EMAIL_MEMBER = 'member@e2e.invalid';
const SENHA_MEMBER = 'senha-mestra do member (e2e)';

const owner = navegador();
let mfaOwner;

test('owner aceita convite do bootstrap, faz login e decifra a própria chave privada', opcoes, async () => {
  const { aceite } = await aceitar(owner, CONVITE, SENHA_OWNER, 'Owner E2E');
  assert.equal(aceite.estado, 'ativo');

  const errado = await entrar(navegador(), EMAIL_OWNER, 'senha-mestra errada do owner');
  assert.deepEqual([errado.status, errado.dados], [401, { erro: 'credenciais_invalidas' }]);

  const r = await entrar(owner, EMAIL_OWNER, SENHA_OWNER);
  assert.equal(r.status, 200);
  for (const atributo of [/HttpOnly/i, /Secure/i, /SameSite=Strict/i, /Path=\/api/]) assert.match(r.setCookie, atributo);
  assert.equal(r.dados.usuario.estado, 'ativo');
  await confereChaves(r.dados, r.kek);
  assert.equal((await owner('GET', '/eu')).status, 200);

  const reuso = await owner('POST', '/convites/consultar', { token: CONVITE });
  assert.deepEqual([reuso.status, reuso.dados], [410, { erro: 'convite_expirado' }]);
});

test('MFA opcional por padrão; com a política ligada, sessão pendente até configurar o TOTP', opcoes, async () => {
  const padrao = (await owner('GET', '/eu')).dados;
  assert.deepEqual(padrao.politica, { mfa_obrigatorio: false, inatividade_min: 15 });
  assert.equal(padrao.mfa_pendente, false);
  const pol = await owner('PUT', '/org/politica', { mfa_obrigatorio: true, inatividade_min: 15 });
  assert.equal(pol.status, 200, JSON.stringify(pol.dados));
  const eu = (await owner('GET', '/eu')).dados;
  assert.equal(eu.mfa_pendente, true);
  const bloqueado = await owner('GET', '/org');
  assert.deepEqual([bloqueado.status, bloqueado.dados], [403, { erro: 'mfa_configuracao_requerida' }]);

  mfaOwner = await configurarMfa(owner);
  compartilhado.owner = { senha: SENHA_OWNER, mfa: mfaOwner };
  assert.equal((await owner('GET', '/org')).status, 200); // mesma sessão, liberada

  const semCodigo = await entrar(navegador(), EMAIL_OWNER, SENHA_OWNER);
  assert.deepEqual([semCodigo.status, semCodigo.dados], [401, { erro: 'mfa_requerido' }]);
  const comCodigo = await entrar(navegador(), EMAIL_OWNER, SENHA_OWNER, { totp: await mfaOwner.gerar() });
  assert.equal(comCodigo.status, 200);
  assert.equal(comCodigo.dados.mfa_pendente, false);
  await confereChaves(comCodigo.dados, comCodigo.kek);
});

test('owner convida member; member aceita; member faz login; estado = aceito', opcoes, async () => {
  const conv = await owner('POST', '/convites', { email: EMAIL_MEMBER, papel: 'member' });
  assert.equal(conv.status, 201);
  assert.match(conv.dados.link, /^\/#\/convite\/[A-Za-z0-9_-]{43}$/);
  const member = navegador();
  const { aceite } = await aceitar(member, conv.dados.link.slice('/#/convite/'.length), SENHA_MEMBER, 'Member E2E');
  assert.equal(aceite.estado, 'aceito');

  const r = await entrar(member, EMAIL_MEMBER, SENHA_MEMBER);
  assert.equal(r.status, 200);
  assert.equal(r.dados.usuario.estado, 'aceito');
  assert.equal(r.dados.usuario.papel, 'member');
  assert.equal(r.dados.mfa_pendente, true);
  await confereChaves(r.dados, r.kek);

  const pendente = await member('POST', '/convites', { email: 'x@e2e.invalid', papel: 'member' });
  assert.deepEqual([pendente.status, pendente.dados], [403, { erro: 'mfa_configuracao_requerida' }]);
  await configurarMfa(member);
  const negado = await member('POST', '/convites', { email: 'x@e2e.invalid', papel: 'member' });
  assert.deepEqual([negado.status, negado.dados], [403, { erro: 'sem_permissao' }]);
});

test('troca de senha-mestra exige TOTP: senha antiga 401, outra sessão 401, chaves continuam abrindo', opcoes, async () => {
  const outra = navegador();
  const login = await entrar(outra, EMAIL_OWNER, SENHA_OWNER, { codigo_recuperacao: mfaOwner.codigos[0] });
  assert.equal(login.status, 200);

  const perfil = (await owner('GET', '/eu')).dados;
  const corpo = await montarTrocaSenha({ perfil, senhaAtual: SENHA_OWNER, senhaNova: SENHA_NOVA });
  const semTotp = await owner('POST', '/eu/senha', corpo);
  assert.deepEqual([semTotp.status, semTotp.dados], [401, { erro: 'mfa_requerido' }]);
  assert.equal((await owner('POST', '/eu/senha', { ...corpo, totp: await mfaOwner.gerar() })).status, 204);
  compartilhado.owner.senha = SENHA_NOVA;

  assert.equal((await owner('GET', '/eu')).status, 200);
  assert.equal((await outra('GET', '/eu')).status, 401);
  const antiga = await entrar(navegador(), EMAIL_OWNER, SENHA_OWNER, { codigo_recuperacao: mfaOwner.codigos[1] });
  assert.equal(antiga.status, 401);
  const nova = await entrar(navegador(), EMAIL_OWNER, SENHA_NOVA, { codigo_recuperacao: mfaOwner.codigos[1] });
  assert.equal(nova.status, 200);
  await confereChaves(nova.dados, nova.kek);

  assert.equal((await owner('POST', '/logout')).status, 204);
  assert.equal((await owner('GET', '/eu')).status, 401);
});
