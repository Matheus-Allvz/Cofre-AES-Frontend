// el() só aceita URL http(s)/relativa em atributos de URL (bloqueia javascript:, data: etc.).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { el, urlSegura } from '../../public/js/dom.js';

// DOM mínimo: o suficiente para el() rodar no Node.
globalThis.Node ??= class {};
globalThis.document ??= {
  createElement: (tag) => Object.assign(new Node(), {
    tag, attrs: {}, filhos: [],
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener() {},
    append(...f) { this.filhos.push(...f); },
  }),
  createTextNode: (t) => Object.assign(new Node(), { texto: t }),
};

test('urlSegura aceita http(s) e relativo, recusa outros esquemas', () => {
  for (const ok of ['https://a.example/x', 'http://a.example', '/conta', '#/login', 'kit.txt', '//a.example/x']) {
    assert.equal(urlSegura(ok), true, ok);
  }
  for (const ruim of ['javascript:alert(1)', ' JavaScript:alert(1)', 'java\tscript:alert(1)', '\x01javascript:x',
    'data:text/html,<b>x</b>', 'blob:https://a.example/1', 'vbscript:x', 'file:///etc/passwd']) {
    assert.equal(urlSegura(ruim), false, JSON.stringify(ruim));
  }
});

test('el recusa href/src inseguros e aceita os seguros', () => {
  assert.throws(() => el('a', { href: 'javascript:alert(1)' }), /url_insegura/);
  assert.throws(() => el('img', { src: 'data:image/png;base64,AAAA' }), /url_insegura/);
  assert.throws(() => el('a', { HREF: 'javascript:x' }), /url_insegura/);
  assert.equal(el('a', { href: '/conta' }).attrs.href, '/conta');
  assert.equal(el('img', { src: 'https://a.example/i.png' }).attrs.src, 'https://a.example/i.png');
  assert.deepEqual(el('a', { href: null }).attrs, {});
});

test('el exige função em on* e põe texto como nó de texto', () => {
  assert.throws(() => el('button', { onclick: 'alert(1)' }), /deve ser função/);
  const p = el('p', {}, '<b>x</b>', null);
  assert.deepEqual(p.filhos.map((f) => f.texto), ['<b>x</b>']);
});
