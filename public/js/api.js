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

/** api('POST', '/login', {...}) → JSON (ou null em 204); lança ErroApi com o código {"erro"}. */
export async function api(metodo, caminho, corpo) {
  const headers = {};
  if (metodo !== 'GET') headers['X-Cofre'] = '1'; // D15: exigido em não-GET autenticado
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(`/api/v1${caminho}`, {
    method: metodo,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const dados = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw new ErroApi(r.status, dados?.erro ?? (r.status === 422 ? 'dados_invalidos' : 'erro_http'));
  return dados;
}
