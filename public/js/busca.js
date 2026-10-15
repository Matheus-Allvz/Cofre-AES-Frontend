// Busca local (RF-T11): só sobre os itens já decifrados em memória. Nenhum termo vai ao servidor.

/** Minúsculas, sem acento (NFD sem marcas combinantes), espaços colapsados. */
export const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

const campos = (meta) => [meta?.titulo, meta?.usuario, ...(Array.isArray(meta?.urls) ? meta.urls : [])];

/**
 * Itens decifrados ({ meta }) cujo título, usuário ou alguma URL contêm TODOS os termos.
 * Termo vazio devolve a lista inteira; item sem meta (adulterado) só aparece sem filtro.
 */
export function buscar(itens, termo) {
  const termos = normalizar(termo).split(' ').filter(Boolean);
  if (!termos.length) return itens;
  return itens.filter((i) => {
    if (!i.meta) return false;
    const texto = campos(i.meta).map(normalizar).join('\n');
    return termos.every((t) => texto.includes(t));
  });
}
