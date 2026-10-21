const test = require('node:test');
const assert = require('node:assert/strict');
const { scanWorkflow, summarize } = require('./load')('models.js', 'detect.js');

const LC = '@n8n/n8n-nodes-langchain.';
const TODAY = '2026-10-21';

function wf(nodes, connections, extra) {
  return Object.assign({ id: 'w1', name: 'Lead enrichment', active: true, updatedAt: '2026-09-30T10:00:00Z', nodes, connections: connections || {}, pinData: {} }, extra);
}
function agentWith(subNode, index) {
  return {
    [subNode.name]: { ai_languageModel: [[{ node: 'AI Agent', type: 'ai_languageModel', index: index || 0 }]] },
  };
}
const AGENT = { name: 'AI Agent', type: LC + 'agent', typeVersion: 2, parameters: {} };

const rl = (v) => ({ __rl: true, mode: 'list', value: v, cachedResultName: v });

test('(a) OpenAI chat sub-node with resource-locator gpt-4o is explicit, aliased, used by the agent', () => {
  const sub = { name: 'OpenAI Chat Model', type: LC + 'lmChatOpenAi', typeVersion: 1.2, parameters: { model: rl('gpt-4o') } };
  const f = scanWorkflow(wf([AGENT, sub], agentWith(sub)), { today: TODAY, instance: 'https://c.app.n8n.cloud' });
  assert.equal(f.length, 1);
  assert.equal(f[0].model, 'gpt-4o');
  assert.equal(f[0].confidence, 'explicit');
  assert.equal(f[0].shutdown, '2027-01-14');
  assert.equal(f[0].daysLeft, 85);
  assert.equal(f[0].severity, 'scheduled');
  assert.equal(f[0].usedBy, 'AI Agent');
  assert.equal(f[0].location, 'parameters.model.value');
  assert.match(f[0].note, /alias/);
  assert.equal(f[0].instance, 'https://c.app.n8n.cloud');
  assert.equal(f[0].workflow, 'Lead enrichment');
  assert.equal(f[0].active, true);
});

test('(b) Anthropic sub-node without model uses the versioned default, inferred', () => {
  const sub = { name: 'Anthropic Chat Model', type: LC + 'lmChatAnthropic', typeVersion: 1.3, parameters: {} };
  const f = scanWorkflow(wf([AGENT, sub], agentWith(sub)), { today: TODAY });
  assert.equal(f.length, 1);
  assert.equal(f[0].model, 'claude-sonnet-4-5-20250929');
  assert.equal(f[0].confidence, 'inferred');
  assert.equal(f[0].shutdown, '2026-11-30');
  assert.equal(f[0].provider, 'anthropic');
});

test('(c) expression model without a literal is dynamic with severity unknown', () => {
  const sub = { name: 'OpenAI Chat Model', type: LC + 'lmChatOpenAi', typeVersion: 1.2, parameters: { model: rl('={{ $json.model }}') } };
  const f = scanWorkflow(wf([sub]), { today: TODAY });
  assert.equal(f.length, 1);
  assert.equal(f[0].confidence, 'dynamic');
  assert.equal(f[0].severity, 'unknown');
  assert.equal(f[0].model, '={{ $json.model }}');
});

test('(d) HTTP Request to api.openai.com with a model in jsonBody is explicit', () => {
  const n = { name: 'Call OpenAI', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, parameters: { url: 'https://api.openai.com/v1/chat/completions', sendBody: true, specifyBody: 'json', jsonBody: '={"model":"gpt-4o-2024-08-06","messages":[]}' } };
  const f = scanWorkflow(wf([n]), { today: TODAY });
  assert.equal(f.length, 1);
  assert.equal(f[0].model, 'gpt-4o-2024-08-06');
  assert.equal(f[0].confidence, 'explicit');
  assert.equal(f[0].location, 'parameters.jsonBody');
});

test('(e) Code node literal is mentioned once; comments are ignored', () => {
  const n = { name: 'Build request', type: 'n8n-nodes-base.code', typeVersion: 2, parameters: { jsCode: 'const m = "gpt-4.1-mini"; // gpt-4o in a comment\n/* gpt-3.5-turbo */\nreturn [{json:{m}}];' } };
  const f = scanWorkflow(wf([n]), { today: TODAY });
  assert.equal(f.length, 1);
  assert.equal(f[0].model, 'gpt-4.1-mini');
  assert.equal(f[0].confidence, 'mentioned');
});

test('(f) disabled node is reported with severity info', () => {
  const sub = { name: 'OpenAI Chat Model', type: LC + 'lmChatOpenAi', typeVersion: 1.2, disabled: true, parameters: { model: 'gpt-4o-mini' } };
  const f = scanWorkflow(wf([sub]), { today: TODAY });
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'info');
  assert.equal(f[0].nodeDisabled, true);
});

test('(g) Azure deployment URL reports the Azure date', () => {
  const n = { name: 'Azure call', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, parameters: { url: 'https://x.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2024-10-21' } };
  const f = scanWorkflow(wf([n]), { today: TODAY });
  assert.equal(f.length, 1);
  assert.equal(f[0].provider, 'azure-openai');
  assert.equal(f[0].model, 'gpt-4o');
  assert.equal(f[0].shutdown, '2027-04-14');
  assert.match(f[0].note, /deployment/);
});

test('(h) sub-node on agent input index 1 is the fallback model', () => {
  const sub = { name: 'Fallback Model', type: LC + 'lmChatOpenAi', typeVersion: 1.2, parameters: { model: rl('gpt-4.1') } };
  const f = scanWorkflow(wf([AGENT, sub], agentWith(sub, 1)), { today: TODAY });
  assert.equal(f[0].usedBy, 'AI Agent (fallback)');
});

test('pinData and sticky notes produce no findings', () => {
  const sticky = { name: 'Sticky Note', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, parameters: { content: 'uses gpt-4o' } };
  const w = wf([sticky], {}, { pinData: { 'Call OpenAI': [{ json: { model: 'gpt-4o-2024-08-06' } }] } });
  assert.equal(scanWorkflow(w, { today: TODAY }).length, 0);
});

test('a model past its shutdown is broken, within 30 days urgent', () => {
  const sub = { name: 'OpenAI Chat Model', type: LC + 'lmChatOpenAi', typeVersion: 1.2, parameters: { model: 'o3-mini' } };
  assert.equal(scanWorkflow(wf([sub]), { today: '2026-10-24' })[0].severity, 'broken');
  assert.equal(scanWorkflow(wf([sub]), { today: '2026-10-21' })[0].severity, 'urgent');
  assert.equal(scanWorkflow(wf([sub]), { today: '2026-10-24' })[0].daysLeft, -1);
});

test('lmChatOpenAi without a model and no known default is inferred/unknown', () => {
  const sub = { name: 'OpenAI Chat Model', type: LC + 'lmChatOpenAi', typeVersion: 1.2, parameters: {} };
  const f = scanWorkflow(wf([sub]), { today: TODAY });
  assert.equal(f.length, 1);
  assert.equal(f[0].confidence, 'inferred');
  assert.equal(f[0].severity, 'unknown');
  assert.match(f[0].note, /default depends on n8n version/);
});

test('accepts an array of workflows and an API page', () => {
  const sub = { name: 'OpenAI Chat Model', type: LC + 'lmChatOpenAi', typeVersion: 1.2, parameters: { model: 'gpt-4o' } };
  assert.equal(scanWorkflow([wf([sub]), wf([sub])], { today: TODAY }).length, 2);
  assert.equal(scanWorkflow({ data: [wf([sub])] }, { today: TODAY }).length, 1);
});

test('summarize counts per deadline and renders a markdown table', () => {
  const a = { name: 'OpenAI Chat Model', type: LC + 'lmChatOpenAi', typeVersion: 1.2, parameters: { model: 'gpt-4o' } };
  const b = { name: 'Old', type: LC + 'lmChatOpenAi', typeVersion: 1.2, parameters: { model: 'o3-mini' } };
  const s = summarize(scanWorkflow(wf([a, b]), { today: TODAY }));
  assert.equal(s.total, 2);
  assert.equal(s.counts['2027-01-14'], 1);
  assert.equal(s.counts['2026-10-23'], 1);
  assert.match(s.markdown, /1 node breaks on 2026-10-23/);
  assert.match(s.markdown, /\| Workflow \|/);
  assert.ok(s.markdown.indexOf('o3-mini') < s.markdown.indexOf('gpt-4o'), 'sorted by shutdown');
});
