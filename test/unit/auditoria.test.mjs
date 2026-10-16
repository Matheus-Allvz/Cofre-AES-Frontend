// Fase 8: montagem da consulta de GET /auditoria (filtros → query string, cursor, datas ISO).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consulta, TIPOS_EVENTO } from '../../public/js/telas/auditoria.js';

test('consulta: só filtros preenchidos, cursor e limite; datas locais viram ISO', () => {
  assert.equal(consulta({ tipo: 'item.revelado', ator_id: '', alvo_id: '  ' }), '/auditoria?tipo=item.revelado&limite=50');
  const q = new URLSearchParams(consulta({ tipo: '', de: '2026-10-01T08:00', ator_id: 'abc' }, 42).split('?')[1]);
  assert.equal(q.get('de'), new Date('2026-10-01T08:00').toISOString());
  assert.equal(q.get('ator_id'), 'abc');
  assert.equal(q.get('antes_de_id'), '42');
  assert.equal(q.has('tipo'), false);
  // Valor com caracteres especiais vai codificado (nunca concatenado cru).
  assert.match(consulta({ alvo_id: "x' OR 1=1&tipo=a" }), /alvo_id=x%27\+OR\+1%3D1%26tipo%3Da/);
});

test('tipos sugeridos = §5.6 (37 tipos, sem repetição)', () => {
  assert.equal(new Set(TIPOS_EVENTO).size, TIPOS_EVENTO.length);
  assert.equal(TIPOS_EVENTO.length, 37);
  assert.ok(TIPOS_EVENTO.includes('requisicao.recusada'));
});
