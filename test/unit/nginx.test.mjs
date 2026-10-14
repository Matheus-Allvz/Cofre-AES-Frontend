// RNF-02: nginx.conf traz exatamente os headers de ARQUITETURA-ALVO §6.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ESPERADOS = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; require-trusted-types-for 'script'; trusted-types 'none'",
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), clipboard-read=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

const conf = readFileSync(new URL('../../nginx.conf', import.meta.url), 'utf8')
  .split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');

test('nginx.conf tem cada header de §6 com valor exato e "always"', () => {
  const linhas = conf.split('\n').filter((l) => /\badd_header\b/.test(l));
  const achados = {};
  for (const l of linhas) {
    const m = /^\s*add_header\s+(\S+)\s+"([^"]*)"\s+always;\s*$/.exec(l);
    assert.ok(m, `add_header fora do formato: ${l.trim()}`);
    assert.ok(!(m[1] in achados), `header duplicado: ${m[1]}`);
    achados[m[1]] = m[2];
  }
  assert.deepEqual(achados, ESPERADOS);
});

test('add_header só no nível do server (locations herdam)', () => {
  for (const bloco of conf.split(/\blocation\b/).slice(1)) {
    assert.doesNotMatch(bloco.slice(0, bloco.indexOf('}')), /add_header/);
  }
});

test('proxy de /api/ usa ${API_UPSTREAM}', () => {
  assert.match(conf, /location \/api\/ \{[^}]*proxy_pass \$\{API_UPSTREAM\};/);
});
