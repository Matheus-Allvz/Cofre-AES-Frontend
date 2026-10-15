// Procura segredos (um por linha em <arquivo>) no log da API lido do stdin. Sai com 1 se achar algum.
// Uso: docker compose -p cofre-e2e logs --no-log-prefix api | node scripts/segredos-nos-logs.mjs .e2e-sentinelas.txt
//
// Os campos que a própria API preenche com números variáveis ("em": microssegundos do timestamp,
// "duracao_ms") saem antes da busca: um código TOTP de 6 dígitos coincidiria com eles por acaso.
// Segredo vazado entra em qualquer outro campo (msg, rota, exc, extras) e continua sendo achado.
// Segredo curto (< 16 chars: código TOTP, código de recuperação) só casa como token isolado:
// os mesmos dígitos dentro de um UUID na rota não são vazamento.
// Log sem nenhuma linha "requisicao" (vazio, projeto compose errado) sai com 3: nada foi verificado.
//
// NÃO detecta (limites conhecidos): segredo transformado (base64/hex/percent-encoding, caixa
// trocada, escapes JSON além dos do próprio JSON.stringify), partido entre linhas ou campos,
// truncado; segredo curto colado a letra, dígito ou hífen (ex.: dentro de um UUID, de
// propósito); qualquer coisa que só apareça em "em" ou "duracao_ms" (removidos antes da
// busca); segredos que não foram gravados em .e2e-sentinelas.txt pelo E2E.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const VARIAVEIS = ['em', 'duracao_ms'];

/** Texto pesquisável de uma linha: JSON sem os campos variáveis; linha não-JSON inteira. */
export function semCamposVariaveis(linha) {
  const bruta = linha.replace(/^[\w.-]+\s+\|\s?/, ''); // prefixo "api-1  | " se vier
  try {
    const obj = JSON.parse(bruta);
    if (obj && typeof obj === 'object') {
      for (const k of VARIAVEIS) delete obj[k];
      return JSON.stringify(obj);
    }
  } catch {
    // não-JSON: busca na linha toda
  }
  return bruta;
}

const CURTO = 16;
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Segredos encontrados no log (lista vazia = limpo). */
export function segredosNoLog(log, segredos) {
  const texto = log.split(/\r?\n/).map(semCamposVariaveis).join('\n');
  return segredos.filter((s) => s && (s.length < CURTO
    ? new RegExp(`(?<![0-9A-Za-z-])${escapar(s)}(?![0-9A-Za-z-])`).test(texto)
    : texto.includes(s)));
}

/** Linhas de requisição da API (msg "requisicao"): zero = não houve log para verificar. */
export const linhasDeRequisicao = (log) =>
  log.split(/\r?\n/).filter((l) => {
    try {
      return JSON.parse(l.replace(/^[\w.-]+\s+\|\s?/, '')).msg === 'requisicao';
    } catch {
      return false;
    }
  }).length;

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const segredos = readFileSync(process.argv[2], 'utf8').split(/\r?\n/).filter(Boolean);
  if (segredos.length === 0) {
    console.error('nenhum segredo no arquivo: o E2E rodou?');
    process.exit(2);
  }
  const log = readFileSync(0, 'utf8');
  if (linhasDeRequisicao(log) === 0) {
    console.error('nenhuma linha "requisicao" no log: log vazio ou projeto compose errado?');
    process.exit(3);
  }
  const achados = segredosNoLog(log, segredos);
  // Não imprime o segredo achado (o log do CI é público): só quantos.
  console.log(`${segredos.length} segredos procurados; ${achados.length} encontrados no log da API`);
  process.exit(achados.length ? 1 : 0);
}
