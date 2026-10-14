// `node --test test/unit/` (comando da DoD) não varre diretórios no Node >= 21:
// o argumento vira caminho de módulo e resolve para este index.js, que importa cada *.test.mjs.
import { readdirSync } from 'node:fs';

for (const f of readdirSync(import.meta.dirname).filter((f) => f.endsWith('.test.mjs')).sort()) {
  await import(`./${f}`);
}
