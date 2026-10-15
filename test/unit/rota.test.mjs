import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerRota } from '../../public/js/rota.js';

test('lerRota lê convite, conta e vazio', () => {
  assert.deepEqual(lerRota('#/convite/abc_-1'), { rota: 'convite', param: 'abc_-1' });
  assert.deepEqual(lerRota('#/conta'), { rota: 'conta', param: null });
  assert.deepEqual(lerRota(''), { rota: '', param: null });
});

test('lerRota com percent-encoding malformado não lança (param null)', () => {
  assert.deepEqual(lerRota('#/convite/%E0'), { rota: 'convite', param: null });
  assert.deepEqual(lerRota('#/convite/%'), { rota: 'convite', param: null });
});
