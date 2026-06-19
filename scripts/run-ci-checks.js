#!/usr/bin/env node
/**
 * Rodar localmente e no GitHub Actions antes do deploy.
 */
var childProcess = require('child_process');
var path = require('path');

var root = path.join(__dirname, '..');

function runNode(script) {
  childProcess.execFileSync('node', [path.join(__dirname, script)], { cwd: root, stdio: 'inherit' });
}

runNode('build-property-inventory.js');
runNode('check-site-config-parity.js');
runNode('inventory-parity-check.js');
runNode('check-no-hardcoded-urls.js');
runNode('sanity-check.js');

childProcess.execSync('bash -lc \'for f in functions/*.js functions/**/*.js; do [ -f "$f" ] && node --check "$f"; done\'', {
  cwd: root,
  stdio: 'inherit'
});

console.log('OK: todas as verificações CI passaram.');
