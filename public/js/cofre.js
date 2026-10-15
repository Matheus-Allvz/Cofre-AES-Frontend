// Cofre (Fase 6) sem DOM e sem rede: abre o sync, monta os corpos de coleção/item e decifra o
// que as rotas auditadas devolvem. As telas e o E2E (Node) usam estas mesmas funções.
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

function conferirConteudo(tipo, meta, segredo) {
  const t = TIPOS[tipo];
  if (!t) throw new Error('tipo_invalido');
  const so = (obj, permitidos) => obj && typeof obj === 'object' && Object.keys(obj).every((k) => permitidos.includes(k));
  if (!so(meta, t.meta) || !so(segredo, t.segredo)) throw new Error('conteudo_invalido');
  if (typeof meta.titulo !== 'string' || !meta.titulo.trim()) throw new Error('titulo_obrigatorio');
  if (meta.urls !== undefined && !(Array.isArray(meta.urls) && meta.urls.every((u) => typeof u === 'string'))) {
    throw new Error('conteudo_invalido');
  }
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
    const base = { id: col.id, chaveVer: col.chave_ver, permissao: col.permissao, rotacaoPendente: col.rotacao_pendente };
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
    item.meta = await json(c.decifrarV1(colecao.chave, i.meta_cif, c.aad.itemMeta(org, colecao.id, i.id, i.chave_ver, i.versao)));
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
      colecao: { id, chaveVer: 1, permissao: 'gerenciar', rotacaoPendente: false, chave, nome: nome.trim() },
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
    meta_cif: await c.cifrarV1(colecao.chave, JSON.stringify(meta), c.aad.itemMeta(org, colecao.id, id, v, versao)),
    segredo_cif: await c.cifrarV1(colecao.chave, JSON.stringify(segredo), c.aad.itemSegredo(org, colecao.id, id, v, versao)),
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

/** Resposta de GET /itens/{id}/segredo → objeto do segredo (§3.4). Falha se adulterado/movido. */
export async function abrirSegredo({ eu, colecao, item, resp }) {
  const aadS = c.aad.itemSegredo(eu.usuario.org_id, colecao.id, item.id, resp.chave_ver, resp.versao);
  return json(c.decifrarV1(colecao.chave, resp.segredo_cif, aadS));
}

/** Resposta de GET /itens/{id}/versoes/{v} → { meta, segredo } daquela versão. */
export async function abrirVersao({ eu, colecao, item, versao, resp }) {
  const org = eu.usuario.org_id;
  return {
    meta: await json(c.decifrarV1(colecao.chave, resp.meta_cif, c.aad.itemMeta(org, colecao.id, item.id, resp.chave_ver, versao))),
    segredo: await json(c.decifrarV1(colecao.chave, resp.segredo_cif, c.aad.itemSegredo(org, colecao.id, item.id, resp.chave_ver, versao))),
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
