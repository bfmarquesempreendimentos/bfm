'use strict';

var admin = require('firebase-admin');
var { verifyAdminAuth } = require('./admin-auth');
var { roleHasPermission } = require('./admin-accounts');
var propertyUnitsCatalog = require('./chatbot/property-units-data');
var dossierSeed = require('./property-dossier-seed.json');

var COL = 'unit_engineering';
var PROP_COL = 'property_dossiers';
var VALIDITY_MONTHS = 6;
var ALERT_DAYS = 45;

var BUILDING_FIELDS = [
  'officialName', 'street', 'neighborhood', 'city', 'cep', 'mapsUrl',
  'cartorio', 'matriculaMae', 'inscricaoTerreno',
  'engenheiro', 'crea', 'artNumber', 'notes',
];

function allowCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function todayYmd() {
  var now = new Date();
  var br = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  return br.getFullYear() + '-' + pad(br.getMonth() + 1) + '-' + pad(br.getDate());
}

function addMonthsYmd(ymd, months) {
  var parts = String(ymd || '').split('-');
  if (parts.length < 3) return '';
  var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth() + months);
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function daysBetween(fromYmd, toYmd) {
  var a = new Date(fromYmd + 'T12:00:00');
  var b = new Date(toYmd + 'T12:00:00');
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function dossierId(propertyId, unitCode) {
  var u = String(unitCode || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return String(propertyId) + '__' + (u.slice(0, 80) || 'unidade');
}

function classify(expiresAt) {
  var today = todayYmd();
  var daysLeft = daysBetween(today, expiresAt);
  if (daysLeft == null) {
    return { status: 'sem_laudo', daysLeft: null, label: 'Sem data — não vai à vitrine' };
  }
  if (daysLeft < 0) {
    return { status: 'vencida', daysLeft: daysLeft, label: 'Vencida há ' + Math.abs(daysLeft) + ' dia(s)' };
  }
  if (daysLeft <= ALERT_DAYS) {
    return { status: 'a_vencer', daysLeft: daysLeft, label: 'Vence em ' + daysLeft + ' dia(s)' };
  }
  return { status: 'vigente', daysLeft: daysLeft, label: 'Vigente (' + daysLeft + ' dias)' };
}

function publicValue(d) {
  if (!d || !d.expiresAt) return '';
  var c = classify(d.expiresAt);
  if (c.status === 'vencida' || c.status === 'sem_laudo') return '';
  if (d.engineeringValue == null || d.engineeringValue === '') return '';
  return d.engineeringValue;
}

function parseSalePrice(raw) {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'number' && isFinite(raw)) return raw;
  var s = String(raw).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  var n = Number(s);
  return isFinite(n) ? n : String(raw).slice(0, 40);
}

function adminRow(id, d) {
  var c = classify(d.expiresAt);
  return {
    id: id,
    propertyId: d.propertyId,
    unitCode: d.unitCode || '',
    matricula: d.matricula || '',
    inscricaoMunicipal: d.inscricaoMunicipal || '',
    salePrice: d.salePrice == null ? '' : d.salePrice,
    appraiser: d.appraiser || '',
    engineeringValue: d.engineeringValue == null ? '' : d.engineeringValue,
    historicalEngineering: d.historicalEngineering || '',
    valuePerM2: d.valuePerM2 == null ? '' : d.valuePerM2,
    appraisalDate: d.appraisalDate || '',
    expiresAt: d.expiresAt || '',
    reportPath: d.reportPath || '',
    reportName: d.reportName || '',
    archiveDocuments: Array.isArray(d.archiveDocuments) ? d.archiveDocuments : [],
    notes: d.notes || '',
    status: c.status,
    daysLeft: c.daysLeft,
    statusLabel: c.label,
    updatedAt: d.updatedAt || '',
    updatedBy: d.updatedBy || '',
  };
}

async function loadAllRows(db) {
  var snap = await db.collection(COL).limit(2000).get();
  var rows = [];
  snap.forEach(function(doc) {
    rows.push(adminRow(doc.id, doc.data() || {}));
  });
  return rows;
}

function catalogUnits(propertyId) {
  var raw = propertyUnitsCatalog[propertyId] || propertyUnitsCatalog[String(propertyId)];
  if (!raw) return { name: '', units: [], matriculas: {}, engineeringValues: {} };
  return {
    name: raw.name || '',
    units: raw.units || [],
    matriculas: raw.matriculas || {},
    engineeringValues: raw.engineeringValues || {},
  };
}

function seedProperty(propertyId) {
  var bag = dossierSeed && dossierSeed.properties ? dossierSeed.properties : {};
  return bag[String(propertyId)] || null;
}

function lookupCatalogMap(map, code) {
  if (!map) return '';
  if (map[code]) return map[code];
  var cl = String(code || '').toLowerCase();
  var best = '';
  var bestLen = -1;
  Object.keys(map).forEach(function(k) {
    var kl = k.toLowerCase();
    if (cl.indexOf(kl) === 0 || cl.indexOf(kl) !== -1) {
      if (k.length > bestLen) {
        best = map[k];
        bestLen = k.length;
      }
    }
  });
  return best || '';
}

function emptyPropertyDossier(propertyId) {
  var seed = seedProperty(propertyId) || {};
  return {
    propertyId: typeof propertyId === 'number' ? propertyId : (Number(propertyId) || propertyId),
    officialName: seed.officialName || '',
    street: seed.street || '',
    neighborhood: seed.neighborhood || '',
    city: seed.city || '',
    cep: seed.cep || '',
    mapsUrl: seed.mapsUrl || '',
    cartorio: seed.cartorio || '',
    matriculaMae: seed.matriculaMae || '',
    inscricaoTerreno: seed.inscricaoTerreno || '',
    engenheiro: seed.engenheiro || '',
    crea: seed.crea || '',
    artNumber: seed.artNumber || '',
    notes: seed.notes || '',
    documents: Array.isArray(seed.documents) ? seed.documents : [],
    inSales: seed.inSales !== false,
    updatedAt: '',
    updatedBy: '',
  };
}

function mergePropertyDossier(propertyId, stored) {
  var base = emptyPropertyDossier(propertyId);
  if (!stored) return base;
  BUILDING_FIELDS.forEach(function(key) {
    if (stored[key] != null && stored[key] !== '') base[key] = stored[key];
  });
  if (Array.isArray(stored.documents) && stored.documents.length) {
    base.documents = stored.documents;
  }
  base.updatedAt = stored.updatedAt || '';
  base.updatedBy = stored.updatedBy || '';
  return base;
}

function seedUnitByCode(propertyId, unitCode) {
  var seed = seedProperty(propertyId);
  if (!seed || !Array.isArray(seed.units)) return null;
  var i;
  for (i = 0; i < seed.units.length; i++) {
    if (String(seed.units[i].code) === String(unitCode)) return seed.units[i];
  }
  return null;
}

function mergeUnitRow(propertyId, catalogUnit, catalog, firestoreRow) {
  var seedU = seedUnitByCode(propertyId, catalogUnit.code) || {};
  var mat = (firestoreRow && firestoreRow.matricula) ||
    seedU.matricula ||
    lookupCatalogMap(catalog.matriculas, catalogUnit.code);
  var hist = (firestoreRow && firestoreRow.historicalEngineering) ||
    seedU.historicalEngineering ||
    lookupCatalogMap(catalog.engineeringValues, catalogUnit.code);
  var salePrice = (firestoreRow && firestoreRow.salePrice !== '' && firestoreRow.salePrice != null)
    ? firestoreRow.salePrice
    : (seedU.salePrice != null ? seedU.salePrice : catalogUnit.price);
  var row = firestoreRow ? Object.assign({}, firestoreRow) : {
    id: dossierId(propertyId, catalogUnit.code),
    propertyId: propertyId,
    unitCode: catalogUnit.code,
    matricula: '',
    inscricaoMunicipal: '',
    salePrice: '',
    appraiser: '',
    engineeringValue: '',
    historicalEngineering: '',
    valuePerM2: '',
    appraisalDate: '',
    expiresAt: '',
    reportPath: '',
    reportName: '',
    archiveDocuments: [],
    notes: '',
    status: 'sem_laudo',
    daysLeft: null,
    statusLabel: 'Sem data — não vai à vitrine',
    updatedAt: '',
    updatedBy: '',
  };
  row.unitCode = catalogUnit.code;
  row.propertyId = propertyId;
  if (!row.matricula) row.matricula = mat || '';
  if (!row.inscricaoMunicipal && seedU.inscricaoMunicipal) {
    row.inscricaoMunicipal = seedU.inscricaoMunicipal;
  }
  if (!row.historicalEngineering) row.historicalEngineering = hist || '';
  if (row.salePrice === '' || row.salePrice == null) row.salePrice = salePrice;
  if (!row.engineeringValue && seedU.valueHintFromFilename) {
    row.valueHintFromFilename = seedU.valueHintFromFilename;
  }
  if (!row.notes && seedU.notes) row.notes = seedU.notes;
  if (!row.archiveDocuments || !row.archiveDocuments.length) {
    row.archiveDocuments = Array.isArray(seedU.documents) ? seedU.documents : [];
  }
  row.bedrooms = catalogUnit.bedrooms;
  row.catalogStatus = catalogUnit.status || '';
  if (!row.engineeringValue && hist) row.engineeringValue = hist;
  return row;
}

function mergeListForProperty(propertyId, firestoreRows) {
  var catalog = catalogUnits(propertyId);
  var byCode = {};
  (firestoreRows || []).forEach(function(r) {
    byCode[String(r.unitCode)] = r;
  });
  var list = (catalog.units || []).map(function(u) {
    return mergeUnitRow(propertyId, u, catalog, byCode[u.code] || null);
  });
  (firestoreRows || []).forEach(function(r) {
    var exists = list.some(function(x) { return String(x.unitCode) === String(r.unitCode); });
    if (!exists) list.push(r);
  });
  return { catalog: catalog, rows: list };
}

async function loadPropertyDossier(db, propertyId) {
  var snap = await db.collection(PROP_COL).doc(String(propertyId)).get();
  return mergePropertyDossier(propertyId, snap.exists ? snap.data() : null);
}

async function adminUnitEngineeringHttp(req, res) {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method === 'GET') {
    try {
      var db = admin.firestore();
      var rows = await loadAllRows(db);
      var publicMap = {};
      var prices = {};
      rows.forEach(function(r) {
        var pid = String(r.propertyId);
        var val = publicValue(r);
        if (val) {
          if (!publicMap[pid]) publicMap[pid] = {};
          publicMap[pid][r.unitCode] = {
            value: val,
            expiresAt: r.expiresAt,
          };
        }
        if (r.salePrice !== '' && r.salePrice != null && r.updatedBy && String(r.updatedBy).indexOf('@') !== -1) {
          if (!prices[pid]) prices[pid] = {};
          prices[pid][r.unitCode] = r.salePrice;
        }
      });
      return res.json({ ok: true, valid: publicMap, prices: prices });
    } catch (err) {
      console.error('unitEngineering public:', err);
      return res.status(500).json({ error: err.message });
    }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  var auth = await verifyAdminAuth(req);
  if (!auth.ok) return res.status(403).json({ error: 'Acesso negado' });
  if (!roleHasPermission(auth.role, 'units') && !roleHasPermission(auth.role, '*')) {
    return res.status(403).json({ error: 'Sem permissão para unidades.' });
  }
  try {
    var body = req.body || {};
    var action = String(body.action || 'list').trim().toLowerCase();
    var db = admin.firestore();

    if (action === 'list') {
      var filterPid = body.propertyId != null && body.propertyId !== '' ? String(body.propertyId) : '';
      var rows = await loadAllRows(db);
      if (filterPid) rows = rows.filter(function(r) { return String(r.propertyId) === filterPid; });
      var merged = filterPid ? mergeListForProperty(filterPid, rows) : { catalog: null, rows: rows };
      var property = filterPid ? await loadPropertyDossier(db, filterPid) : null;
      return res.json({
        ok: true,
        rows: merged.rows,
        catalog: merged.catalog,
        property: property,
        validityMonths: VALIDITY_MONTHS,
        alertDays: ALERT_DAYS,
      });
    }

    if (action === 'alerts') {
      var all = await loadAllRows(db);
      var expiring = all.filter(function(r) { return r.status === 'a_vencer'; });
      var expired = all.filter(function(r) { return r.status === 'vencida'; });
      return res.json({
        ok: true,
        alertDays: ALERT_DAYS,
        expiring: expiring,
        expired: expired,
        counts: {
          expiring: expiring.length,
          expired: expired.length,
          vigente: all.filter(function(r) { return r.status === 'vigente'; }).length,
        },
      });
    }

    if (action === 'save_property') {
      var pid = body.propertyId;
      if (pid == null || pid === '') {
        return res.status(400).json({ error: 'propertyId obrigatório' });
      }
      var now = new Date().toISOString();
      var doc = { propertyId: typeof pid === 'number' ? pid : (Number(pid) || pid) };
      BUILDING_FIELDS.forEach(function(key) {
        if (body[key] != null) doc[key] = String(body[key]).trim().slice(0, key === 'notes' ? 800 : 240);
      });
      if (Array.isArray(body.documents)) doc.documents = body.documents;
      doc.updatedAt = now;
      doc.updatedBy = auth.email || '';
      await db.collection(PROP_COL).doc(String(pid)).set(doc, { merge: true });
      var saved = await loadPropertyDossier(db, pid);
      return res.json({ ok: true, property: saved });
    }

    if (action === 'upsert') {
      var propertyId = body.propertyId;
      var unitCode = String(body.unitCode || '').trim();
      if (propertyId == null || propertyId === '' || !unitCode) {
        return res.status(400).json({ error: 'propertyId e unitCode obrigatórios' });
      }
      var appraisalDate = String(body.appraisalDate || '').trim();
      var expiresAt = '';
      if (appraisalDate) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(appraisalDate)) {
          return res.status(400).json({ error: 'Data da engenharia inválida' });
        }
        expiresAt = addMonthsYmd(appraisalDate, VALIDITY_MONTHS);
      }
      var id = String(body.id || dossierId(propertyId, unitCode));
      var nowU = new Date().toISOString();
      var prev = await db.collection(COL).doc(id).get();
      var old = prev.exists ? (prev.data() || {}) : {};
      var docU = {
        propertyId: typeof propertyId === 'number' ? propertyId : (Number(propertyId) || propertyId),
        unitCode: unitCode,
        matricula: String(body.matricula != null ? body.matricula : (old.matricula || '')).trim().slice(0, 40),
        inscricaoMunicipal: String(body.inscricaoMunicipal != null ? body.inscricaoMunicipal : (old.inscricaoMunicipal || '')).trim().slice(0, 60),
        salePrice: body.salePrice != null && body.salePrice !== '' ? parseSalePrice(body.salePrice) : (old.salePrice != null ? old.salePrice : ''),
        appraiser: String(body.appraiser != null ? body.appraiser : (old.appraiser || '')).trim().slice(0, 120),
        engineeringValue: body.engineeringValue != null ? body.engineeringValue : (old.engineeringValue || ''),
        historicalEngineering: String(body.historicalEngineering != null ? body.historicalEngineering : (old.historicalEngineering || '')).trim().slice(0, 80),
        valuePerM2: body.valuePerM2 != null ? body.valuePerM2 : (old.valuePerM2 || ''),
        appraisalDate: appraisalDate || '',
        expiresAt: expiresAt,
        reportPath: String(body.reportPath || '').trim() || old.reportPath || '',
        reportName: String(body.reportName || '').trim().slice(0, 160) || old.reportName || '',
        archiveDocuments: Array.isArray(body.archiveDocuments) ? body.archiveDocuments : (old.archiveDocuments || []),
        notes: String(body.notes != null ? body.notes : (old.notes || '')).trim().slice(0, 500),
        updatedAt: nowU,
        updatedBy: auth.email || '',
      };
      await db.collection(COL).doc(id).set(docU, { merge: true });
      return res.json({ ok: true, row: adminRow(id, docU) });
    }

    if (action === 'delete') {
      var delId = String(body.id || '').trim();
      if (!delId) return res.status(400).json({ error: 'id obrigatório' });
      await db.collection(COL).doc(delId).delete();
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: 'Ação inválida' });
  } catch (err) {
    console.error('adminUnitEngineering:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function loadValidEngineeringMap(db) {
  var rows = await loadAllRows(db);
  var map = {};
  rows.forEach(function(r) {
    var val = publicValue(r);
    if (!val) return;
    var pid = String(r.propertyId);
    if (!map[pid]) map[pid] = {};
    map[pid][r.unitCode] = val;
  });
  return map;
}

module.exports = {
  VALIDITY_MONTHS,
  ALERT_DAYS,
  classify,
  publicValue,
  loadValidEngineeringMap,
  adminUnitEngineeringHttp,
};
