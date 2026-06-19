#!/usr/bin/env node
/**
 * Garante paridade: data/property-units.json ↔ backend ↔ js/property-units-catalog.js
 */
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var inv = JSON.parse(fs.readFileSync(path.join(root, 'data/property-units.json'), 'utf8'));
var server = require(path.join(root, 'functions/shared/property-catalog')).properties;
var catalogPath = path.join(root, 'js/property-units-catalog.js');
var catalogSrc = fs.readFileSync(catalogPath, 'utf8');
var sandbox = {};
vm.runInNewContext(catalogSrc, sandbox, { filename: 'property-units-catalog.js' });
var client = sandbox.propertyUnits || {};

var errors = [];

function compareCatalog(labelA, a, labelB, b) {
  var pid;
  for (pid in a) {
    if (!Object.prototype.hasOwnProperty.call(a, pid)) continue;
    if (typeof a[pid] !== 'object') continue;
    var unitsA = a[pid].units || [];
    var unitsB = (b[pid] && b[pid].units) ? b[pid].units : [];
    var mapB = {};
    var i;
    for (i = 0; i < unitsB.length; i++) {
      mapB[unitsB[i].code] = unitsB[i].status;
    }
    for (i = 0; i < unitsA.length; i++) {
      var ua = unitsA[i];
      if (!ua || !ua.code) continue;
      if (mapB[ua.code] == null) {
        errors.push(labelA + ' ' + pid + ' / ' + ua.code + ' ausente em ' + labelB);
      } else if (mapB[ua.code] !== ua.status) {
        errors.push(labelA + ' vs ' + labelB + ' — emp. ' + pid + ' / ' + ua.code + ': "' + ua.status + '" vs "' + mapB[ua.code] + '"');
      }
    }
  }
}

if (inv.version !== sandbox.UNIT_INVENTORY_VERSION) {
  errors.push('Versão divergente: JSON="' + inv.version + '" catalog.js="' + sandbox.UNIT_INVENTORY_VERSION + '"');
}

compareCatalog('JSON', inv.properties, 'server', server);
compareCatalog('JSON', inv.properties, 'client', client);

if (errors.length) {
  console.error('Inventário desalinhado (' + errors.length + ' diferença(s)):');
  errors.forEach(function(msg) { console.error('  - ' + msg); });
  process.exit(1);
}

console.log('OK: inventário único (JSON, backend e site) está alinhado.');
