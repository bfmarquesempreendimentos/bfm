#!/usr/bin/env node
/**
 * Gera js/property-units-catalog.js a partir de data/property-units.json
 */
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var invPath = path.join(root, 'data/property-units.json');
var outPath = path.join(root, 'js/property-units-catalog.js');
var fnDataDir = path.join(root, 'functions/data');
var inv = JSON.parse(fs.readFileSync(invPath, 'utf8'));
var excluded = inv.salesExcludedPropertyIds || [];

if (!fs.existsSync(fnDataDir)) fs.mkdirSync(fnDataDir, { recursive: true });
fs.copyFileSync(invPath, path.join(fnDataDir, 'property-units.json'));
if (fs.existsSync(path.join(root, 'data/site-config.json'))) {
  fs.copyFileSync(path.join(root, 'data/site-config.json'), path.join(fnDataDir, 'site-config.json'));
}
var lines = [];

lines.push('/** Gerado por scripts/build-property-inventory.js — edite data/property-units.json */');
lines.push('var UNIT_INVENTORY_VERSION = ' + JSON.stringify(inv.version || '') + ';');
lines.push('var SALES_EXCLUDED_PROPERTY_IDS = ' + JSON.stringify(buildExcludedMap(excluded)) + ';');
lines.push('var propertyUnits = ' + JSON.stringify(inv.properties, null, 4) + ';');
lines.push('');

fs.writeFileSync(outPath, lines.join('\n'));
console.log('OK: ' + path.relative(root, outPath) + ' gerado (' + Object.keys(inv.properties || {}).length + ' empreendimentos).');

function buildExcludedMap(ids) {
  var map = {};
  var i;
  for (i = 0; i < ids.length; i++) {
    map[String(ids[i])] = true;
    map[Number(ids[i])] = true;
  }
  return map;
}
