#!/usr/bin/env node
'use strict';

/**
 * Aplica na coleção unit_engineering o que foi confirmado na planilha manuscrita (24/11/2026).
 * Uso: node scripts/aplicar-engenharia-planilha-caneta.js [--dry-run] [--no-publish]
 * Auth: refresh token do Firebase CLI (~/.config/configstore/firebase-tools.json).
 */

var fs = require('fs');
var os = require('os');
var path = require('path');
var PROJECT_ID = 'site-interativo-b-f-marques';
var PUBLIC_FN = 'https://us-central1-site-interativo-b-f-marques.cloudfunctions.net/adminUnitEngineering';
var STORAGE_OBJECT = 'public-data/valid-engineering.json';
var STORAGE_BUCKET = 'site-interativo-b-f-marques.firebasestorage.app';

var VALIDITY_MONTHS = 6;
var COL = 'unit_engineering';

function addMonthsYmd(ymd, months) {
  var parts = String(ymd || '').split('-');
  if (parts.length < 3) return '';
  var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth() + months);
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function dossierId(propertyId, unitCode) {
  var u = String(unitCode || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return String(propertyId) + '__' + (u.slice(0, 80) || 'unidade');
}

function todayYmd() {
  var now = new Date();
  var br = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  return br.getFullYear() + '-' + pad(br.getMonth() + 1) + '-' + pad(br.getDate());
}

function daysBetween(fromYmd, toYmd) {
  var a = new Date(fromYmd + 'T12:00:00');
  var b = new Date(toYmd + 'T12:00:00');
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function classify(expiresAt) {
  var daysLeft = daysBetween(todayYmd(), expiresAt);
  if (daysLeft == null) return { status: 'sem_laudo', daysLeft: null };
  if (daysLeft < 0) return { status: 'vencida', daysLeft: daysLeft };
  if (daysLeft <= 45) return { status: 'a_vencer', daysLeft: daysLeft };
  return { status: 'vigente', daysLeft: daysLeft };
}

var UPDATES = [
  // Bloco A — data + valor (vitrine se vigente e unidade disponível/reservado)
  { propertyId: 5, unitCode: 'cassa 08', matricula: '54.772', appraisalDate: '2026-08-21', engineeringValue: 180000 },
  { propertyId: 7, unitCode: 'APTO 202', matricula: '68.915', appraisalDate: '2026-11-10', engineeringValue: 188000, caixaLaudoRef: 'A0174' },
  { propertyId: 2, unitCode: 'casa base', matricula: '69.061', appraisalDate: '2026-11-11', engineeringValue: 190000 },
  { propertyId: 2, unitCode: 'casa 06', matricula: '69.067', appraisalDate: '2026-11-12', engineeringValue: 197000 },
  { propertyId: 4, unitCode: 'CS 08', matricula: '84.683', appraisalDate: '2026-08-19', engineeringValue: 142000 },
  // Bloco B — ficha com valor/data, inapta Caixa (GÁS), sem vitrine
  {
    propertyId: 7,
    unitCode: 'APTO 206',
    matricula: '68.919',
    appraisalDate: '2026-11-17',
    engineeringValue: 160000,
    garantiaCaixa: 'inapta',
    notes: 'Inapta Caixa — GÁS (planilha 24/11/2026). Não publicar na vitrine.',
  },
  {
    propertyId: 7,
    unitCode: 'APTO 209',
    matricula: '68.922',
    appraisalDate: '2026-11-17',
    engineeringValue: 160000,
    garantiaCaixa: 'inapta',
    notes: 'Inapta Caixa — GÁS (planilha 24/11/2026). Não publicar na vitrine.',
  },
  // Bloco C — só data, sem valor (sem vitrine)
  {
    propertyId: 7,
    unitCode: 'APTO 208',
    matricula: '68.921',
    appraisalDate: '2026-11-18',
    engineeringValue: '',
    clearEngineeringValue: true,
    notes: 'Sem laudo/valor — só data de referência (planilha 24/11/2026).',
  },
];

function buildPatch(item) {
  var appraisalDate = item.appraisalDate || '';
  var expiresAt = appraisalDate ? addMonthsYmd(appraisalDate, VALIDITY_MONTHS) : '';
  var c = expiresAt ? classify(expiresAt) : { status: 'sem_laudo', daysLeft: null };
  var patch = {
    propertyId: item.propertyId,
    unitCode: item.unitCode,
    matricula: item.matricula || '',
    appraisalDate: appraisalDate,
    expiresAt: expiresAt,
    status: c.status,
    updatedAt: new Date().toISOString(),
    updatedBy: 'script-planilha-caneta-2026-11-24',
  };
  if (c.daysLeft != null) patch.daysLeft = c.daysLeft;
  if (item.caixaLaudoRef) patch.caixaLaudoRef = item.caixaLaudoRef;
  if (item.garantiaCaixa) patch.garantiaCaixa = item.garantiaCaixa;
  if (item.notes) patch.notes = item.notes;
  if (item.clearEngineeringValue) {
    patch.__deleteEngineeringValue = true;
  } else if (item.engineeringValue !== '' && item.engineeringValue != null) {
    patch.engineeringValue = item.engineeringValue;
  }
  return patch;
}

function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

async function getFirebaseCliAccessToken() {
  var cfgPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (!fs.existsSync(cfgPath)) {
    throw new Error('Firebase CLI não autenticado. Rode: firebase login');
  }
  var cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  var tokens = cfg && cfg.tokens;
  if (!tokens || !tokens.refresh_token) {
    throw new Error('Refresh token ausente. Rode: firebase login');
  }
  if (tokens.access_token && tokens.expires_at && Date.now() < tokens.expires_at - 120000) {
    return tokens.access_token;
  }
  throw new Error('Access token do Firebase CLI expirado. Rode: npx firebase-tools login');
}

function firestoreValue(v) {
  if (v === true || v === false) return { booleanValue: v };
  if (typeof v === 'number' && isFinite(v)) {
    if (Number.isInteger(v)) return { integerValue: String(v) };
    return { doubleValue: v };
  }
  return { stringValue: String(v) };
}

function patchToFirestoreFields(patch) {
  var fields = {};
  var mask = [];
  Object.keys(patch).forEach(function(key) {
    if (key === '__deleteEngineeringValue') return;
    fields[key] = firestoreValue(patch[key]);
    mask.push(key);
  });
  if (patch.__deleteEngineeringValue) {
    fields.engineeringValue = { nullValue: null };
    mask.push('engineeringValue');
  }
  return { fields: fields, mask: mask };
}

async function firestorePatchDoc(accessToken, docId, patch) {
  var converted = patchToFirestoreFields(patch);
  var qs = converted.mask.map(function(f) {
    return 'updateMask.fieldPaths=' + encodeURIComponent(f);
  }).join('&');
  var url =
    'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID +
    '/databases/(default)/documents/' + COL + '/' + encodeURIComponent(docId) +
    (qs ? '?' + qs : '');
  var res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: converted.fields }),
  });
  if (!res.ok) {
    var errText = await res.text();
    throw new Error('Firestore ' + docId + ': ' + res.status + ' ' + errText.slice(0, 400));
  }
}

async function fetchPublicEngineeringSnapshot() {
  var res = await fetch(PUBLIC_FN + '?t=' + Date.now(), { method: 'GET' });
  if (!res.ok) throw new Error('GET public engineering: ' + res.status);
  return res.json();
}

async function uploadPublicSnapshot(accessToken, body) {
  var name = encodeURIComponent(STORAGE_OBJECT);
  var url =
    'https://firebasestorage.googleapis.com/v0/b/' + STORAGE_BUCKET +
    '/o?uploadType=media&name=' + name;
  var res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    var errText = await res.text();
    throw new Error('Storage upload: ' + res.status + ' ' + errText.slice(0, 400));
  }
}

async function main() {
  var dryRun = process.argv.indexOf('--dry-run') !== -1;
  var noPublish = process.argv.indexOf('--no-publish') !== -1;
  var accessToken = dryRun ? '' : await getFirebaseCliAccessToken();
  for (var i = 0; i < UPDATES.length; i++) {
    var item = UPDATES[i];
    var id = dossierId(item.propertyId, item.unitCode);
    var patch = buildPatch(item);
    console.log((dryRun ? '[dry-run] ' : '') + id, JSON.stringify(patch, null, 0));
    if (!dryRun) {
      await firestorePatchDoc(accessToken, id, patch);
    }
  }
  if (dryRun) {
    console.log('Dry-run concluído.');
    return;
  }
  console.log('Gravações concluídas (' + UPDATES.length + ' fichas).');
  if (noPublish) return;

  console.log('Aguardando cache da function expirar (50s) para gerar snapshot…');
  await sleep(50000);
  var pub = await fetchPublicEngineeringSnapshot();
  var snap = {
    ok: true,
    valid: pub.valid || {},
    prices: pub.prices || {},
    publishedAt: new Date().toISOString(),
  };
  var outPath = path.join(__dirname, '..', 'data', 'valid-engineering.json');
  fs.writeFileSync(outPath, JSON.stringify(snap, null, 2) + '\n', 'utf8');
  console.log('Snapshot local atualizado:', outPath);
  await uploadPublicSnapshot(accessToken, snap);
  console.log('Snapshot publicado no Storage:', STORAGE_OBJECT);
}

main().catch(function(err) {
  console.error(err);
  process.exit(1);
});