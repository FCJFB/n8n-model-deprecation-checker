// Loads the browser-style scripts into this process and returns the global.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

module.exports = function load(...files) {
  for (const f of files) {
    vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), { filename: f });
  }
  return globalThis.n8nModelScan;
};
