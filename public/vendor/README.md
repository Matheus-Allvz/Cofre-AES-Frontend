# Bibliotecas vendorizadas

Servidas pelo próprio front (sem CDN em runtime). O SHA-256 abaixo é conferido por
`test/unit/varredura.test.mjs`; trocar o arquivo exige atualizar esta tabela.

| Arquivo | Pacote | Versão | Tarball npm | Licença |
|---|---|---|---|---|
| `hash-wasm/index.esm.min.js` | hash-wasm | 4.12.0 | https://registry.npmjs.org/hash-wasm/-/hash-wasm-4.12.0.tgz | MIT (c) Dani Biró |

sha256 hash-wasm/index.esm.min.js 81ad292c6823ea75efef9afe5cbedc5c6c5a85113b32a97b74f5353097a95211

- Origem: `package/dist/index.esm.min.js` do tarball acima, copiado sem alteração.
- Integridade do tarball (registry npm): `sha512-+/2B2rYLb48I/evdOIhP+K/DD2ca2fgBjp6O+GBEnCDk2e4rpeXIK8GvIyRPjTezgmWn9gmKwkQjjx6BtqDHVQ==`
  (SHA-256 do `.tgz`: `1db32a125fb46177932ec8ac438d3cd8214ebdfaccb5d6611b657d88eb586f92`).
- Por que o build ESM: é o único que roda como `import` tanto no browser (módulo ES, CSP `script-src 'self'`)
  quanto no Node (`node --test`), sem `<script>` UMD nem `createRequire`. Embute o WASM em base64 e chama
  `WebAssembly.compile`, por isso a CSP tem `'wasm-unsafe-eval'`. Não usa sinks de Trusted Types.

Conferir contra o npm:

```bash
curl -fsSL https://registry.npmjs.org/hash-wasm/-/hash-wasm-4.12.0.tgz | tar xzO package/dist/index.esm.min.js | sha256sum
sha256sum public/vendor/hash-wasm/index.esm.min.js
```
