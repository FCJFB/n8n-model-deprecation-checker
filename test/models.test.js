const test = require('node:test');
const assert = require('node:assert/strict');
const { MODELS, DEFAULTS } = require('./load')('models.js');

test('gpt-4o-2024-08-06 snapshot retires 2027-01-14', () => {
  const m = MODELS.find((e) => e.id === 'gpt-4o-2024-08-06');
  assert.equal(m.shutdown, '2027-01-14');
  assert.equal(m.kind, 'snapshot');
});

test('gpt-4o is listed as an alias', () => {
  const m = MODELS.find((e) => e.id === 'gpt-4o');
  assert.equal(m.kind, 'alias');
  assert.equal(m.shutdown, '2027-01-14');
});

test('every entry has id, ISO shutdown and https source', () => {
  for (const e of MODELS) {
    assert.ok(e.id, 'id');
    assert.match(e.shutdown, /^\d{4}-\d{2}-\d{2}$/, e.id);
    assert.match(e.source, /^https:\/\//, e.id);
    assert.ok(['snapshot', 'alias', 'prefix'].includes(e.kind), e.id);
  }
});

test('ids are unique', () => {
  const ids = MODELS.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('legacy OpenAI node defaults to gpt-3.5-turbo', () => {
  assert.equal(DEFAULTS['n8n-nodes-base.openAi'], 'gpt-3.5-turbo');
});
