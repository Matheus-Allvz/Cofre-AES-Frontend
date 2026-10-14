# Vetores cruzados

`vetores.json` é gerado **pelo Python** (`argon2-cffi` + `cryptography`), uma implementação
independente da do browser, e lido por `test/unit/cripto.test.mjs`.

```bash
python -m venv /tmp/venv-vetores && . /tmp/venv-vetores/bin/activate   # Windows: Scripts/activate
pip install -r test/vetores/requirements.txt
python test/vetores/gerar_vetores.py --verificar   # confere o arquivo versionado (exit 0)
python test/vetores/gerar_vetores.py               # regera, se o formato mudar
```

Entradas são fixas e fictícias. Mudou `ARQUITETURA-ALVO.md` §3? Ajuste o gerador, regere e
commite gerador e JSON juntos.
