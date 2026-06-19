#!/usr/bin/env node
/**
 * Garante paridade entre inventário do site (property-units.js) e backend (property-units-data.js).
 */
var path = require('path');
var fs = require('fs');

var root = path.join(__dirname, '..');
var serverCatalog = require(path.join(root, 'functions/chatbot/property-units-data'));

var clientPath = path.join(root, 'js/property-units.js');
var clientSrc = fs.readFileSync(clientPath, 'utf8');
var clientCatalog = {};
var blockRe = /(\d+):\s*\{[\s\S]*?units:\s*\[([\s\S]*?)\]\s*,?/g;
var unitRe = /\{\s*code:\s*"([^"]+)"[\s\S]*?status:\s*"([^"]+)"/g;
var blockMatch;
while ((blockMatch = blockRe.exec(clientSrc))) {
  var pid = blockMatch[1];
  var unitsBlock = blockMatch[2];
  var units = [];
  var unitMatch;
  unitRe.lastIndex = 0;
  while ((unitMatch = unitRe.exec(unitsBlock))) {
    units.push({ code: unitMatch[1], status: unitMatch[2] });
  }
  clientCatalog[pid] = units;
}

var errors = [];
var pid;
for (pid in serverCatalog) {
  if (!Object.prototype.hasOwnProperty.call(serverCatalog, pid)) continue;
  if (pid === 'length' || typeof serverCatalog[pid] !== 'object') continue;
  var serverUnits = (serverCatalog[pid].units || []);
  var clientUnits = clientCatalog[pid] || [];
  var clientMap = {};
  var i;
  for (i = 0; i < clientUnits.length; i++) {
    clientMap[clientUnits[i].code] = clientUnits[i].status;
  }
  for (i = 0; i < serverUnits.length; i++) {
    var su = serverUnits[i];
    if (!su || !su.code) continue;
    if (clientMap[su.code] == null) {
      errors.push('Empreendimento ' + pid + ': unidade "' + su.code + '" existe no servidor mas não no client');
      continue;
    }
    if (clientMap[su.code] !== su.status) {
      errors.push('Empreendimento ' + pid + ' / ' + su.code + ': client="' + clientMap[su.code] + '" server="' + su.status + '"');
    }
  }
  for (i = 0; i < clientUnits.length; i++) {
    var cu = clientUnits[i];
    var found = false;
    var j;
    for (j = 0; j < serverUnits.length; j++) {
      if (serverUnits[j].code === cu.code) { found = true; break; }
    }
    if (!found) {
      errors.push('Empreendimento ' + pid + ': unidade "' + cu.code + '" existe no client mas não no servidor');
    }
  }
}

if (errors.length) {
  console.error('Inventário desalinhado (' + errors.length + ' diferença(s)):');
  errors.forEach(function(msg) { console.error('  - ' + msg); });
  process.exit(1);
}

console.log('OK: property-units.js e property-units-data.js estão alinhados.');
