// Fluxos de conta sem servidor: aceite → login → chaves abrem; troca de senha re-envelopa a userKey.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../../public/js/cripto.js';
import { abrirChaves, montarAceite, montarTrocaSenha, prepararLogin, textoKit } from '../../public/js/fluxos.js';
import { api, ErroApi, mensagem } from '../../public/js/api.js';

const ID = '0b7c3f4e-3d2a-4c1b-9a8e-1f2e3d4c5b6a';
const SENHA = 'correto cavalo bateria grampo';

// "Servidor" mínimo: guarda o que o aceite mandou e devolve como /login e /eu devolveriam.
const perfilDe = (corpo) => ({
  usuario: { id: ID },
  kdf: corpo.kdf,
  sal: corpo.sal,
  chave_usuario_cif: corpo.chave_usuario_cif,
  chave_privada_cif: corpo.chave_privada_cif,
  chave_publica: corpo.chave_publica,
});

async function privadaAbre({ privada, publica }) {
  const ck = c.gerarChaveAes();
  const a = c.aad.envColecao(ID, ID, ID, 1);
  assert.deepEqual(await c.abrirX1({ privada, publica }, await c.envelopeX1(publica, ck, a), a), ck);
}

let aceite;

test('montarAceite gera corpo no formato do contrato e kit, sem a senha', async () => {
  aceite = await montarAceite({ token: 't', nome: 'Ana', senha: SENHA, usuarioId: ID });
  const { corpo } = aceite;
  assert.deepEqual(corpo.kdf, { tipo: 'argon2id', m: 65536, t: 3, p: 1 });
  for (const k of ['chave_usuario_cif', 'chave_usuario_recup_cif', 'chave_privada_cif']) {
    assert.match(corpo[k], /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$/);
  }
  for (const k of ['auth_hash', 'recup_auth', 'chave_publica']) assert.match(corpo[k], /^[A-Za-z0-9_-]{43}$/);
  assert.match(corpo.sal, /^[A-Za-z0-9_-]{22}$/);
  assert.ok(!JSON.stringify(corpo).includes(SENHA));
  assert.equal(c.lerRecoveryKey(aceite.recoveryKey).length, 32);
  assert.equal(aceite.fingerprint, await c.fingerprint(c.deB64u(corpo.chave_publica)));
  assert.match(textoKit({ orgNome: 'O', email: 'e', ...aceite }), new RegExp(aceite.recoveryKey));
  await assert.rejects(montarAceite({ token: 't', nome: 'A', senha: 'curta', usuarioId: ID }), /senha_curta/);
});

test('login com a senha abre a chave privada; authHash confere com o do aceite', async () => {
  const perfil = perfilDe(aceite.corpo);
  const { corpo, kek } = await prepararLogin('a@b', SENHA, perfil);
  assert.equal(corpo.auth_hash, aceite.corpo.auth_hash);
  await privadaAbre(await abrirChaves(perfil, kek));
  const errado = await prepararLogin('a@b', `${SENHA}x`, perfil);
  assert.notEqual(errado.corpo.auth_hash, aceite.corpo.auth_hash);
  await assert.rejects(abrirChaves(perfil, errado.kek));
});

test('Recovery Key do kit abre a userKey (chave_usuario_recup_cif)', async () => {
  const rk = c.lerRecoveryKey(aceite.recoveryKey);
  const userKey = await c.decifrarV1(await c.derivarRecupKek(rk), aceite.corpo.chave_usuario_recup_cif, c.aad.userKeyRecup(ID));
  assert.equal(userKey.length, 32);
  assert.equal(c.b64u(await c.derivarRecupAuth(rk)), aceite.corpo.recup_auth);
});

test('troca de senha re-envelopa a userKey: nova senha abre a mesma privada', async () => {
  const perfil = perfilDe(aceite.corpo);
  await assert.rejects(montarTrocaSenha({ perfil, senhaAtual: 'senha errada 123', senhaNova: 'outra senha longa' }), /senha_atual_incorreta/);
  await assert.rejects(montarTrocaSenha({ perfil, senhaAtual: SENHA, senhaNova: 'curta' }), /senha_curta/);
  const troca = await montarTrocaSenha({ perfil, senhaAtual: SENHA, senhaNova: 'nova senha-mestra longa' });
  assert.equal(troca.auth_hash_atual, aceite.corpo.auth_hash);
  assert.notEqual(troca.sal, aceite.corpo.sal);
  const novo = { ...perfil, sal: troca.sal, chave_usuario_cif: troca.chave_usuario_cif };
  const { corpo, kek } = await prepararLogin('a@b', 'nova senha-mestra longa', novo);
  assert.equal(corpo.auth_hash, troca.auth_hash);
  await privadaAbre(await abrirChaves(novo, kek)); // chave_privada_cif não mudou
});

test('api: X-Cofre em não-GET, same-origin, erro {"erro"} vira ErroApi', async (t) => {
  const chamadas = [];
  t.mock.method(globalThis, 'fetch', async (url, op) => {
    chamadas.push({ url, op });
    if (url.endsWith('/login')) return new Response('{"erro":"credenciais_invalidas"}', { status: 401 });
    if (url.endsWith('/logout')) return new Response(null, { status: 204 });
    return new Response('{"ok":1}', { status: 200 });
  });
  assert.deepEqual(await api('GET', '/eu'), { ok: 1 });
  assert.equal(await api('POST', '/logout'), null);
  const e = await api('POST', '/login', { a: 1 }).catch((x) => x);
  assert.ok(e instanceof ErroApi && e.status === 401 && e.codigo === 'credenciais_invalidas');
  assert.equal(mensagem(e), 'E-mail ou senha-mestra incorretos.');
  assert.equal(chamadas[0].url, '/api/v1/eu');
  assert.equal(chamadas[0].op.headers['X-Cofre'], undefined);
  assert.equal(chamadas[1].op.headers['X-Cofre'], '1');
  assert.equal(chamadas[2].op.headers['Content-Type'], 'application/json');
  assert.ok(chamadas.every(({ op }) => op.credentials === 'same-origin'));
});
