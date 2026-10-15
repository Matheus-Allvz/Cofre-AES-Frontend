// RNF-C04: nada de sinks de HTML/eval/handlers inline em public/; vendorizado confere com o SHA-256 registrado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = fileURLToPath(new URL('../../public/', import.meta.url));
const arquivos = readdirSync(PUBLIC, { recursive: true })
  .map((f) => join(PUBLIC, f))
  .filter((f) => /\.(m?js|html)$/.test(f));

const PROIBIDOS = [
  /\binnerHTML\b/, /\bouterHTML\b/, /\binsertAdjacentHTML\b/, /\bdocument\.write/,
  /\beval\s*\(/, /\bnew\s+Function\b/, /\bMath\.random\b/,
  // Chaves e sessão só em memória / cookie HttpOnly (ARQUITETURA §2, D15).
  /\blocalStorage\b/, /\bsessionStorage\b/, /\bindexedDB\b/i, /\bdocument\.cookie\b/,
];

test('public/ sem innerHTML, eval, new Function, Math.random, storage e afins', () => {
  assert.ok(arquivos.some((f) => f.endsWith('cripto.js')), 'varredura encontrou os arquivos');
  const achados = [];
  for (const f of arquivos) {
    const src = readFileSync(f, 'utf8');
    for (const re of PROIBIDOS) if (re.test(src)) achados.push(`${relative(PUBLIC, f)}: ${re}`);
  }
  assert.deepEqual(achados, []);
});

test('HTML sem handlers on*= nem <script> inline', () => {
  const achados = [];
  for (const f of arquivos.filter((f) => f.endsWith('.html'))) {
    const src = readFileSync(f, 'utf8');
    if (/<[^>]+\son[a-z]+\s*=/i.test(src)) achados.push(`${relative(PUBLIC, f)}: atributo on*=`);
    if (/<script(?![^>]*\bsrc\s*=)[^>]*>/i.test(src)) achados.push(`${relative(PUBLIC, f)}: <script> sem src`);
    if (/<style\b|\sstyle\s*=/i.test(src)) achados.push(`${relative(PUBLIC, f)}: estilo inline`);
  }
  assert.deepEqual(achados, []);
});

test('SHA-256 do vendorizado confere com public/vendor/README.md', () => {
  const readme = readFileSync(join(PUBLIC, 'vendor/README.md'), 'utf8');
  const registrados = Object.fromEntries([...readme.matchAll(/^sha256 (\S+) ([0-9a-f]{64})$/gm)].map((m) => [m[1], m[2]]));
  const vendor = readdirSync(join(PUBLIC, 'vendor'), { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && d.name !== 'README.md')
    .map((d) => relative(join(PUBLIC, 'vendor'), join(d.parentPath, d.name)).split(sep).join('/'));
  assert.ok(vendor.length > 0);
  for (const f of vendor) {
    const sha = createHash('sha256').update(readFileSync(join(PUBLIC, 'vendor', f))).digest('hex');
    assert.equal(sha, registrados[f], `${f} sem hash registrado ou divergente`);
  }
});
