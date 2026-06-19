'use strict';

var inventory = require('../data/property-units.json');

function buildExcludedMap(ids) {
  var map = {};
  var i;
  for (i = 0; i < (ids || []).length; i++) {
    map[Number(ids[i])] = true;
  }
  return map;
}

module.exports = {
  version: inventory.version,
  properties: inventory.properties,
  salesExcludedPropertyIds: buildExcludedMap(inventory.salesExcludedPropertyIds),
};
