// Cofre (Fases 6 e 7) sem DOM: abre o sync, monta os corpos de coleção/item/membros/rotação e
// decifra o que as rotas auditadas devolvem. As telas e o E2E (Node) usam estas mesmas funções.
// Só `rotacionarColecao` conversa com a API, por uma função `pedir` injetada.
// Formatos e AAD: ARQUITETURA-ALVO §3. Todo AAD sai de aad.*, que só aceita UUID/inteiro: nenhum
// id do servidor entra no AAD sem passar por essa validação, e ids novos nascem aqui.
import * as c from './cripto.js';

const utf8 = new TextDecoder('utf-8', { fatal: true });
const json = async (promessa) => JSON.parse(utf8.decode(await promessa));

export const novoId = () => globalThis.crypto.randomUUID();

export const PERMISSOES = Object.freeze(['ver_sem_revelar', 'ver', 'editar', 'gerenciar']);
export const pode = (permissao, minimo) => PERMISSOES.indexOf(permissao) >= PERMISSOES.indexOf(minimo);

/** RF-O05: texto do tooltip/aviso de `ver_sem_revelar` (mesmo texto de docs/seguranca.md do BE). */
export const AVISO_VER_SEM_REVELAR = 'Ver sem revelar: a pessoa vê título, usuário e URLs, mas o servidor não entrega a senha a ela. '
  + 'Não protege contra quem usa a credencial (ela pode ver a senha em uso) e quem tem acesso à coleção '
  + 'tem a chave dela: com o conteúdo cifrado obtido por outro caminho, decifra; e pode forjar itens válidos.';

// §3.4: campos de cada tipo (meta / segredo). O que não está aqui não é cifrado nem exibido.
export const TIPOS = Object.freeze({
  login: { meta: ['titulo', 'usuario', 'urls'], segredo: ['senha', 'notas'] },
  nota: { meta: ['titulo'], segredo: ['conteudo'] },
  chave_api: { meta: ['titulo', 'validade'], segredo: ['valor', 'notas'] },
});

const so = (obj, permitidos) => obj !== null && typeof obj === 'object' && !Array.isArray(obj)
  && Object.keys(obj).every((k) => permitidos.includes(k));

function conferirConteudo(tipo, meta, segredo) {
  const t = TIPOS[tipo];
  if (!t) throw new Error('tipo_invalido');
  if (!so(meta, t.meta) || !so(segredo, t.segredo)) throw new Error('conteudo_invalido');
  if (typeof meta.titulo !== 'string' || !meta.titulo.trim()) throw new Error('titulo_obrigatorio');
  if (meta.urls !== undefined && !(Array.isArray(meta.urls) && meta.urls.every((u) => typeof u === 'string'))) {
    throw new Error('conteudo_invalido');
  }
}

/** §3.4: o JSON decifrado tem de ter só as chaves do tipo do item; senão o item foi adulterado. */
function doTipo(tipo, campo, obj) {
  if (!so(obj, TIPOS[tipo]?.[campo] ?? [])) throw new Error('adulterado');
  if (campo === 'meta' && typeof obj.titulo !== 'string') throw new Error('adulterado');
  return obj;
}

/** collectionKey (bytes) → CryptoKey não-extraível; os bytes são zerados. */
async function guardarChave(bytes) {
  try {
    return await c.importarChaveAes(bytes);
  } finally {
    bytes.fill(0);
  }
}

/**
 * Resposta de GET /sync → { colecoes: Map(id → coleção aberta), itens: [...] }.
 * `eu` = { usuario: {id, org_id}, privada, publica }. Coleção ou item que não abre (envelope,
 * AAD ou JSON inválido) volta marcado com `erro: 'adulterado'` e os demais seguem normais.
 */
export async function abrirSync(sync, eu) {
  const org = eu.usuario.org_id;
  const colecoes = new Map();
  for (const col of sync.colecoes) {
    // `envelope` fica para reabrir a collectionKey em bytes só na hora de compartilhar/rotacionar.
    const base = {
      id: col.id, chaveVer: col.chave_ver, permissao: col.permissao, rotacaoPendente: col.rotacao_pendente, envelope: col.chave_colecao_cif,
    };
    try {
      const bytes = await c.abrirX1(eu, col.chave_colecao_cif, c.aad.envColecao(org, col.id, eu.usuario.id, col.chave_ver));
      const chave = await guardarChave(bytes);
      const nome = utf8.decode(await c.decifrarV1(chave, col.nome_cif, c.aad.colecaoNome(org, col.id, col.chave_ver)));
      colecoes.set(col.id, { ...base, chave, nome });
    } catch {
      colecoes.set(col.id, { ...base, erro: 'adulterado' });
    }
  }
  const itens = await Promise.all(sync.itens.map((i) => abrirItem(org, colecoes.get(i.colecao_id), i)));
  return { colecoes, itens };
}

/** Linha de sync/lixeira → item com `meta` decifrada, ou `erro: 'adulterado'`. */
export async function abrirItem(org, colecao, i) {
  const item = {
    id: i.id, colecaoId: i.colecao_id, tipo: i.tipo, versao: i.versao, chaveVer: i.chave_ver,
    atualizadoEm: i.atualizado_em, atualizadoPor: i.atualizado_por, excluidoEm: i.excluido_em ?? null,
    rotacaoSenhaPendente: Boolean(i.rotacao_senha_pendente),
  };
  try {
    if (!colecao?.chave || i.chave_ver !== colecao.chaveVer || !TIPOS[i.tipo]) throw new Error('adulterado');
    const aadMeta = c.aad.itemMeta(org, colecao.id, i.id, i.tipo, i.chave_ver, i.versao);
    item.meta = doTipo(i.tipo, 'meta', await json(c.decifrarV1(colecao.chave, i.meta_cif, aadMeta)));
    return item;
  } catch {
    return { ...item, erro: 'adulterado' };
  }
}

/**
 * Nova coleção: collectionKey nova, nome cifrado e envelopes `gerenciar` para mim e para cada
 * owner ativo de GET /membros (D13). Devolve { corpo, colecao } (colecao já aberta, chave não-extraível).
 */
export async function montarColecao({ eu, nome, membros }) {
  if (typeof nome !== 'string' || !nome.trim()) throw new Error('nome_obrigatorio');
  const org = eu.usuario.org_id;
  const id = novoId();
  const bytes = c.gerarChaveAes();
  try {
    const destinos = [{ id: eu.usuario.id, publica: eu.publica }];
    for (const m of membros) {
      if (m.papel !== 'owner' || m.estado !== 'ativo' || m.id === eu.usuario.id) continue;
      const publica = c.deB64u(m.chave_publica);
      if (publica.length !== 32) throw new Error('chave_publica_invalida');
      destinos.push({ id: m.id, publica });
    }
    const envelopes = [];
    for (const d of destinos) {
      envelopes.push({
        usuario_id: d.id,
        permissao: 'gerenciar',
        chave_colecao_cif: await c.envelopeX1(d.publica, bytes, c.aad.envColecao(org, id, d.id, 1)),
      });
    }
    const nomeCif = await c.cifrarV1(bytes, nome.trim(), c.aad.colecaoNome(org, id, 1));
    const chave = await c.importarChaveAes(bytes);
    return {
      corpo: { id, nome_cif: nomeCif, envelopes },
      colecao: {
        id, chaveVer: 1, permissao: 'gerenciar', rotacaoPendente: false, chave, nome: nome.trim(),
        envelope: envelopes[0].chave_colecao_cif,
      },
    };
  } finally {
    bytes.fill(0);
  }
}

/** PUT /colecoes/{id}: nome novo cifrado com a chave_ver atual. */
export async function montarNomeColecao({ eu, colecao, nome }) {
  if (typeof nome !== 'string' || !nome.trim()) throw new Error('nome_obrigatorio');
  const aadNome = c.aad.colecaoNome(eu.usuario.org_id, colecao.id, colecao.chaveVer);
  return { chave_ver: colecao.chaveVer, nome_cif: await c.cifrarV1(colecao.chave, nome.trim(), aadNome) };
}

async function cifrarItem(org, colecao, id, versao, tipo, meta, segredo) {
  conferirConteudo(tipo, meta, segredo);
  const v = colecao.chaveVer;
  return {
    chave_ver: v,
    meta_cif: await c.cifrarV1(colecao.chave, JSON.stringify(meta), c.aad.itemMeta(org, colecao.id, id, tipo, v, versao)),
    segredo_cif: await c.cifrarV1(colecao.chave, JSON.stringify(segredo), c.aad.itemSegredo(org, colecao.id, id, tipo, v, versao)),
  };
}

/** POST /colecoes/{id}/itens: id novo do cliente, versao 1 no AAD. */
export async function montarItem({ eu, colecao, tipo, meta, segredo }) {
  const id = novoId();
  return { id, tipo, ...(await cifrarItem(eu.usuario.org_id, colecao, id, 1, tipo, meta, segredo)) };
}

/**
 * PUT /itens/{id} com If-Match: item.versao. Cifra já com versao+1 (a versão que o item terá);
 * em 409 o chamador re-sincroniza e monta de novo.
 */
export async function montarEdicao({ eu, colecao, item, meta, segredo, senhaTrocada = false }) {
  const corpo = await cifrarItem(eu.usuario.org_id, colecao, item.id, item.versao + 1, item.tipo, meta, segredo);
  return { ifMatch: String(item.versao), corpo: { ...corpo, senha_trocada: Boolean(senhaTrocada) } };
}

/**
 * Resposta de GET /itens/{id}/segredo → objeto do segredo (§3.4). Falha se adulterado/movido.
 * `versao`/`chave_ver` da resposta têm de ser os do item no sync: um segredo velho legítimo
 * (rollback) abriria com o AAD que o próprio servidor anuncia, então o AAD vem do sync.
 */
export async function abrirSegredo({ eu, colecao, item, resp }) {
  if (resp.versao !== item.versao || resp.chave_ver !== item.chaveVer) throw new Error('adulterado');
  const aadS = c.aad.itemSegredo(eu.usuario.org_id, colecao.id, item.id, item.tipo, item.chaveVer, item.versao);
  return doTipo(item.tipo, 'segredo', await json(c.decifrarV1(colecao.chave, resp.segredo_cif, aadS)));
}

/** Resposta de GET /itens/{id}/versoes/{v} → { meta, segredo } daquela versão. */
export async function abrirVersao({ eu, colecao, item, versao, resp }) {
  const org = eu.usuario.org_id;
  const aad = (f) => f(org, colecao.id, item.id, item.tipo, resp.chave_ver, versao);
  return {
    meta: doTipo(item.tipo, 'meta', await json(c.decifrarV1(colecao.chave, resp.meta_cif, aad(c.aad.itemMeta)))),
    segredo: doTipo(item.tipo, 'segredo', await json(c.decifrarV1(colecao.chave, resp.segredo_cif, aad(c.aad.itemSegredo)))),
  };
}

/**
 * Copiar com limpeza em 30 s (RF-T10, melhor esforço). Depois do prazo: se der para ler o
 * clipboard e ele ainda tiver o que copiamos, apaga; se a leitura não existir ou for negada
 * (a Permissions-Policy do front nega clipboard-read), sobrescreve com '' do mesmo jeito; se o
 * conteúdo mudou, não mexe. Devolve a função que cancela a limpeza.
 */
export async function copiarComLimpeza(texto, { clipboard = globalThis.navigator?.clipboard, ms = 30_000, agendar = setTimeout, cancelar = clearTimeout } = {}) {
  if (!clipboard?.writeText) throw new Error('clipboard_indisponivel');
  await clipboard.writeText(texto);
  const id = agendar(async () => {
    let atual = null;
    try {
      if (typeof clipboard.readText === 'function') atual = await clipboard.readText();
    } catch {
      atual = null; // leitura negada
    }
    if (atual === null || atual === texto) await clipboard.writeText('').catch(() => {});
  }, ms);
  return () => cancelar(id);
}

// ---------- Fase 7: compartilhar, owners e rotação ----------

/** collectionKey em bytes (reabre o envelope x1 do usuário). O chamador zera depois de usar. */
async function bytesDaColecao(eu, colecao) {
  if (!colecao?.envelope || colecao.erro) throw new Error('colecao_ilegivel');
  const org = eu.usuario.org_id;
  return c.abrirX1(eu, colecao.envelope, c.aad.envColecao(org, colecao.id, eu.usuario.id, colecao.chaveVer));
}

const normFp = (s) => String(s ?? '').replace(/\s+/g, '').toUpperCase();

/**
 * Chave pública de um membro de GET /membros, só se o fingerprint calculado aqui bate com o que
 * foi confirmado fora de banda (`fingerprint_confirmado`). Sem confirmação ou divergente → erro:
 * não envelopar a collectionKey para uma chave que pode ter sido trocada pelo servidor.
 */
export async function chavePublicaConfirmada(m) {
  if (!m?.fingerprint_confirmado || !m.chave_publica) throw new Error('fingerprint_nao_confirmado');
  const publica = c.deB64u(m.chave_publica);
  if (publica.length !== 32) throw new Error('chave_publica_invalida');
  if (normFp(await c.fingerprint(publica)) !== normFp(m.fingerprint_confirmado)) throw new Error('chave_publica_divergente');
  return publica;
}

/** Quem a UI oferece para receber acesso: ativo e com fingerprint confirmado. */
export const podeReceberAcesso = (m) => m.estado === 'ativo' && Boolean(m.fingerprint_confirmado);

/** POST /colecoes/{id}/membros: envelope x1 da collectionKey atual para `membro` (de GET /membros). */
export async function montarMembro({ eu, colecao, membro, permissao }) {
  if (!PERMISSOES.includes(permissao)) throw new Error('permissao_invalida');
  if (!podeReceberAcesso(membro)) throw new Error('destinatario_invalido');
  const publica = await chavePublicaConfirmada(membro);
  const bytes = await bytesDaColecao(eu, colecao);
  try {
    const aadEnv = c.aad.envColecao(eu.usuario.org_id, colecao.id, membro.id, colecao.chaveVer);
    return { usuario_id: membro.id, permissao, chave_ver: colecao.chaveVer, chave_colecao_cif: await c.envelopeX1(publica, bytes, aadEnv) };
  } finally {
    bytes.fill(0);
  }
}

/**
 * Envelopes `gerenciar` de TODAS as coleções que eu abro para `alvo` (promoção a owner e
 * reativação de owner, D13). Coleção ilegível interrompe: o servidor exigiria o envelope dela.
 */
export async function montarEnvelopesOwner({ eu, colecoes, alvo }) {
  const publica = await chavePublicaConfirmada(alvo);
  const envelopes = [];
  for (const col of colecoes) {
    const bytes = await bytesDaColecao(eu, col);
    try {
      const aadEnv = c.aad.envColecao(eu.usuario.org_id, col.id, alvo.id, col.chaveVer);
      envelopes.push({ colecao_id: col.id, chave_ver: col.chaveVer, chave_colecao_cif: await c.envelopeX1(publica, bytes, aadEnv) });
    } finally {
      bytes.fill(0);
    }
  }
  return envelopes;
}

/**
 * Corpo de POST /colecoes/{id}/rotacionar: collectionKey nova (chave_ver+1), nome, todos os
 * `itens` (inclusive lixeira, com segredo_cif) e todas as `versoes` decifrados com a chave atual e
 * recifrados com a nova (mesma `versao`), e um envelope para cada um de `membros` (GET
 * /colecoes/{id}/membros), com a chave pública conferida pelo fingerprint (`pessoas` = GET /membros).
 * Qualquer blob que não abre interrompe (erro 'adulterado').
 */
export async function montarRotacao({ eu, colecao, membros, pessoas, itens, versoes }) {
  const org = eu.usuario.org_id;
  const nova = colecao.chaveVer + 1;
  const bytes = c.gerarChaveAes();
  try {
    const chaveNova = await c.importarChaveAes(bytes);
    const envelopes = [];
    for (const { usuario_id: uid } of membros) {
      const publica = uid === eu.usuario.id ? eu.publica : await chavePublicaConfirmada(pessoas.find((p) => p.id === uid));
      envelopes.push({ usuario_id: uid, chave_colecao_cif: await c.envelopeX1(publica, bytes, c.aad.envColecao(org, colecao.id, uid, nova)) });
    }
    async function recifrar(id, tipo, chaveVer, versao, metaCif, segredoCif) {
      const aad = (f, v) => f(org, colecao.id, id, tipo, v, versao);
      let meta, segredo;
      try {
        meta = await c.decifrarV1(colecao.chave, metaCif, aad(c.aad.itemMeta, chaveVer));
        segredo = await c.decifrarV1(colecao.chave, segredoCif, aad(c.aad.itemSegredo, chaveVer));
        doTipo(tipo, 'meta', JSON.parse(utf8.decode(meta)));
        doTipo(tipo, 'segredo', JSON.parse(utf8.decode(segredo)));
      } catch {
        throw new Error('adulterado');
      }
      try {
        return {
          meta_cif: await c.cifrarV1(chaveNova, meta, aad(c.aad.itemMeta, nova)),
          segredo_cif: await c.cifrarV1(chaveNova, segredo, aad(c.aad.itemSegredo, nova)),
        };
      } finally {
        meta.fill(0);
        segredo.fill(0);
      }
    }
    const corpoItens = [];
    for (const i of itens) {
      corpoItens.push({ id: i.id, versao: i.versao, ...(await recifrar(i.id, i.tipo, i.chave_ver, i.versao, i.meta_cif, i.segredo_cif)) });
    }
    const corpoVersoes = [];
    for (const v of versoes) {
      corpoVersoes.push({ item_id: v.item_id, versao: v.versao, ...(await recifrar(v.item_id, v.tipo, v.chave_ver, v.versao, v.meta_cif, v.segredo_cif)) });
    }
    return {
      chave_ver_atual: colecao.chaveVer,
      nome_cif: await c.cifrarV1(chaveNova, colecao.nome, c.aad.colecaoNome(org, colecao.id, nova)),
      envelopes,
      itens: corpoItens,
      versoes: corpoVersoes,
    };
  } finally {
    bytes.fill(0);
  }
}

/**
 * Herdado da Fase 7 (detecção de rollback): cada item que este navegador sincronizou nesta coleção
 * tem de vir de GET /rotacao com a MESMA `versao` e `chave_ver` e fora da lixeira. Divergência
 * (servidor devolvendo blob antigo, item sumido ou alterado depois do sync) → erro
 * 'divergencia_sync' antes de decifrar ou enviar qualquer coisa: o chamador recarrega e refaz.
 */
export function conferirRotacaoContraSync(dados, colecaoId, itensSync) {
  if (!Array.isArray(itensSync)) throw new Error('sync_ausente');
  const doServidor = new Map(dados.itens.map((i) => [i.id, i]));
  for (const i of itensSync) {
    if (i.colecaoId !== colecaoId) continue;
    const r = doServidor.get(i.id);
    if (!r || r.versao !== i.versao || r.chave_ver !== i.chaveVer || r.excluido_em) throw new Error('divergencia_sync');
  }
}

/**
 * Primeira metade da rotação, sem decifrar nada: GET /colecoes/{id}/rotacao (membros, itens com
 * segredo e versões, auditado no servidor como um evento `colecao.rotacao_iniciada`) e GET /membros.
 * Confere a chave_ver (mudou desde o sync → 'chave_ver_desatualizada'), o sync (acima) e a chave
 * pública de cada destinatário contra o fingerprint confirmado. Devolve `destinatarios` (quem vai
 * receber a chave nova, com fingerprint) para a UI mostrar ANTES de confirmar.
 */
export async function prepararRotacao({ eu, colecao, pedir, itensSync }) {
  const base = `/colecoes/${encodeURIComponent(colecao.id)}`;
  const dados = await pedir('GET', `${base}/rotacao`);
  if (dados.chave_ver !== colecao.chaveVer) throw new Error('chave_ver_desatualizada');
  conferirRotacaoContraSync(dados, colecao.id, itensSync);
  const pessoas = await pedir('GET', '/membros');
  const destinatarios = [];
  for (const { usuario_id: uid } of dados.membros) {
    const p = pessoas.find((x) => x.id === uid);
    const publica = uid === eu.usuario.id ? eu.publica : await chavePublicaConfirmada(p);
    destinatarios.push({ id: uid, nome: p?.nome ?? null, email: p?.email ?? null, estado: p?.estado ?? null, voce: uid === eu.usuario.id, fingerprint: await c.fingerprint(publica) });
  }
  return { base, dados, pessoas, destinatarios };
}

/** Segunda metade: recifra tudo com a chave nova e envia POST /rotacionar (409 → re-sincronizar). */
export async function concluirRotacao({ eu, colecao, pedir, preparo }) {
  const { base, dados, pessoas } = preparo;
  const tipos = new Map(dados.itens.map((i) => [i.id, i.tipo]));
  const versoes = dados.versoes.map((v) => ({ ...v, tipo: tipos.get(v.item_id) }));
  const corpo = await montarRotacao({ eu, colecao, membros: dados.membros, pessoas, itens: dados.itens, versoes });
  return pedir('POST', `${base}/rotacionar`, corpo);
}

/**
 * Rotação completa (E2E e testes): preparar + concluir. `pedir(metodo, caminho, corpo)` devolve o
 * JSON ou lança (api.js na tela, o "navegador" no E2E); `itensSync` = itens do sync aberto.
 */
export async function rotacionarColecao({ eu, colecao, pedir, itensSync }) {
  const preparo = await prepararRotacao({ eu, colecao, pedir, itensSync });
  return concluirRotacao({ eu, colecao, pedir, preparo });
}
