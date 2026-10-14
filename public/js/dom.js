// Único lugar que cria DOM. Texto entra sempre por textContent/nós de texto (sem sinks de HTML).

/** el('p', { class: 'x', onclick: fn }, 'texto', outroEl) */
export function el(tag, attrs = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
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
