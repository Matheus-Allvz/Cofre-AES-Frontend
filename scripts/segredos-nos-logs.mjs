// Procura segredos (um por linha em <arquivo>) no log da API lido do stdin. Sai com 1 se achar algum.
// Uso: docker compose -p cofre-e2e logs --no-log-prefix api | node scripts/segredos-nos-logs.mjs .e2e-sentinelas.txt
//
// Os campos que a própria API preenche com números variáveis ("em": microssegundos do timestamp,
// "duracao_ms") saem antes da busca: um código TOTP de 6 dígitos coincidiria com eles por acaso.
// Segredo vazado entra em qualquer outro campo (msg, rota, exc, extras) e continua sendo achado.
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

/** Segredos encontrados no log (lista vazia = limpo). */
export function segredosNoLog(log, segredos) {
  const texto = log.split(/\r?\n/).map(semCamposVariaveis).join('\n');
  return segredos.filter((s) => s && texto.includes(s));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const segredos = readFileSync(process.argv[2], 'utf8').split(/\r?\n/).filter(Boolean);
  if (segredos.length === 0) {
    console.error('nenhum segredo no arquivo: o E2E rodou?');
    process.exit(2);
  }
  const achados = segredosNoLog(readFileSync(0, 'utf8'), segredos);
  // Não imprime o segredo achado (o log do CI é público): só quantos.
  console.log(`${segredos.length} segredos procurados; ${achados.length} encontrados no log da API`);
  process.exit(achados.length ? 1 : 0);
}
