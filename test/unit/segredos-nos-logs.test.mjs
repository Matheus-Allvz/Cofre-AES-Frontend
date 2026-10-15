// Passo do CI que procura segredos do E2E nos logs da API: determinístico (sem falso positivo
// de timestamp) e ainda pega o segredo em qualquer campo de verdade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { segredosNoLog } from '../../scripts/segredos-nos-logs.mjs';

const CODIGO = '384875';
const linha = (campos) => JSON.stringify({ em: `2026-10-15T11:38:30.${CODIGO}+00:00`, nivel: 'INFO', logger: 'cofre.http', ...campos });

// Log forjado: o código TOTP aparece nos microssegundos de TODAS as linhas e numa duração.
const LIMPO = [
  linha({ msg: 'requisicao', metodo: 'POST', rota: '/api/v1/login', status: 200, duracao_ms: Number(`${CODIGO}.1`) }),
  `api-1  | ${linha({ msg: 'requisicao', rota: '/api/v1/eu', status: 401, duracao_ms: 3.2 })}`,
  linha({ msg: 'Started server process [1]' }),
].join('\n');

test('timestamp e duração com o código não dão falso positivo', () => {
  assert.ok(LIMPO.includes(CODIGO), 'o log forjado contém o código nos campos variáveis');
  assert.deepEqual(segredosNoLog(LIMPO, [CODIGO, 'BBM3AMQ4IUJOFDTHKMBAX4H4TGHAAO4C']), []);
});

test('segredo em msg, rota, exc, campo extra ou linha não-JSON é achado', () => {
  const casos = [
    linha({ msg: `login totp=${CODIGO}` }),
    linha({ msg: 'requisicao', rota: `/api/v1/x/${CODIGO}` }),
    linha({ msg: 'erro_interno', exc: `Traceback ... ValueError: ${CODIGO}` }),
    linha({ msg: 'x', codigo: CODIGO }),
    `INFO: texto solto ${CODIGO}`,
    linha({ msg: 'x', em_claro: 'SKTJ-USVP' }),
  ];
  for (const c of casos) assert.equal(segredosNoLog(`${LIMPO}\n${c}`, [CODIGO, 'SKTJ-USVP']).length >= 1, true, c);
});

test('CLI: exit 0 no log limpo, 1 com vazamento, 2 sem sentinelas', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sentinelas-'));
  const arq = join(dir, 's.txt');
  const script = fileURLToPath(new URL('../../scripts/segredos-nos-logs.mjs', import.meta.url));
  writeFileSync(arq, `${CODIGO}\nSKTJ-USVP\n`);
  const rodar = (input) => spawnSync(process.execPath, [script, arq], { input, encoding: 'utf8' });
  assert.equal(rodar(LIMPO).status, 0);
  const vaz = rodar(`${LIMPO}\n${linha({ msg: CODIGO })}`);
  assert.equal(vaz.status, 1);
  assert.ok(!vaz.stdout.includes(CODIGO), 'não imprime o segredo achado');
  writeFileSync(arq, '');
  assert.equal(rodar(LIMPO).status, 2);
});
