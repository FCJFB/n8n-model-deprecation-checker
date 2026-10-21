#!/usr/bin/env node
// Scan workflow export files from the command line: node scan-cli.js [--json] file.json ...
// Accepts a single export, an array, an API page {data:[...]}, or a template API reply {workflow:{workflow:{...}}}.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
for (const f of ['models.js', 'detect.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), { filename: f });
const { scanWorkflow, summarize } = globalThis.n8nModelScan;

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const files = args.filter((a) => a !== '--json');
if (!files.length) { console.error('usage: node scan-cli.js [--json] file.json ...'); process.exit(2); }

const workflows = [];
for (const file of files) {
  let j;
  try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error(file + ': ' + e.message); continue; }
  const list = Array.isArray(j) ? j : j && Array.isArray(j.data) ? j.data : [j && j.workflow && j.workflow.workflow ? Object.assign({ id: j.workflow.id, name: j.workflow.name }, j.workflow.workflow) : j];
  for (const w of list) {
    if (w && typeof w === 'object' && !w.name) w.name = path.basename(file, '.json');
    workflows.push(w);
  }
}
const findings = scanWorkflow(workflows, {});
if (asJson) console.log(JSON.stringify({ scanned: findings.scanned, findings }, null, 2));
else {
  console.log('Scanned ' + findings.scanned.workflows + ' workflows, ' + findings.scanned.nodes + ' nodes, ' + findings.length + ' findings\n');
  console.log(summarize(findings).markdown);
}
