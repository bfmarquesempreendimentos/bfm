#!/usr/bin/env node
'use strict';

/**
 * Migra unitCode cassa 08 → casa 08 (empreendimentos 2, 5, 6).
 * Auth: token do Firebase CLI (~/.config/configstore/firebase-tools.json).
 */

var fs = require('fs');
var os = require('os');
var path = require('path');

var PROJECT_ID = 'site-interativo-b-f-marques';
var PROPERTY_IDS = ['2', '5', '6'];
var OLD_CODE = 'cassa 08';
var NEW_CODE = 'casa 08';

function getAccessToken() {
  var cfgPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  var cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  var tokens = cfg.tokens;
  if (!tokens || !tokens.access_token || Date.now() >= tokens.expires_at - 120000) {
    throw new Error('Token Firebase CLI expirado. Rode: npx firebase-tools login');
  }
  return tokens.access_token;
}

function docUrl(collection, docId) {
  return (
    'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID +
    '/databases/(default)/documents/' + collection + '/' + encodeURIComponent(docId)
  );
}

async function api(token, url, opts) {
  opts = opts || {};
  var res = await fetch(url, {
    method: opts.method || 'GET',
    headers: Object.assign(
      { Authorization: 'Bearer ' + token },
      opts.headers || {}
    ),
    body: opts.body,
  });
  var text = await res.text();
  if (!res.ok) throw new Error(res.status + ' ' + url + ' ' + text.slice(0, 300));
  return text ? JSON.parse(text) : {};
}

function setStringField(fields, key, value) {
  fields[key] = { stringValue: String(value) };
}

async function publishValidSnapshot(token) {
  var root = path.join(__dirname, '..', 'data', 'valid-engineering.json');
  var body = JSON.parse(fs.readFileSync(root, 'utf8'));
  body.publishedAt = new Date().toISOString();
  fs.writeFileSync(root, JSON.stringify(body, null, 2) + '\n', 'utf8');
  var name = encodeURIComponent('public-data/valid-engineering.json');
  var url =
    'https://firebasestorage.googleapis.com/v0/b/site-interativo-b-f-marques.firebasestorage.app/o?uploadType=media&name=' +
    name;
  var res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Storage snapshot: ' + res.status);
  console.log('Snapshot vitrine atualizado (casa 08).');
}

async function migrateEngineering(token, pid) {
  var oldId = pid + '__cassa_08';
  var newId = pid + '__casa_08';
  var oldUrl = docUrl('unit_engineering', oldId);
  var oldDoc;
  try {
    oldDoc = await api(token, oldUrl);
  } catch (e) {
    if (String(e.message).indexOf('404') >= 0) {
      console.log('unit_engineering/' + oldId + ' — ausente, pulando');
      return;
    }
    throw e;
  }
  var fields = Object.assign({}, oldDoc.fields || {});
  setStringField(fields, 'unitCode', NEW_CODE);
  setStringField(fields, 'updatedAt', new Date().toISOString());
  setStringField(fields, 'updatedBy', 'script-renomear-casa-08');
  var newUrl = docUrl('unit_engineering', newId);
  await api(token, newUrl, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: fields }),
  });
  await api(token, oldUrl, { method: 'DELETE' });
  console.log('unit_engineering', oldId, '→', newId);
}

async function migrateOverrideMap(token, pid) {
  var url = docUrl('unit_status_overrides', pid);
  var doc;
  try {
    doc = await api(token, url);
  } catch (e) {
    if (String(e.message).indexOf('404') >= 0) return;
    throw e;
  }
  var mapField = doc.fields && doc.fields.map;
  if (!mapField || !mapField.mapValue || !mapField.mapValue.fields) return;
  var inner = mapField.mapValue.fields;
  if (!inner[OLD_CODE]) return;
  inner[NEW_CODE] = inner[OLD_CODE];
  delete inner[OLD_CODE];
  await api(token, url + '?updateMask.fieldPaths=map', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { map: mapField } }),
  });
  console.log('unit_status_overrides/' + pid + ' map:', OLD_CODE, '→', NEW_CODE);
}

async function runQueryUnitCode(token, collection) {
  var url =
    'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID +
    '/databases/(default)/documents:runQuery';
  var body = {
    structuredQuery: {
      from: [{ collectionId: collection }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'unitCode' },
          op: 'EQUAL',
          value: { stringValue: OLD_CODE },
        },
      },
    },
  };
  return api(token, url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function migrateCollectionUnitCode(token, collection, slotKeyField) {
  var rows = await runQueryUnitCode(token, collection);
  var i;
  for (i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (!row.document) continue;
    var name = row.document.name;
    var patchUrl = name.indexOf('https://') === 0
      ? name
      : 'https://firestore.googleapis.com/v1/' + name;
    var fields = Object.assign({}, row.document.fields || {});
    var pid = fields.propertyId
      ? fields.propertyId.integerValue || fields.propertyId.stringValue
      : '';
    setStringField(fields, 'unitCode', NEW_CODE);
    if (slotKeyField && pid) {
      var slot = String(pid) + '|' + NEW_CODE.toLowerCase();
      setStringField(fields, slotKeyField, slot);
    }
    var qs = 'updateMask.fieldPaths=unitCode';
    if (slotKeyField) qs += '&updateMask.fieldPaths=' + slotKeyField;
    await api(token, patchUrl + '?' + qs, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: fields }),
    });
    console.log(collection + ' atualizado:', name.split('/').pop());
  }
}

async function main() {
  var token = getAccessToken();
  var i;
  for (i = 0; i < PROPERTY_IDS.length; i++) {
    await migrateEngineering(token, PROPERTY_IDS[i]);
    await migrateOverrideMap(token, PROPERTY_IDS[i]);
  }
  await migrateCollectionUnitCode(token, 'reservations', 'reservationSlotKey');
  await migrateCollectionUnitCode(token, 'propertySales', null);
  await publishValidSnapshot(token);
  console.log('Migração cassa 08 → casa 08 concluída.');
}

main().catch(function(err) {
  console.error(err);
  process.exit(1);
});