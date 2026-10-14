import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as c from '../../public/js/cripto.js';

const V = JSON.parse(readFileSync(new URL('../vetores/vetores.json', import.meta.url), 'utf8'));
const d = c.deB64u;
const texto = (b) => new TextDecoder().decode(b);
const { usuario, org, colecao } = V.ids;

test('argon2id confere com vetor python', async () => {
  const mk = await c.derivarMasterKey(V.kdf.senha, d(V.kdf.sal), V.kdf.kdf);
  assert.equal(c.b64u(mk), V.kdf.master_key);
});

test('derivarMasterKey recusa kdf mais fraco que o padrão', async () => {
  await assert.rejects(c.derivarMasterKey('x', d(V.kdf.sal), { tipo: 'argon2id', m: 1024, t: 3, p: 1 }), /kdf_invalido/);
  await assert.rejects(c.derivarMasterKey('x', d(V.kdf.sal), { tipo: 'pbkdf2', m: 65536, t: 3, p: 1 }), /kdf_invalido/);
});

test('hkdf auth/kek conferem', async () => {
  const mk = d(V.kdf.master_key);
  assert.equal(c.b64u(await c.derivarAuthHash(mk)), V.kdf.auth_hash);
  const kek = await c.derivarKek(mk);
  assert.equal(kek.extractable, false);
  const { pt, iv, aad, env } = V.kdf.kek_v1;
  assert.equal(await c._paraTesteCifrarV1(kek, d(pt), aad, d(iv)), env);
  assert.equal(c.b64u(await c.decifrarV1(kek, env, aad)), pt);
});

test('hkdf recup-auth/recup-kek conferem', async () => {
  const rk = d(V.recovery.bytes);
  assert.equal(c.b64u(await c.derivarRecupAuth(rk)), V.recovery.recup_auth);
  const { pt, iv, aad, env } = V.recovery.recup_kek_v1;
  assert.equal(await c._paraTesteCifrarV1(await c.derivarRecupKek(rk), d(pt), aad, d(iv)), env);
});

test('v1 confere com vetor python', async () => {
  const { chave, iv, pt_texto, aad, env } = V.v1;
  assert.equal(await c._paraTesteCifrarV1(d(chave), pt_texto, aad, d(iv)), env);
  assert.equal(texto(await c.decifrarV1(d(chave), env, aad)), pt_texto);
});

test('v1 cifra/decifra ida e volta', async () => {
  const k = c.gerarChaveAes();
  const aad = c.aad.privKey(usuario);
  const env = await c.cifrarV1(k, 'olá', aad);
  assert.match(env, /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$/);
  assert.equal(texto(await c.decifrarV1(k, env, aad)), 'olá');
  assert.notEqual(await c.cifrarV1(k, 'olá', aad), env, 'IV aleatório');
  assert.equal((await c.importarChaveAes(k)).extractable, false);
});

test('v1 com AAD diferente falha', async () => {
  const { chave, aad, env } = V.v1;
  await assert.rejects(c.decifrarV1(d(chave), env, aad + 'x'));
  await assert.rejects(c.decifrarV1(d(chave), env, c.aad.userKey(usuario)));
});

test('v1 com 1 bit trocado no ct falha', async () => {
  const { chave, aad, env } = V.v1;
  const [p, iv, ct] = env.split('.');
  const b = d(ct); b[0] ^= 1;
  await assert.rejects(c.decifrarV1(d(chave), `${p}.${iv}.${c.b64u(b)}`, aad));
  await assert.rejects(c.decifrarV1(d(chave), 'v2.' + env.slice(3), aad), /envelope_invalido/);
});

test('x1 confere com vetor python', async () => {
  const x = V.x1;
  const env = await c._paraTesteEnvelopeX1(d(x.dest_pub), d(x.collection_key), x.aad, d(x.eph_priv_pkcs8), d(x.eph_pub), d(x.iv));
  assert.equal(env, x.env);
  const ck = await c.abrirX1({ privada: d(x.dest_priv_pkcs8), publica: d(x.dest_pub) }, x.env, x.aad);
  assert.equal(c.b64u(ck), x.collection_key);
});

test('x1 ida e volta com par novo', async () => {
  const par = await c.gerarParX25519();
  assert.equal(par.publica.length, 32);
  const ck = c.gerarChaveAes();
  const aad = c.aad.envColecao(org, colecao, usuario, 1);
  const env = await c.envelopeX1(par.publica, ck, aad);
  assert.match(env, /^x1\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$/);
  const privada = await c.importarPrivadaX25519(par.privadaPkcs8);
  assert.equal(privada.extractable, false);
  assert.deepEqual(await c.abrirX1({ privada, publica: par.publica }, env, aad), ck);
});

test('x1 com chave privada errada falha', async () => {
  const x = V.x1;
  const outro = await c.gerarParX25519();
  await assert.rejects(c.abrirX1({ privada: outro.privadaPkcs8, publica: d(x.dest_pub) }, x.env, x.aad));
  // pública própria errada muda o salt do HKDF
  await assert.rejects(c.abrirX1({ privada: d(x.dest_priv_pkcs8), publica: outro.publica }, x.env, x.aad));
});

test('x1 com AAD diferente falha', async () => {
  const x = V.x1;
  const par = { privada: d(x.dest_priv_pkcs8), publica: d(x.dest_pub) };
  await assert.rejects(c.abrirX1(par, x.env, c.aad.envColecao(org, colecao, usuario, 2)));
});

test('aad segue a tabela §3.3', () => {
  const item = '11111111-2222-4333-8444-555555555555';
  assert.equal(c.aad.userKey(usuario), `cofre-emp/v1|userkey|${usuario}`);
  assert.equal(c.aad.userKeyRecup(usuario), `cofre-emp/v1|userkey-recup|${usuario}`);
  assert.equal(c.aad.privKey(usuario), `cofre-emp/v1|privkey|${usuario}`);
  assert.equal(c.aad.envColecao(org, colecao, usuario, 3), `cofre-emp/v1|env-colecao|${org}|${colecao}|${usuario}|3`);
  assert.equal(c.aad.colecaoNome(org, colecao, 2), `cofre-emp/v1|colecao-nome|${org}|${colecao}|2`);
  assert.equal(c.aad.itemMeta(org, colecao, item, 2, 5), `cofre-emp/v1|item-meta|${org}|${colecao}|${item}|2|5`);
  assert.equal(c.aad.itemSegredo(org, colecao, item, 2, 5), `cofre-emp/v1|item-segredo|${org}|${colecao}|${item}|2|5`);
  assert.equal(c.aad.userKey(usuario.toUpperCase()), c.aad.userKey(usuario), 'uuid em minúsculas');
  assert.throws(() => c.aad.userKey('abc|x'), /uuid_invalido/);
  assert.throws(() => c.aad.colecaoNome(org, colecao, 0), /inteiro_invalido/);
});

test('recovery key formata e relê (com/sem hífen, minúscula)', () => {
  const bytes = d(V.recovery.bytes);
  const fmt = c.formatarRecoveryKey(bytes);
  assert.equal(fmt, V.recovery.formatada);
  assert.match(fmt, /^([A-Z2-7]{4}-){12}[A-Z2-7]{4}$/);
  assert.deepEqual(c.lerRecoveryKey(fmt), bytes);
  assert.deepEqual(c.lerRecoveryKey(fmt.replace(/-/g, '')), bytes);
  assert.deepEqual(c.lerRecoveryKey(fmt.toLowerCase()), bytes);
  const novo = c.gerarRecoveryKey();
  assert.deepEqual(c.lerRecoveryKey(c.formatarRecoveryKey(novo)), novo);
  assert.throws(() => c.lerRecoveryKey(fmt.slice(0, -1)), /recovery_key_invalida/);
  assert.throws(() => c.lerRecoveryKey(fmt.replace(/^./, '1')), /recovery_key_invalida/);
});

test('fingerprint de vetor conhecido', async () => {
  assert.equal(await c.fingerprint(d(V.fingerprint.pub)), V.fingerprint.fp);
  assert.match(V.fingerprint.fp, /^([0-9A-F]{4} ){7}[0-9A-F]{4}$/);
});

test('validarSenhaMestra 11 recusa / 12 aceita / emoji conta como 1', () => {
  assert.equal(c.validarSenhaMestra('a'.repeat(11)), false);
  assert.equal(c.validarSenhaMestra('a'.repeat(12)), true);
  assert.equal(c.validarSenhaMestra('a'.repeat(10) + '😀'), false, '11 code points');
  assert.equal(c.validarSenhaMestra('a'.repeat(11) + '😀'), true, '12 code points');
});

test('detectarSuporte falso sem X25519', async () => {
  assert.equal(await c.detectarSuporte(), true, 'Node >= 22 suporta X25519');
  const semX25519 = {
    getRandomValues: (a) => a,
    subtle: { generateKey: async () => { throw new DOMException('não suportado', 'NotSupportedError'); } },
  };
  assert.equal(await c.detectarSuporte(semX25519), false);
  assert.equal(await c.detectarSuporte({ getRandomValues: (a) => a }), false, 'sem subtle');
  assert.equal(await c.detectarSuporte(null), false, 'sem crypto');
});

test('base64url sem padding e estrito', () => {
  assert.equal(c.b64u(new Uint8Array([251, 255])), '-_8');
  assert.deepEqual(c.deB64u('-_8'), new Uint8Array([251, 255]));
  assert.throws(() => c.deB64u('-_8='), /base64url_invalido/);
  assert.throws(() => c.deB64u('+/8'), /base64url_invalido/);
});
