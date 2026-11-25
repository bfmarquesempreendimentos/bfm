#!/usr/bin/env node
'use strict';
/**
 * Atualiza salePrice na ficha unit_engineering e republica valid-engineering.json no Storage.
 * Uso: node scripts/patch-vitrine-sale-price.js <propertyId> "<unitCode>" <valorReais>
 * Ex.: node scripts/patch-vitrine-sale-price.js 6 "casa 05" 150000
 * Auth: firebase login (token válido em ~/.config/configstore/firebase-tools.json).
 */

var fs = require('fs');
var os = require('os');
var path = require('path');

var PROJECT_ID = 'site-interativo-b-f-marques';
var COL = 'unit_engineering';
var PUBLIC_FN = 'https://us-central1-site-interativo-b-f-marques.cloudfunctions.net/adminUnitEngineering';
var STORAGE_BUCKET = 'site-interativo-b-f-marques.firebasestorage.app';
var STORAGE_OBJECT = 'public-data/valid-engineering.json';
var WAIT_MS = 52000;

function dossierId(propertyId, unitCode) {
  var u = String(unitCode || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return String(propertyId) + '__' + (u.slice(0, 80) || 'unidade');
}

function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

async function getFirebaseCliAccessToken() {
  var cfgPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (!fs.existsSync(cfgPath)) throw new Error('Firebase CLI não autenticado. Rode: npx firebase-tools login');
  var cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  var tokens = cfg && cfg.tokens;
  if (!tokens || !tokens.refresh_token) throw new Error('Refresh token ausente. Rode: npx firebase-tools login --reauth');
  if (tokens.access_token && tokens.expires_at && Date.now() < tokens.expires_at - 60000) {
    return tokens.access_token;
  }
  throw new Error('Access token expirado. Rode: npx firebase-tools login --reauth');
}

function firestoreValue(v) {
  if (typeof v === 'number' && isFinite(v)) {
    if (Number.isInteger(v)) return { integerValue: String(v) };
    return { doubleValue: v };
  }
  return { stringValue: String(v) };
}

async function firestorePatchDoc(accessToken, docId, patch) {
  var fields = {};
  var mask = [];
  Object.keys(patch).forEach(function(key) {
    fields[key] = firestoreValue(patch[key]);
    mask.push(key);
  });
  var qs = mask.map(function(f) { return 'updateMask.fieldPaths=' + encodeURIComponent(f); }).join('&');
  var url =
    'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID +
    '/databases/(default)/documents/' + COL + '/' + encodeURIComponent(docId) + '?' + qs;
  var res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: fields }),
  });
  if (!res.ok) throw new Error('Firestore: ' + res.status + ' ' + (await res.text()).slice(0, 400));
}

async function uploadPublicSnapshot(accessToken, body) {
  var name = encodeURIComponent(STORAGE_OBJECT);
  var url =
    'https://firebasestorage.googleapis.com/v0/b/' + STORAGE_BUCKET +
    '/o?uploadType=media&name=' + name;
  var res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Storage: ' + res.status + ' ' + (await res.text()).slice(0, 400));
}

async function main() {
  var propertyId = parseInt(process.argv[2], 10);
  var unitCode = process.argv[3];
  var price = parseInt(process.argv[4], 10);
  if (!propertyId || !unitCode || !isFinite(price)) {
    console.error('Uso: node scripts/patch-vitrine-sale-price.js <propertyId> "<unitCode>" <valor>');
    process.exit(1);
  }
  var docId = dossierId(propertyId, unitCode);
  var token = await getFirebaseCliAccessToken();
  var email = (JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json'), 'utf8')).user || {}).email || 'admin@bfmarques';
  var now = new Date().toISOString();
  await firestorePatchDoc(token, docId, {
    salePrice: price,
    updatedBy: email,
    updatedAt: now,
  });
  console.log('Firestore:', docId, 'salePrice', price);
  console.log('Aguardando cache da function (' + (WAIT_MS / 1000) + 's)…');
  await sleep(WAIT_MS);
  var pubRes = await fetch(PUBLIC_FN + '?t=' + Date.now());
  if (!pubRes.ok) throw new Error('GET public engineering: ' + pubRes.status);
  var pub = await pubRes.json();
  var snap = {
    ok: true,
    valid: pub.valid || {},
    prices: pub.prices || {},
    publishedAt: new Date().toISOString(),
  };
  var outPath = path.join(__dirname, '..', 'data', 'valid-engineering.json');
  fs.writeFileSync(outPath, JSON.stringify(snap, null, 2) + '\n', 'utf8');
  await uploadPublicSnapshot(token, snap);
  console.log('Snapshot local + Storage:', outPath);
  var map = snap.prices[String(propertyId)] || {};
  console.log('prices[' + propertyId + ']["' + unitCode + '"] =', map[unitCode]);
}

main().catch(function(err) {
  console.error(err.message || err);
  process.exit(1);
});