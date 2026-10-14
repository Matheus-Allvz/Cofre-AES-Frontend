import { el, trocar } from './dom.js';
import { detectarSuporte, derivarMasterKey, KDF_PADRAO } from './cripto.js';

const app = document.getElementById('app');

async function statusApi() {
  try {
    const r = await fetch('/api/saude', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    const corpo = r.ok ? await r.json() : null;
    if (corpo?.status === 'ok') return el('p', { class: 'ok' }, 'API: ok');
    return el('p', { class: 'error-msg' }, `API indisponível (HTTP ${r.status}). Tente novamente em instantes.`);
  } catch {
    return el('p', { class: 'error-msg' }, 'API fora do ar ou inacessível. Tente novamente em instantes.');
  }
}

// Diagnóstico do KDF (só com ?diag=1): mede derivarMasterKey com os parâmetros de produção.
function diagnostico() {
  const saida = el('p', { class: 'muted' });
  const botao = el('button', {
    class: 'btn btn-secondary',
    onclick: async () => {
      botao.disabled = true;
      saida.textContent = 'Derivando chave…';
      await new Promise((ok) => setTimeout(ok, 50)); // deixa pintar o aviso (D7)
      const t0 = performance.now();
      const mk = await derivarMasterKey('diagnostico-local', crypto.getRandomValues(new Uint8Array(16)), KDF_PADRAO);
      const ms = Math.round(performance.now() - t0);
      mk.fill(0);
      saida.textContent = `derivarMasterKey (Argon2id m=${KDF_PADRAO.m} t=${KDF_PADRAO.t} p=${KDF_PADRAO.p}): ${ms} ms`;
      botao.disabled = false;
    },
  }, 'Medir derivarMasterKey');
  return el('section', { class: 'card' }, el('h2', {}, 'Diagnóstico'), botao, saida);
}

async function iniciar() {
  if (!(await detectarSuporte())) {
    trocar(app, el('h1', {}, 'Navegador não suportado'),
      el('p', {}, 'Este navegador não oferece WebCrypto com X25519 ou WebAssembly. Atualize para Chrome 133+, Firefox 130+ ou Safari 17+.'));
    return;
  }
  trocar(app, el('h1', {}, 'Cofre AES Empresarial'), await statusApi(),
    new URLSearchParams(location.search).get('diag') === '1' ? diagnostico() : null);
}

iniciar();
