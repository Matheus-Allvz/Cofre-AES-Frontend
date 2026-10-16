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
  email_em_uso: 'Este e-mail já tem conta ou convite pendente.',
  convite_usado: 'Este convite já foi usado.',
  estado_invalido: 'Ação não vale para o estado atual desta pessoa. Recarregue a lista.',
  fingerprint_divergente: 'O fingerprint não confere com a chave guardada no servidor. Não ative esta conta.',
  ultimo_owner: 'A organização precisa de pelo menos um owner ativo.',
  auto_acao: 'Você não pode fazer isto com a própria conta.',
  conflito_versao: 'O item foi alterado em outro lugar. O cofre foi recarregado: refaça a alteração.',
  chave_ver_desatualizada: 'A chave da coleção mudou. O cofre foi recarregado: refaça a alteração.',
  colecao_nao_vazia: 'A coleção só pode ser excluída vazia (inclusive a lixeira).',
  envelopes_incompletos: 'Faltou dar acesso a algum owner ativo. Recarregue e tente de novo.',
  destinatario_invalido: 'Alguma pessoa da lista não está ativa. Recarregue e tente de novo.',
  envelopes_duplicados: 'Pessoa repetida na lista de acesso.',
  blob_grande: 'Conteúdo grande demais (máximo 64 KiB por campo cifrado).',
  id_em_uso: 'Identificador já usado. Tente de novo.',
  item_excluido: 'Este item está na lixeira.',
  fora_da_lixeira: 'Este item não está na lixeira.',
  versao_requerida: 'Versão do item ausente. Recarregue o cofre.',
  ja_membro: 'Esta pessoa já tem acesso à coleção.',
  owner_gerencia: 'Owner sempre gerencia todas as coleções: não dá para reduzir nem tirar o acesso dele.',
  ultimo_gerente: 'A coleção precisa de pelo menos uma pessoa com permissão de gerenciar.',
  rotacao_incompleta: 'A coleção mudou durante a rotação (membros ou itens).',
  corpo_grande: 'Dados grandes demais para uma requisição.',
  membros_alterados: 'Alguém ganhou ou perdeu acesso à coleção durante a rotação.',
  envelope_existente: 'Esta pessoa já tem a chave de alguma das coleções enviadas. Recarregue e tente de novo.',
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
 * `keepalive` deixa a requisição terminar com a aba fechando (logout no pagehide); `headers`
 * extras (ex.: If-Match do PUT de item).
 */
export async function api(metodo, caminho, corpo, { keepalive = false, headers: extras = {} } = {}) {
  const headers = { ...extras };
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
