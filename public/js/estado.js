// Estado da sessão no browser: só em memória (nada em Web Storage, banco do navegador ou cookie).
// A chave privada é CryptoKey não-extraível; masterKey, kek e userKey nem chegam aqui.

export const estado = { usuario: null, privada: null, publica: null, aviso: null };

export function definir(dados) {
  Object.assign(estado, dados);
}

/** Descarta usuário e chaves (logout, sessão expirada). */
export function limpar() {
  estado.usuario = null;
  estado.privada = null;
  estado.publica = null;
}
