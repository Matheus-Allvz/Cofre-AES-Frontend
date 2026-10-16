# Bibliotecas vendorizadas

Servidas pelo próprio front (sem CDN em runtime). O SHA-256 abaixo é conferido por
`test/unit/varredura.test.mjs`; trocar o arquivo exige atualizar esta tabela.

| Arquivo | Pacote | Versão | Tarball npm | Licença |
|---|---|---|---|---|
| `hash-wasm/index.esm.min.js` | hash-wasm | 4.12.0 | https://registry.npmjs.org/hash-wasm/-/hash-wasm-4.12.0.tgz | MIT (c) Dani Biró |
| `bip39-pt/portuguese.txt` | lista de palavras em português do BIP-39 | commit `d353c54` | https://raw.githubusercontent.com/bitcoin/bips/d353c54154bac64a88eb18cf2d47d15ead083de4/bip-0039/portuguese.txt | MIT, pela implementação de referência `trezor/python-mnemonic` (ver abaixo) |

sha256 hash-wasm/index.esm.min.js 81ad292c6823ea75efef9afe5cbedc5c6c5a85113b32a97b74f5353097a95211
sha256 bip39-pt/portuguese.txt 2685e9c194c82ae67e10ba59d9ea5345a23dc093e92276fc5361f6667d79cd3f

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

## Lista de palavras do gerador (`bip39-pt/portuguese.txt`)

- Origem: `bip-0039/portuguese.txt` do repositório `bitcoin/bips` (último commit que tocou o arquivo:
  `d353c54154bac64a88eb18cf2d47d15ead083de4`), copiado sem alteração. 2048 palavras, uma por linha,
  só `[a-z]` (sem acento), sem repetição: cada palavra da passphrase vale 11 bits (6 palavras = 66 bits).
- Licença: o `bitcoin/bips` **não** declara licença para o BIP-39 nem para as listas: o cabeçalho de
  `bip-0039.mediawiki` em `d353c54` não tem campo `License` (o BIP-39 é anterior ao BIP-2, que só
  passou a exigir esse campo) e o repositório não tem arquivo de licença. A fonte da licença é a
  implementação de referência do BIP-39, `trezor/python-mnemonic` (Pavol Rusnak, coautor do BIP-39),
  distribuída sob **MIT** (`LICENSE`: "The MIT License (MIT) — Copyright (c) 2013-2016 Pavol Rusnak"),
  que traz o mesmo arquivo byte a byte em `src/mnemonic/wordlist/portuguese.txt` (commit
  `b57a5ad77a981e743f4167ab2f7927a55c1e82a8`, mesmo SHA-256 abaixo). A cópia aqui segue os termos da MIT
  dessa distribuição.
- Servida como texto e lida por `public/js/gerador.js` (`lerPalavras` recusa lista com menos de 2048
  palavras, repetida ou com caractere fora de `[a-z]`); `test/unit/gerador.test.mjs` confere o mesmo.

```bash
curl -fsSL https://raw.githubusercontent.com/bitcoin/bips/d353c54154bac64a88eb18cf2d47d15ead083de4/bip-0039/portuguese.txt | sha256sum
curl -fsSL https://raw.githubusercontent.com/trezor/python-mnemonic/b57a5ad77a981e743f4167ab2f7927a55c1e82a8/src/mnemonic/wordlist/portuguese.txt | sha256sum
curl -fsSL https://raw.githubusercontent.com/trezor/python-mnemonic/b57a5ad77a981e743f4167ab2f7927a55c1e82a8/LICENSE | head -3
sha256sum public/vendor/bip39-pt/portuguese.txt
```
