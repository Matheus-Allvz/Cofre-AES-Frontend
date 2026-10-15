// Apoio do E2E (não é teste): "navegador" com cookie, fluxos de conta e TOTP gerado no Node
// (o papel do app autenticador). Estado compartilhado entre os arquivos, que rodam em ordem alfabética.
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { appendFileSync, writeFileSync } from 'node:fs';
import * as c from '../../public/js/cripto.js';
import { abrirChaves, montarAceite, prepararLogin } from '../../public/js/fluxos.js';

export const { E2E_API: API, E2E_CONVITE_OWNER: CONVITE, E2E_EMAIL_OWNER: EMAIL_OWNER = 'owner@e2e.invalid' } = process.env;
export const opcoes = { skip: API ? false : 'E2E_API ausente: rode scripts/e2e-backend.sh e carregue .e2e.env' };
export const compartilhado = {};

// RNF-C01: sufixo aleatório dos sentinelas desta execução (SENT-MESTRA-<rand>, SENT-SENHA-<rand>…),
// procurados no pg_dump e nos logs da API pelo cofre.test.mjs.
export const RAND = randomBytes(6).toString('hex');

// Segredos gerados no E2E (base32, códigos, tokens): o CI confere que nenhum aparece nos logs da API.
const SENTINELAS = new URL('../../.e2e-sentinelas.txt', import.meta.url);
if (API) writeFileSync(SENTINELAS, '');
export const sentinela = (...valores) => appendFileSync(SENTINELAS, valores.map((v) => `${v}\n`).join(''));

/** "Navegador" mínimo: cookie `sessao` gerenciado à mão; X-Cofre em não-GET, como api.js. */
export function navegador() {
  let cookie = null;
  return async (metodo, caminho, corpo, extras = {}) => {
    const headers = { ...extras };
    if (metodo !== 'GET') headers['X-Cofre'] = '1';
    if (corpo !== undefined) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    const pedir = () => fetch(`${API}/api/v1${caminho}`, {
      method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    let r = await pedir();
    // Todos os arquivos do E2E saem do mesmo IP: o limite de 20/min por IP das rotas públicas
    // (RNF-01) é esperado aqui, não falha. Espera a janela (≤ 60 s) e repete uma vez; bloqueio
    // de conta (15 min) não é repetido.
    const espera = Number(r.headers.get('retry-after'));
    if (r.status === 429 && espera > 0 && espera <= 60) {
      console.error(`[e2e] 429 em ${metodo} ${caminho}: limite por IP, repetindo em ${espera} s`);
      await new Promise((ok) => setTimeout(ok, espera * 1000 + 200));
      r = await pedir();
    }
    const setCookie = r.headers.getSetCookie().find((s) => s.startsWith('sessao='));
    if (setCookie) cookie = setCookie.split(';')[0];
    return { status: r.status, dados: r.status === 204 ? null : await r.json().catch(() => null), setCookie };
  };
}

/** Aceita o convite como o browser; devolve também a Recovery Key do kit e o próprio fingerprint. */
export async function aceitar(nav, token, senha, nome) {
  const consulta = await nav('POST', '/convites/consultar', { token });
  assert.equal(consulta.status, 200);
  const { corpo, recoveryKey, fingerprint } = await montarAceite({ token, nome, senha, usuarioId: consulta.dados.usuario_id });
  const r = await nav('POST', '/convites/aceitar', corpo);
  assert.equal(r.status, 201, JSON.stringify(r.dados));
  sentinela(token, recoveryKey, corpo.recup_auth);
  return { consulta: consulta.dados, aceite: r.dados, recoveryKey, fingerprint };
}

/** prelogin → KDF → login (com segundo fator opcional: { totp } ou { codigo_recuperacao }). */
export async function entrar(nav, email, senha, fator = {}) {
  const pre = await nav('POST', '/prelogin', { email });
  assert.equal(pre.status, 200);
  const { corpo, kek } = await prepararLogin(email, senha, pre.dados);
  return { ...(await nav('POST', '/login', { ...corpo, ...fator })), kek };
}

/** A privada decifrada abre um envelope x1 feito para a própria chave pública. */
export async function confereChaves(resp, kek) {
  const chaves = await abrirChaves(resp, kek);
  assert.equal(chaves.privada.extractable, false);
  const ck = c.gerarChaveAes();
  const a = c.aad.envColecao(resp.usuario.org_id, crypto.randomUUID(), resp.usuario.id, 1);
  assert.deepEqual(await c.abrirX1(chaves, await c.envelopeX1(chaves.publica, ck, a), a), ck);
}

// ---------- TOTP (RFC 6238, SHA-1, 6 dígitos, 30 s) ----------

function deBase32(s) {
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, acc = 0;
  const out = [];
  for (const ch of s) {
    acc = (acc << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { bits -= 8; out.push((acc >>> bits) & 255); }
  }
  return Buffer.from(out);
}

export function codigoTotp(segredoBase32, passo) {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(passo));
  const h = createHmac('sha1', deBase32(segredoBase32)).update(contador).digest();
  const d = h[19] & 15;
  return String((h.readUInt32BE(d) & 0x7fffffff) % 1e6).padStart(6, '0');
}

/**
 * "App autenticador": cada chamada devolve um código de passo ainda não usado (o servidor recusa
 * reuso). Usa o passo seguinte (janela +1) e, se já gastou, espera o relógio andar.
 */
export function autenticador(segredoBase32) {
  let ultimo = -1;
  return async () => {
    const atual = Math.floor(Date.now() / 30_000);
    const passo = Math.max(atual, ultimo + 1);
    const espera = (passo - 1) * 30_000 - Date.now();
    if (espera > 0) await new Promise((ok) => setTimeout(ok, espera + 200));
    ultimo = passo;
    const codigo = codigoTotp(segredoBase32, passo);
    sentinela(codigo);
    return codigo;
  };
}

/** Configura o MFA da sessão: iniciar → código → confirmar. Devolve { gerar, codigos, segredo }. */
export async function configurarMfa(nav) {
  const ini = await nav('POST', '/eu/mfa/iniciar');
  assert.equal(ini.status, 200, JSON.stringify(ini.dados));
  const segredo = ini.dados.segredo_base32;
  assert.match(ini.dados.otpauth_uri, new RegExp(`^otpauth://totp/.+secret=${segredo}`));
  const gerar = autenticador(segredo);
  const conf = await nav('POST', '/eu/mfa/confirmar', { codigo: await gerar() });
  assert.equal(conf.status, 200, JSON.stringify(conf.dados));
  const codigos = conf.dados.codigos_recuperacao;
  assert.equal(codigos.length, 10);
  sentinela(segredo, ...codigos, ...codigos.map((x) => x.replace('-', '')));
  return { gerar, codigos, segredo };
}
