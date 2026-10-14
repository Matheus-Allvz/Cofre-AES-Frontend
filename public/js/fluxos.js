// Fluxos de conta sem DOM e sem rede: montam os corpos das requisições e abrem as chaves.
// As telas e o E2E (Node) usam estas mesmas funções. Formatos e AAD: ARQUITETURA-ALVO §2/§3.
import * as c from './cripto.js';

const sal16 = () => globalThis.crypto.getRandomValues(new Uint8Array(16));

/** senha → masterKey → { authHash, kek }; a masterKey é zerada antes de sair. */
async function derivar(senha, sal, kdf) {
  const mk = await c.derivarMasterKey(senha, sal, kdf);
  try {
    return { authHash: await c.derivarAuthHash(mk), kek: await c.derivarKek(mk) };
  } finally {
    mk.fill(0);
  }
}

/**
 * Aceite de convite: gera userKey, par X25519 e Recovery Key no cliente.
 * Devolve o corpo de POST /convites/aceitar, a Recovery Key formatada (kit) e o fingerprint.
 */
export async function montarAceite({ token, nome, senha, usuarioId }) {
  if (!c.validarSenhaMestra(senha)) throw new Error('senha_curta');
  const sal = sal16();
  const { authHash, kek } = await derivar(senha, sal, c.KDF_PADRAO);
  const userKey = c.gerarChaveAes();
  const rk = c.gerarRecoveryKey();
  const par = await c.gerarParX25519();
  try {
    const corpo = {
      token,
      nome,
      kdf: { ...c.KDF_PADRAO },
      sal: c.b64u(sal),
      auth_hash: c.b64u(authHash),
      chave_usuario_cif: await c.cifrarV1(kek, userKey, c.aad.userKey(usuarioId)),
      chave_usuario_recup_cif: await c.cifrarV1(await c.derivarRecupKek(rk), userKey, c.aad.userKeyRecup(usuarioId)),
      recup_auth: c.b64u(await c.derivarRecupAuth(rk)),
      chave_publica: c.b64u(par.publica),
      chave_privada_cif: await c.cifrarV1(userKey, par.privadaPkcs8, c.aad.privKey(usuarioId)),
    };
    return { corpo, recoveryKey: c.formatarRecoveryKey(rk), fingerprint: await c.fingerprint(par.publica) };
  } finally {
    userKey.fill(0);
    rk.fill(0);
    par.privadaPkcs8.fill(0);
    authHash.fill(0);
  }
}

/** Resposta do prelogin → corpo de POST /login e a kek (para abrir a userKey depois). */
export async function prepararLogin(email, senha, pre) {
  const { authHash, kek } = await derivar(senha, c.deB64u(pre.sal), pre.kdf);
  try {
    return { corpo: { email, auth_hash: c.b64u(authHash) }, kek };
  } finally {
    authHash.fill(0);
  }
}

/** Resposta do login + kek → { privada (CryptoKey não-extraível), publica (raw) }. */
export async function abrirChaves(resp, kek) {
  const id = resp.usuario.id;
  const userKey = await c.decifrarV1(kek, resp.chave_usuario_cif, c.aad.userKey(id));
  let pkcs8;
  try {
    pkcs8 = await c.decifrarV1(userKey, resp.chave_privada_cif, c.aad.privKey(id));
    return { privada: await c.importarPrivadaX25519(pkcs8), publica: c.deB64u(resp.chave_publica) };
  } finally {
    userKey.fill(0);
    pkcs8?.fill(0);
  }
}

/**
 * Troca de senha-mestra (RF-I10): só a userKey é re-envelopada.
 * `perfil` = GET /eu. Senha atual errada falha aqui mesmo (a userKey não abre).
 */
export async function montarTrocaSenha({ perfil, senhaAtual, senhaNova }) {
  if (!c.validarSenhaMestra(senhaNova)) throw new Error('senha_curta');
  const id = perfil.usuario.id;
  const atual = await derivar(senhaAtual, c.deB64u(perfil.sal), perfil.kdf);
  let userKey, nova;
  try {
    userKey = await c.decifrarV1(atual.kek, perfil.chave_usuario_cif, c.aad.userKey(id)).catch(() => {
      throw new Error('senha_atual_incorreta');
    });
    const sal = sal16();
    nova = await derivar(senhaNova, sal, c.KDF_PADRAO);
    return {
      auth_hash_atual: c.b64u(atual.authHash),
      kdf: { ...c.KDF_PADRAO },
      sal: c.b64u(sal),
      auth_hash: c.b64u(nova.authHash),
      chave_usuario_cif: await c.cifrarV1(nova.kek, userKey, c.aad.userKey(id)),
    };
  } finally {
    userKey?.fill(0);
    atual.authHash.fill(0);
    nova?.authHash.fill(0);
  }
}

/** Texto do kit de emergência (download .txt). */
export function textoKit({ orgNome, email, recoveryKey, fingerprint }) {
  return [
    'COFRE AES EMPRESARIAL — KIT DE EMERGÊNCIA',
    '',
    `Organização: ${orgNome}`,
    `Conta: ${email}`,
    `Gerado em: ${new Date().toISOString().slice(0, 10)}`,
    '',
    'Recovery Key:',
    recoveryKey,
    '',
    `Fingerprint da sua chave pública: ${fingerprint}`,
    '',
    'Guarde este arquivo fora do computador (impresso ou em local seguro).',
    'Sem a senha-mestra e sem este kit, o acesso à conta não pode ser recuperado.',
    '',
  ].join('\n');
}
