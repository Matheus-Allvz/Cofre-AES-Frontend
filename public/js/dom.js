// Único lugar que cria DOM. Texto entra sempre por textContent/nós de texto (sem sinks de HTML).

const ATRIBUTOS_URL = new Set(['href', 'src', 'action', 'formaction', 'xlink:href', 'poster', 'data', 'srcset']);

/** Só http(s) ou relativo. Bloqueia javascript:, data:, blob:, vbscript: etc. */
export function urlSegura(v) {
  try {
    return ['http:', 'https:'].includes(new URL(String(v), 'https://base.invalid/').protocol);
  } catch {
    return false;
  }
}

/** el('p', { class: 'x', onclick: fn }, 'texto', outroEl) */
export function el(tag, attrs = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (ATRIBUTOS_URL.has(k.toLowerCase()) && v != null && v !== false && !urlSegura(v)) {
      throw new Error(`url_insegura em ${k}`);
    }
    if (k.startsWith('on')) {
      if (typeof v !== 'function') throw new Error(`handler ${k} deve ser função`);
      e.addEventListener(k.slice(2), v);
    } else if (v === true) {
      e.setAttribute(k, '');
    } else if (v !== false && v != null) {
      e.setAttribute(k, String(v));
    }
  }
  e.append(...filhos.filter((f) => f != null).map((f) => (f instanceof Node ? f : document.createTextNode(String(f)))));
  return e;
}

/** Troca todo o conteúdo de `alvo` pelos nós dados. */
export const trocar = (alvo, ...nos) => alvo.replaceChildren(...nos.filter((n) => n != null));

/** Baixa `texto` como arquivo .txt (kit de emergência). Único uso de URL blob:, fora do el(). */
export function baixarTexto(nome, texto) {
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
