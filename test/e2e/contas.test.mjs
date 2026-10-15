// [FE-E2E] Contas contra a API real, com os mesmos módulos do front (cripto.js/fluxos.js).
// Pré-requisito: bash scripts/e2e-backend.sh <backend>; set -a; . ./.e2e.env; set +a.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../../public/js/cripto.js';
import { abrirChaves, montarAceite, montarTrocaSenha, prepararLogin } from '../../public/js/fluxos.js';

const { E2E_API: API, E2E_CONVITE_OWNER: CONVITE, E2E_EMAIL_OWNER: EMAIL_OWNER = 'owner@e2e.invalid' } = process.env;
const opcoes = { skip: API ? false : 'E2E_API ausente: rode scripts/e2e-backend.sh e carregue .e2e.env' };
if (!API) console.warn('[FE-E2E] pulado: E2E_API ausente');

const SENHA_OWNER = 'senha-mestra do owner (e2e)';
const SENHA_NOVA = 'nova senha-mestra do owner (e2e)';
const EMAIL_MEMBER = 'member@e2e.invalid';
const SENHA_MEMBER = 'senha-mestra do member (e2e)';

/** "Navegador" mínimo: cookie `sessao` gerenciado à mão; X-Cofre em não-GET, como api.js. */
function navegador() {
  let cookie = null;
  return async (metodo, caminho, corpo) => {
    const headers = {};
    if (metodo !== 'GET') headers['X-Cofre'] = '1';
    if (corpo !== undefined) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    const r = await fetch(`${API}/api/v1${caminho}`, {
      method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const setCookie = r.headers.getSetCookie().find((s) => s.startsWith('sessao='));
    if (setCookie) cookie = setCookie.split(';')[0];
    return { status: r.status, dados: r.status === 204 ? null : await r.json().catch(() => null), setCookie };
  };
}

async function aceitar(nav, token, senha, nome) {
  const consulta = await nav('POST', '/convites/consultar', { token });
  assert.equal(consulta.status, 200);
  const { corpo } = await montarAceite({ token, nome, senha, usuarioId: consulta.dados.usuario_id });
  const r = await nav('POST', '/convites/aceitar', corpo);
  assert.equal(r.status, 201, JSON.stringify(r.dados));
  return { consulta: consulta.dados, aceite: r.dados };
}

async function entrar(nav, email, senha) {
  const pre = await nav('POST', '/prelogin', { email });
  assert.equal(pre.status, 200);
  const { corpo, kek } = await prepararLogin(email, senha, pre.dados);
  return { ...(await nav('POST', '/login', corpo)), kek };
}

/** A privada decifrada abre um envelope x1 feito para a própria chave pública. */
async function confereChaves(resp, kek) {
  const chaves = await abrirChaves(resp, kek);
  assert.equal(chaves.privada.extractable, false);
  const ck = c.gerarChaveAes();
  const a = c.aad.envColecao(resp.usuario.org_id, crypto.randomUUID(), resp.usuario.id, 1);
  assert.deepEqual(await c.abrirX1(chaves, await c.envelopeX1(chaves.publica, ck, a), a), ck);
}

const owner = navegador();

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
  await confereChaves(r.dados, r.kek);

  const negado = await member('POST', '/convites', { email: 'x@e2e.invalid', papel: 'member' });
  assert.deepEqual([negado.status, negado.dados], [403, { erro: 'sem_permissao' }]);
});

test('troca de senha-mestra: senha antiga 401, outra sessão 401, chaves continuam abrindo', opcoes, async () => {
  const outra = navegador();
  assert.equal((await entrar(outra, EMAIL_OWNER, SENHA_OWNER)).status, 200);

  const perfil = (await owner('GET', '/eu')).dados;
  const corpo = await montarTrocaSenha({ perfil, senhaAtual: SENHA_OWNER, senhaNova: SENHA_NOVA });
  assert.equal((await owner('POST', '/eu/senha', corpo)).status, 204);

  assert.equal((await owner('GET', '/eu')).status, 200);
  assert.equal((await outra('GET', '/eu')).status, 401);
  assert.equal((await entrar(navegador(), EMAIL_OWNER, SENHA_OWNER)).status, 401);
  const nova = await entrar(navegador(), EMAIL_OWNER, SENHA_NOVA);
  assert.equal(nova.status, 200);
  await confereChaves(nova.dados, nova.kek);

  assert.equal((await owner('POST', '/logout')).status, 204);
  assert.equal((await owner('GET', '/eu')).status, 401);
});
