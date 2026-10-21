const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = () => fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('page loads models.js before detect.js', () => {
  const h = html();
  assert.ok(h.indexOf('src="models.js"') > -1 && h.indexOf('src="models.js"') < h.indexOf('src="detect.js"'));
});

test('page has input, results, download and the offer mailto', () => {
  const h = html();
  for (const s of ['id="input"', 'id="results"', 'id="download"', 'mailto:felix@quyre.de']) assert.ok(h.includes(s), s);
});

test('page has print CSS', () => {
  assert.match(html(), /@media print/);
});

test('impressum page exists', () => {
  assert.ok(fs.existsSync(path.join(root, 'impressum.html')));
});

test('page distinguishes "no workflow in input" from "no findings" and catches scan errors', () => {
  const h = html();
  assert.ok(h.includes('No n8n workflow found'), 'no-workflow message');
  assert.match(h, /try \{[^}]*scanWorkflow/s, 'scan wrapped in try');
  assert.ok(!h.includes('seeded from n8n-sunset'), 'no false attribution');
  assert.ok(h.includes('Inspired by n8n-sunset'));
});
