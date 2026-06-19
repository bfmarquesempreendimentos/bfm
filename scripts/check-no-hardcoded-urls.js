#!/usr/bin/env node
/**
 * Falha se houver URL hardcoded de Cloud Functions fora dos arquivos permitidos.
 */
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var needle = 'us-central1-site-interativo-b-f-marques.cloudfunctions.net';
var allow = {
  'config.js': 1,
  'js/api-client.js': 1,
  'data/site-config.json': 1
};
var errors = [];

function scanFile(rel) {
  if (allow[rel]) return;
  var src = fs.readFileSync(path.join(root, rel), 'utf8');
  if (src.indexOf(needle) !== -1) {
    errors.push(rel);
  }
}

function walk(dir, base) {
  var names = fs.readdirSync(dir);
  var i;
  for (i = 0; i < names.length; i++) {
    var name = names[i];
    if (name === 'node_modules' || name === '.git') continue;
    var abs = path.join(dir, name);
    var rel = path.relative(root, abs).split(path.sep).join('/');
    var stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      walk(abs, base);
      continue;
    }
    if (/\.(js|html)$/.test(name)) scanFile(rel);
  }
}

walk(path.join(root, 'js'), 'js');
['admin-login.html', 'reset-password.html', 'tests/test-repairs-sync.html'].forEach(function(f) {
  if (fs.existsSync(path.join(root, f))) scanFile(f);
});

if (errors.length) {
  console.error('URLs hardcoded encontradas (use getCloudFunctionsBaseUrl / CONFIG):');
  errors.forEach(function(f) { console.error('  - ' + f); });
  process.exit(1);
}

console.log('OK: nenhuma URL hardcoded fora de config.js / api-client.js / site-config.json.');
