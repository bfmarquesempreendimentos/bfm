#!/usr/bin/env node
/**
 * Garante que config.js e data/site-config.json usam a mesma URL das Cloud Functions.
 */
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var site = JSON.parse(fs.readFileSync(path.join(root, 'data/site-config.json'), 'utf8'));
var configSrc = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
var match = configSrc.match(/cloudFunctions:\s*\{\s*baseURL:\s*'([^']+)'/);
var configUrl = match ? match[1] : '';
var jsonUrl = String(site.cloudFunctionsBaseUrl || '').replace(/\/$/, '');

if (!jsonUrl || !configUrl) {
  console.error('URL das Cloud Functions não encontrada em config.js ou site-config.json.');
  process.exit(1);
}

if (jsonUrl !== configUrl.replace(/\/$/, '')) {
  console.error('URL divergente:');
  console.error('  data/site-config.json: ' + jsonUrl);
  console.error('  config.js: ' + configUrl);
  process.exit(1);
}

console.log('OK: URL das Cloud Functions alinhada em config.js e data/site-config.json.');
