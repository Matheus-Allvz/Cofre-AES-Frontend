// Cliente da API (/api/v1, mesma origem). Sessão só no cookie HttpOnly: nada de token em JS.

const MENSAGENS = {
  credenciais_invalidas: 'E-mail ou senha-mestra incorretos.',
  bloqueado: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  convite_invalido: 'Convite inválido. Confira o link recebido.',
  convite_expirado: 'Convite expirado, já usado ou revogado. Peça um novo ao administrador.',
  conta_suspensa: 'Conta suspensa. Fale com o administrador.',
  nao_autenticado: 'Sessão encerrada. Entre de novo.',
  sem_permissao: 'Sem permissão para esta ação.',
  csrf: 'Requisição recusada pelo servidor.',
  dados_invalidos: 'Dados recusados pelo servidor.',
  ocupado: 'Servidor ocupado, tente em instantes.',
  mfa_requerido: 'Digite o código do app autenticador ou um código de recuperação.',
  mfa_invalido: 'Código inválido ou já usado. Aguarde o próximo código do app.',
  mfa_configuracao_requerida: 'A política da organização exige MFA: configure-o para continuar.',
  mfa_ja_ativo: 'O MFA já está ativo nesta conta.',
  mfa_nao_iniciado: 'Comece a configuração do MFA de novo.',
  mfa_inativo: 'O MFA não está ativo nesta conta.',
  politica_mfa: 'A política da organização não permite desativar o MFA.',
  token_invalido: 'A recuperação expirou ou já foi usada. Comece de novo.',
  nao_encontrado: 'Não encontrado.',
};

export class ErroApi extends Error {
  constructor(status, codigo) {
    super(codigo);
    this.status = status;
    this.codigo = codigo;
  }
}

export const mensagem = (e) =>
  e instanceof ErroApi
    ? (MENSAGENS[e.codigo] ?? `Erro da API (HTTP ${e.status}).`)
    : 'Falha de rede ou da aplicação. Tente novamente.';

// Código para status sem corpo {"erro"} (ex.: 503 de proxy sem JSON).
const PADRAO = { 422: 'dados_invalidos', 503: 'ocupado' };

/**
 * api('POST', '/login', {...}) → JSON (ou null em 204); lança ErroApi com o código {"erro"}.
 * `keepalive` deixa a requisição terminar com a aba fechando (logout no pagehide).
 */
export async function api(metodo, caminho, corpo, { keepalive = false } = {}) {
  const headers = {};
  if (metodo !== 'GET') headers['X-Cofre'] = '1'; // D15: exigido em não-GET autenticado
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(`/api/v1${caminho}`, {
    method: metodo,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
    keepalive,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const dados = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw new ErroApi(r.status, dados?.erro ?? PADRAO[r.status] ?? 'erro_http');
  return dados;
}
