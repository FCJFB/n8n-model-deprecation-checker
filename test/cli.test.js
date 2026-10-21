const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('rv2: CLI scans every workflow inside an export-all array', () => {
  const file = path.join(os.tmpdir(), 'n8n-scan-arr-' + process.pid + '.json');
  fs.writeFileSync(file, JSON.stringify([
    { name: 'x', nodes: [{ name: 'm', type: '@n8n/n8n-nodes-langchain.lmChatOpenAi', typeVersion: 1.2, parameters: { model: 'gpt-4o' } }], connections: {} },
    { name: 'y', nodes: [], connections: {} },
  ]));
  const out = execFileSync(process.execPath, [path.join(__dirname, '..', 'scan-cli.js'), file], { encoding: 'utf8' });
  fs.unlinkSync(file);
  assert.match(out, /^Scanned 2 workflows, 1 nodes, 1 findings/);
});
