// RF-I09 / DoD 8: bloqueio por inatividade com relógio falso.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vigiarInatividade } from '../../public/js/inatividade.js';

/** Relógio falso: setTimeout/clearTimeout que só andam com avancar(ms). */
function relogioFalso() {
  let agora = 0, seq = 0;
  const timers = new Map();
  return {
    setTimeout(fn, ms) { timers.set(++seq, { fn, em: agora + ms }); return seq; },
    clearTimeout(id) { timers.delete(id); },
    avancar(ms) {
      agora += ms;
      for (const [id, t] of [...timers]) if (t.em <= agora && timers.delete(id)) t.fn();
    },
    pendentes: () => timers.size,
  };
}

function cenario(minutos = 5) {
  const relogio = relogioFalso();
  const alvo = new EventTarget();
  let bloqueios = 0;
  const parar = vigiarInatividade({ minutos, bloquear: () => bloqueios++, alvo, relogio });
  return { relogio, alvo, parar, bloqueios: () => bloqueios };
}

const MIN = 60_000;

test('bloqueia exatamente uma vez após o prazo sem interação', () => {
  const c = cenario(5);
  c.relogio.avancar(5 * MIN - 1);
  assert.equal(c.bloqueios(), 0);
  c.relogio.avancar(1);
  assert.equal(c.bloqueios(), 1);
  c.relogio.avancar(60 * MIN);
  c.alvo.dispatchEvent(new Event('keydown'));
  c.relogio.avancar(60 * MIN);
  c.alvo.dispatchEvent(new Event('pagehide'));
  assert.equal(c.bloqueios(), 1);
  assert.equal(c.relogio.pendentes(), 0);
});

test('interação antes do prazo rearma: zero bloqueios enquanto houver uso', () => {
  const c = cenario(5);
  for (let i = 0; i < 10; i++) {
    c.relogio.avancar(4 * MIN);
    c.alvo.dispatchEvent(new Event(i % 2 ? 'pointerdown' : 'keydown'));
  }
  assert.equal(c.bloqueios(), 0);
  c.relogio.avancar(5 * MIN);
  assert.equal(c.bloqueios(), 1);
});

test('pagehide (aba fechada) bloqueia na hora, uma vez', () => {
  const c = cenario(15);
  c.alvo.dispatchEvent(new Event('pagehide'));
  c.relogio.avancar(15 * MIN);
  assert.equal(c.bloqueios(), 1);
});

test('parar() desliga sem bloquear (logout manual)', () => {
  const c = cenario(5);
  c.parar();
  c.relogio.avancar(10 * MIN);
  c.alvo.dispatchEvent(new Event('pagehide'));
  assert.equal(c.bloqueios(), 0);
});

test('outros eventos não contam como interação', () => {
  const c = cenario(5);
  c.relogio.avancar(4 * MIN);
  c.alvo.dispatchEvent(new Event('mousemove'));
  c.relogio.avancar(1 * MIN);
  assert.equal(c.bloqueios(), 1);
});
