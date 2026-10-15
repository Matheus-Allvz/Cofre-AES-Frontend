// [FE-E2E] MFA (reuso de códigos) e recuperação por kit contra a API real (RF-I03, RF-U06).
// Roda depois de contas.test.mjs (ordem alfabética), que deixa o owner com MFA em `compartilhado`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarConclusao, prepararRecuperacao } from '../../public/js/fluxos.js';
import {
  EMAIL_OWNER, aceitar, compartilhado, configurarMfa, confereChaves, entrar, navegador, opcoes, sentinela,
} from './comum.mjs';

const EMAIL = 'recupera@e2e.invalid';
const SENHA = 'senha-mestra de quem perde (e2e)';
const SENHA_NOVA = 'senha-mestra depois do kit (e2e)';

test('TOTP reutilizado no mesmo passo e código de recuperação reutilizado → 401 mfa_invalido', opcoes, async () => {
  const { senha, mfa } = compartilhado.owner;
  const codigo = await mfa.gerar();
  assert.equal((await entrar(navegador(), EMAIL_OWNER, senha, { totp: codigo })).status, 200);
  const reuso = await entrar(navegador(), EMAIL_OWNER, senha, { totp: codigo });
  assert.deepEqual([reuso.status, reuso.dados], [401, { erro: 'mfa_invalido' }]);

  const rec = mfa.codigos[2];
  assert.equal((await entrar(navegador(), EMAIL_OWNER, senha, { codigo_recuperacao: rec })).status, 200);
  const rec2 = await entrar(navegador(), EMAIL_OWNER, senha, { codigo_recuperacao: rec });
  assert.deepEqual([rec2.status, rec2.dados], [401, { erro: 'mfa_invalido' }]);
});

test('recuperação com kit: nova senha entra e a privada abre; senha antiga, kit antigo e sessões antigas → 401', opcoes, async () => {
  // Owner convida uma conta nova; ela aceita (kit), entra e configura o MFA.
  const owner = navegador();
  const { senha, mfa } = compartilhado.owner;
  assert.equal((await entrar(owner, EMAIL_OWNER, senha, { codigo_recuperacao: mfa.codigos[3] })).status, 200);
  const conv = await owner('POST', '/convites', { email: EMAIL, papel: 'member' });
  assert.equal(conv.status, 201);
  const antiga = navegador();
  const { recoveryKey } = await aceitar(antiga, conv.dados.link.slice('/#/convite/'.length), SENHA, 'Recupera E2E');
  assert.equal((await entrar(antiga, EMAIL, SENHA)).status, 200);
  const { gerar } = await configurarMfa(antiga);
  assert.equal((await antiga('GET', '/eu')).status, 200);

  // Kit sem segundo fator: não entrega nada.
  let prep = await prepararRecuperacao(recoveryKey);
  const semFator = await navegador()('POST', '/recuperar/iniciar', { email: EMAIL, recup_auth: prep.recupAuth });
  assert.deepEqual([semFator.status, semFator.dados], [401, { erro: 'mfa_requerido' }]);

  // Kit + TOTP: token, nova senha, kit novo.
  const nav = navegador();
  prep = await prepararRecuperacao(recoveryKey);
  const ini = await nav('POST', '/recuperar/iniciar', { email: EMAIL, recup_auth: prep.recupAuth, totp: await gerar() });
  assert.equal(ini.status, 200, JSON.stringify(ini.dados));
  sentinela(ini.dados.token);
  const { corpo, recoveryKey: kitNovo } = await montarConclusao({ resp: ini.dados, rk: prep.rk, senhaNova: SENHA_NOVA });
  sentinela(kitNovo, corpo.recup_auth);
  assert.equal((await nav('POST', '/recuperar/concluir', corpo)).status, 204);

  const nova = await entrar(navegador(), EMAIL, SENHA_NOVA, { totp: await gerar() });
  assert.equal(nova.status, 200);
  await confereChaves(nova.dados, nova.kek); // privada abre com a userKey re-envelopada
  const velha = await entrar(navegador(), EMAIL, SENHA);
  assert.deepEqual([velha.status, velha.dados], [401, { erro: 'credenciais_invalidas' }]);
  assert.equal((await antiga('GET', '/eu')).status, 401); // sessão anterior caiu

  const kitAntigo = await prepararRecuperacao(recoveryKey);
  const r = await navegador()('POST', '/recuperar/iniciar', { email: EMAIL, recup_auth: kitAntigo.recupAuth });
  assert.deepEqual([r.status, r.dados], [401, { erro: 'credenciais_invalidas' }]);
  const reuso = await nav('POST', '/recuperar/concluir', corpo);
  assert.deepEqual([reuso.status, reuso.dados], [401, { erro: 'token_invalido' }]);
});
