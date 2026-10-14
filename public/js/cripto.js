// Núcleo criptográfico do cliente (ARQUITETURA-ALVO §2 e §3).
// Funções puras, sem DOM: o mesmo módulo roda no browser e no Node >= 22.
import { argon2id } from '../vendor/hash-wasm/index.esm.min.js';

const subtle = () => globalThis.crypto.subtle;
const utf8 = new TextEncoder();
const VAZIO = new Uint8Array(0);

export const KDF_PADRAO = Object.freeze({ tipo: 'argon2id', m: 65536, t: 3, p: 1 });

// ---------- base64url sem padding (RFC 4648 §5) ----------

export function b64u(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function deB64u(str) {
  if (typeof str !== 'string' || !/^[A-Za-z0-9_-]*$/.test(str) || str.length % 4 === 1) {
    throw new Error('base64url_invalido');
  }
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const out = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  if (b64u(out) !== str) throw new Error('base64url_invalido'); // rejeita bits sobrando
  return out;
}

const bytesDe = (dados) => (typeof dados === 'string' ? utf8.encode(dados) : dados);
const aleatorio = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

// ---------- senha-mestra e KDF ----------

export const normalizarSenha = (s) => s.normalize('NFKC');

/** Mínimo de 12 code points após NFKC (um emoji simples conta como 1). */
export const validarSenhaMestra = (s) => typeof s === 'string' && [...normalizarSenha(s)].length >= 12;

function conferirKdf(kdf) {
  // Recusa parâmetros mais fracos que o padrão (servidor não pode rebaixar o KDF).
  const ok = kdf && kdf.tipo === 'argon2id'
    && Number.isInteger(kdf.m) && kdf.m >= KDF_PADRAO.m && kdf.m <= 1048576
    && Number.isInteger(kdf.t) && kdf.t >= KDF_PADRAO.t && kdf.t <= 10
    && Number.isInteger(kdf.p) && kdf.p >= KDF_PADRAO.p && kdf.p <= 4;
  if (!ok) throw new Error('kdf_invalido');
}

/** senha -> NFKC -> Argon2id -> masterKey (32 B). O chamador zera o buffer após derivar authHash/kek. */
export async function derivarMasterKey(senha, sal, kdf = KDF_PADRAO) {
  conferirKdf(kdf);
  if (!(sal instanceof Uint8Array) || sal.length !== 16) throw new Error('sal_invalido');
  return argon2id({
    password: utf8.encode(normalizarSenha(senha)),
    salt: sal,
    parallelism: kdf.p,
    iterations: kdf.t,
    memorySize: kdf.m,
    hashLength: 32,
    outputType: 'binary',
  });
}

// ---------- HKDF ----------

const importarHkdf = (ikm) => subtle().importKey('raw', ikm, 'HKDF', false, ['deriveBits', 'deriveKey']);

async function hkdfBits(ikm, info, salt = VAZIO) {
  const chave = await importarHkdf(ikm);
  const bits = await subtle().deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: utf8.encode(info) }, chave, 256);
  return new Uint8Array(bits);
}

async function hkdfAes(ikm, info, salt = VAZIO) {
  const chave = await importarHkdf(ikm);
  return subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: utf8.encode(info) },
    chave, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

export const derivarAuthHash = (masterKey) => hkdfBits(masterKey, 'cofre-emp/v1/auth');
export const derivarKek = (masterKey) => hkdfAes(masterKey, 'cofre-emp/v1/kek');
export const derivarRecupKek = (recoveryKey) => hkdfAes(recoveryKey, 'cofre-emp/v1/recup-kek');
export const derivarRecupAuth = (recoveryKey) => hkdfBits(recoveryKey, 'cofre-emp/v1/recup-auth');

// ---------- AES-256-GCM: envelope v1 ----------

/** userKey/collectionKey: 32 B aleatórios. Ficam em bytes para poderem ser re-envelopadas (§2). */
export const gerarChaveAes = () => aleatorio(32);

export function importarChaveAes(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32) throw new Error('chave_invalida');
  return subtle().importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

const comoChave = (chave) => (chave instanceof Uint8Array ? importarChaveAes(chave) : chave);

export async function _paraTesteCifrarV1(chave, dados, aad, iv) {
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: utf8.encode(aad) }, await comoChave(chave), bytesDe(dados));
  return `v1.${b64u(iv)}.${b64u(new Uint8Array(ct))}`;
}

/** Cifra bytes ou texto (UTF-8). `aad` é string construída por `aad.*`. */
export const cifrarV1 = (chave, dados, aad) => _paraTesteCifrarV1(chave, dados, aad, aleatorio(12));

const RE_V1 = /^v1\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{22,})$/;

/** Devolve os bytes em claro; lança se envelope, chave ou AAD não conferem. */
export async function decifrarV1(chave, env, aad) {
  const m = RE_V1.exec(env);
  if (!m) throw new Error('envelope_invalido');
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: deB64u(m[1]), additionalData: utf8.encode(aad) }, await comoChave(chave), deB64u(m[2]));
  return new Uint8Array(pt);
}

// ---------- X25519: envelope x1 ----------

/** Par novo: `publica` raw (32 B, vai em claro ao servidor) e `privadaPkcs8` (a cifrar sob a userKey). */
export async function gerarParX25519() {
  const par = await subtle().generateKey({ name: 'X25519' }, true, ['deriveBits']);
  return {
    publica: new Uint8Array(await subtle().exportKey('raw', par.publicKey)),
    privadaPkcs8: new Uint8Array(await subtle().exportKey('pkcs8', par.privateKey)),
  };
}

export const importarPrivadaX25519 = (pkcs8) => subtle().importKey('pkcs8', pkcs8, { name: 'X25519' }, false, ['deriveBits']);
const importarPublicaX25519 = (raw) => subtle().importKey('raw', raw, { name: 'X25519' }, true, []);

const concat = (a, b) => { const r = new Uint8Array(a.length + b.length); r.set(a); r.set(b, a.length); return r; };

async function chaveX1(privada, pubOutro, ephPub, pubDestino) {
  const shared = new Uint8Array(await subtle().deriveBits({ name: 'X25519', public: await importarPublicaX25519(pubOutro) }, privada, 256));
  return hkdfAes(shared, 'cofre-emp/v1/env-colecao', concat(ephPub, pubDestino));
}

export async function _paraTesteEnvelopeX1(pubDestino, collectionKeyBytes, aad, ephPrivadaPkcs8, ephPublica, iv) {
  if (pubDestino.length !== 32 || collectionKeyBytes.length !== 32) throw new Error('tamanho_invalido');
  const k = await chaveX1(await importarPrivadaX25519(ephPrivadaPkcs8), pubDestino, ephPublica, pubDestino);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: utf8.encode(aad) }, k, collectionKeyBytes);
  return `x1.${b64u(ephPublica)}.${b64u(iv)}.${b64u(new Uint8Array(ct))}`;
}

/** Envelopa a collectionKey (32 B) para a chave pública raw do destinatário. */
export async function envelopeX1(pubDestino, collectionKeyBytes, aad) {
  const eph = await gerarParX25519();
  return _paraTesteEnvelopeX1(pubDestino, collectionKeyBytes, aad, eph.privadaPkcs8, eph.publica, aleatorio(12));
}

const RE_X1 = /^x1\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{22,})$/;

/**
 * Abre um x1. `par` = { privada: CryptoKey X25519 (ou PKCS8), publica: raw 32 B do próprio usuário }:
 * a pública entra no salt do HKDF e não é recuperável de uma privada não-extraível.
 */
export async function abrirX1(par, env, aad) {
  const m = RE_X1.exec(env);
  if (!m) throw new Error('envelope_invalido');
  const ephPub = deB64u(m[1]);
  const privada = par.privada instanceof Uint8Array ? await importarPrivadaX25519(par.privada) : par.privada;
  const k = await chaveX1(privada, ephPub, ephPub, par.publica);
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: deB64u(m[2]), additionalData: utf8.encode(aad) }, k, deB64u(m[3]));
  return new Uint8Array(pt);
}

// ---------- AAD (§3.3) ----------

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function id(v) {
  const s = String(v).toLowerCase();
  if (!RE_UUID.test(s)) throw new Error('uuid_invalido');
  return s;
}
function n(v) {
  if (!Number.isInteger(v) || v < 1) throw new Error('inteiro_invalido');
  return String(v);
}
const P = 'cofre-emp/v1';

export const aad = Object.freeze({
  userKey: (usuarioId) => `${P}|userkey|${id(usuarioId)}`,
  userKeyRecup: (usuarioId) => `${P}|userkey-recup|${id(usuarioId)}`,
  privKey: (usuarioId) => `${P}|privkey|${id(usuarioId)}`,
  envColecao: (orgId, colecaoId, usuarioDestId, chaveVer) =>
    `${P}|env-colecao|${id(orgId)}|${id(colecaoId)}|${id(usuarioDestId)}|${n(chaveVer)}`,
  colecaoNome: (orgId, colecaoId, chaveVer) => `${P}|colecao-nome|${id(orgId)}|${id(colecaoId)}|${n(chaveVer)}`,
  itemMeta: (orgId, colecaoId, itemId, chaveVer, versao) =>
    `${P}|item-meta|${id(orgId)}|${id(colecaoId)}|${id(itemId)}|${n(chaveVer)}|${n(versao)}`,
  itemSegredo: (orgId, colecaoId, itemId, chaveVer, versao) =>
    `${P}|item-segredo|${id(orgId)}|${id(colecaoId)}|${id(itemId)}|${n(chaveVer)}|${n(versao)}`,
});

// ---------- Recovery Key (base32 RFC 4648, sem padding, grupos de 4) ----------

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const gerarRecoveryKey = () => aleatorio(32);

export function formatarRecoveryKey(bytes) {
  if (bytes.length !== 32) throw new Error('recovery_key_invalida');
  let bits = 0, acc = 0, s = '';
  for (const b of bytes) {
    acc = (acc << 8) | b; bits += 8;
    while (bits >= 5) { bits -= 5; s += B32[(acc >>> bits) & 31]; }
  }
  if (bits) s += B32[(acc << (5 - bits)) & 31];
  return s.match(/.{1,4}/g).join('-');
}

export function lerRecoveryKey(texto) {
  const s = String(texto).replace(/[-\s]/g, '').toUpperCase();
  if (!/^[A-Z2-7]{52}$/.test(s)) throw new Error('recovery_key_invalida');
  const out = new Uint8Array(32);
  let bits = 0, acc = 0, i = 0;
  for (const c of s) {
    acc = (acc << 5) | B32.indexOf(c); bits += 5;
    if (bits >= 8) { bits -= 8; if (i < 32) out[i++] = (acc >>> bits) & 255; }
  }
  if (acc & ((1 << bits) - 1)) throw new Error('recovery_key_invalida'); // bits finais devem ser zero
  return out;
}

// ---------- fingerprint e suporte ----------

/** Primeiros 16 B de SHA-256(pública raw), hex maiúsculo em 8 grupos de 4. */
export async function fingerprint(pubRaw) {
  const h = new Uint8Array(await subtle().digest('SHA-256', pubRaw)).slice(0, 16);
  return [...h].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase().match(/.{4}/g).join(' ');
}

/** true se o ambiente tem WebCrypto, WebAssembly e X25519. `c` injetável para teste. */
export async function detectarSuporte(c = globalThis.crypto) {
  try {
    if (!c?.subtle || typeof c.getRandomValues !== 'function' || typeof WebAssembly !== 'object') return false;
    await c.subtle.generateKey({ name: 'X25519' }, false, ['deriveBits']);
    return true;
  } catch {
    return false;
  }
}
