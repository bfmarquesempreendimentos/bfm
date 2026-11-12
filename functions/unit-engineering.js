'use strict';

var admin = require('firebase-admin');
var { verifyAdminAuth } = require('./admin-auth');
var { roleHasPermission } = require('./admin-accounts');
var { dateFromDocName, isPersonName, extractLaudoFromPdf } = require('./laudo-extract');
var { documentIdentityError, allSeedProperties } = require('./property-identity');
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
  'inventoryKind', 'occupancy', 'condoDefaultAmount',
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
  if (!d || !d.expiresAt || !d.reportPath) return '';
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

function ymdOrEmpty(v) {
  var s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function clampDueDay(v) {
  var n = parseInt(v, 10);
  if (!n || n < 1 || n > 31) return '';
  return n;
}

function leaseFromBody(body, old) {
  old = old || {};
  function text(key, max) {
    if (body[key] != null) return String(body[key]).trim().slice(0, max);
    return old[key] || '';
  }
  var rent = body.leaseRent != null && body.leaseRent !== ''
    ? parseSalePrice(body.leaseRent)
    : (body.leaseRent === '' ? '' : (old.leaseRent != null ? old.leaseRent : ''));
  var deposit = body.leaseDeposit != null && body.leaseDeposit !== ''
    ? parseSalePrice(body.leaseDeposit)
    : (body.leaseDeposit === '' ? '' : (old.leaseDeposit != null ? old.leaseDeposit : ''));
  return {
    leaseTenant: text('leaseTenant', 120),
    leaseDoc: text('leaseDoc', 32),
    leasePhone: text('leasePhone', 32),
    leaseEmail: text('leaseEmail', 120),
    leaseRent: rent,
    leaseDueDay: body.leaseDueDay != null ? clampDueDay(body.leaseDueDay) : (old.leaseDueDay || ''),
    leaseStart: body.leaseStart != null ? ymdOrEmpty(body.leaseStart) : (old.leaseStart || ''),
    leaseEnd: body.leaseEnd != null ? ymdOrEmpty(body.leaseEnd) : (old.leaseEnd || ''),
    leaseIndex: text('leaseIndex', 80),
    leaseDeposit: deposit,
    leaseNotes: text('leaseNotes', 500),
  };
}

var CHARGE_KINDS = { iptu: 1, condominio: 1, manutencao: 1, seguro: 1, agua: 1, luz: 1, outro: 1 };
var CHARGE_STATUS = { a_vencer: 1, pago: 1, atrasado: 1 };
var CHARGE_RECUR = { mensal: 1, anual: 1, semestral: 1, unica: 1 };

function newChargeId() {
  return 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

function chargeStatusFor(c, today) {
  if (c && c.status === 'pago') return 'pago';
  if (!c || !c.dueDate) return 'a_vencer';
  var days = daysBetween(today, c.dueDate);
  if (days != null && days < 0) return 'atrasado';
  return 'a_vencer';
}

function sanitizeCharge(raw, today) {
  if (!raw || typeof raw !== 'object') return null;
  var kind = String(raw.kind || 'outro').trim();
  if (!CHARGE_KINDS[kind]) kind = 'outro';
  var due = ymdOrEmpty(raw.dueDate);
  var period = String(raw.period || '').replace(/[^\d-]/g, '').slice(0, 7);
  if (due && !period) period = due.slice(0, 7);
  var st = String(raw.status || '').trim();
  if (!CHARGE_STATUS[st]) st = 'a_vencer';
  var rec = String(raw.recurrence || '').trim();
  var c = {
    id: String(raw.id || '').trim().slice(0, 40) || newChargeId(),
    kind: kind,
    label: String(raw.label || '').trim().slice(0, 80),
    dueDate: due,
    amount: raw.amount != null && raw.amount !== '' ? parseSalePrice(raw.amount) : '',
    period: period,
    status: st,
    paidAt: ymdOrEmpty(raw.paidAt),
    receiptPath: String(raw.receiptPath || '').trim().slice(0, 240),
    receiptName: String(raw.receiptName || '').trim().slice(0, 160),
    notes: String(raw.notes || '').trim().slice(0, 240),
    vendor: String(raw.vendor || '').trim().slice(0, 80),
    recurrence: CHARGE_RECUR[rec] ? rec : (kind === 'manutencao' || kind === 'seguro' ? 'anual' : 'mensal'),
    lastDoneAt: ymdOrEmpty(raw.lastDoneAt),
    financeTxId: String(raw.financeTxId || '').trim().slice(0, 64),
  };
  if (c.status !== 'pago') c.status = chargeStatusFor(c, today || todayYmd());
  if (c.status === 'pago' && !c.paidAt) c.paidAt = today || todayYmd();
  return c;
}

function sanitizeChargeList(arr) {
  var today = todayYmd();
  var out = [];
  var seen = {};
  (Array.isArray(arr) ? arr : []).forEach(function(raw) {
    if (out.length >= 120) return;
    var c = sanitizeCharge(raw, today);
    if (!c || seen[c.id]) return;
    seen[c.id] = 1;
    out.push(c);
  });
  return out;
}

function flattenOpenCharges(list, meta) {
  var today = todayYmd();
  var due = [];
  var overdue = [];
  (list || []).forEach(function(c) {
    if (!c || c.status === 'pago' || !c.dueDate) return;
    var days = daysBetween(today, c.dueDate);
    if (days == null) return;
    var item = {
      id: c.id,
      kind: c.kind,
      label: c.label,
      dueDate: c.dueDate,
      amount: c.amount,
      period: c.period,
      status: days < 0 ? 'atrasado' : 'a_vencer',
      daysLeft: days,
      propertyId: meta.propertyId,
      unitCode: meta.unitCode || '',
      scope: meta.scope || 'unit',
      officialName: meta.officialName || '',
    };
    if (days < 0) overdue.push(item);
    else if (days <= ALERT_DAYS) due.push(item);
  });
  return { due: due, overdue: overdue };
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
    garantiaCaixa: d.garantiaCaixa === 'apta' || d.garantiaCaixa === 'inapta' ? d.garantiaCaixa : '',
    laudoUnitHint: d.laudoUnitHint || '',
    archiveDocuments: Array.isArray(d.archiveDocuments) ? d.archiveDocuments : [],
    engineeringHistory: Array.isArray(d.engineeringHistory) ? d.engineeringHistory : [],
    rgiPath: d.rgiPath || '',
    rgiName: d.rgiName || '',
    rgiDate: d.rgiDate || '',
    rgiHistory: Array.isArray(d.rgiHistory) ? d.rgiHistory : [],
    notes: d.notes || '',
    occupancy: d.occupancy === 'alugado' || d.occupancy === 'vago' || d.occupancy === 'uso_proprio' || d.occupancy === 'venda' ? d.occupancy : '',
    leaseTenant: d.leaseTenant || '',
    leaseDoc: d.leaseDoc || '',
    leasePhone: d.leasePhone || '',
    leaseEmail: d.leaseEmail || '',
    leaseRent: d.leaseRent == null ? '' : d.leaseRent,
    leaseDueDay: d.leaseDueDay == null ? '' : d.leaseDueDay,
    leaseStart: d.leaseStart || '',
    leaseEnd: d.leaseEnd || '',
    leaseIndex: d.leaseIndex || '',
    leaseDeposit: d.leaseDeposit == null ? '' : d.leaseDeposit,
    leaseNotes: d.leaseNotes || '',
    charges: sanitizeChargeList(d.charges),
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
    inventoryKind: seed.inventoryKind === 'patrimonio' ? 'patrimonio' : 'empreendimento',
    occupancy: seed.occupancy || (seed.inSales === false ? 'vago' : 'venda'),
    condoDefaultAmount: seed.condoDefaultAmount || '',
    buildingCharges: Array.isArray(seed.buildingCharges) ? seed.buildingCharges : [],
    maintenances: Array.isArray(seed.maintenances) ? seed.maintenances : [],
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
  if (stored.inventoryKind === 'patrimonio' || stored.inventoryKind === 'empreendimento') {
    base.inventoryKind = stored.inventoryKind;
  }
  if (stored.occupancy) base.occupancy = stored.occupancy;
  if (stored.inSales === false || stored.inSales === true) base.inSales = stored.inSales;
  if (base.inventoryKind === 'patrimonio') base.inSales = false;
  if (stored.condoDefaultAmount != null && stored.condoDefaultAmount !== '') {
    base.condoDefaultAmount = stored.condoDefaultAmount;
  }
  if (Array.isArray(stored.buildingCharges)) base.buildingCharges = sanitizeChargeList(stored.buildingCharges);
  if (Array.isArray(stored.maintenances)) base.maintenances = sanitizeChargeList(stored.maintenances);
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
    garantiaCaixa: '',
    archiveDocuments: [],
    engineeringHistory: [],
    rgiPath: '',
    rgiName: '',
    rgiDate: '',
    rgiHistory: [],
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
  if (!row.appraisalDate && seedU.appraisalDate) row.appraisalDate = seedU.appraisalDate;
  if (!row.valuePerM2 && seedU.valuePerM2) row.valuePerM2 = seedU.valuePerM2;
  if (!row.appraiser && seedU.appraiser) row.appraiser = seedU.appraiser;
  if (!row.reportPath && seedU.reportPath) {
    row.reportPath = seedU.reportPath;
    row.reportName = seedU.reportName || row.reportName || '';
  }
  if (!row.expiresAt && row.appraisalDate) {
    row.expiresAt = addMonthsYmd(row.appraisalDate, VALIDITY_MONTHS);
    var c = classify(row.expiresAt);
    row.status = c.status;
    row.daysLeft = c.daysLeft;
    row.statusLabel = c.label;
  }
  if (!row.historicalEngineering) row.historicalEngineering = hist || '';
  if (row.salePrice === '' || row.salePrice == null) row.salePrice = salePrice;
  if (!row.engineeringValue && seedU.engineeringValue) row.engineeringValue = seedU.engineeringValue;
  if (!row.engineeringValue && seedU.valueHintFromFilename) {
    row.valueHintFromFilename = seedU.valueHintFromFilename;
  }
  if (!row.notes && seedU.notes) row.notes = seedU.notes;
  if (!row.archiveDocuments || !row.archiveDocuments.length) {
    row.archiveDocuments = Array.isArray(seedU.documents) ? seedU.documents : [];
  }
  if (!Array.isArray(row.engineeringHistory)) row.engineeringHistory = [];
  if (!row.rgiPath) {
    var onusDoc = pickOnusDoc(row.archiveDocuments);
    if (onusDoc) {
      row.rgiPath = onusDoc.storagePath || '';
      row.rgiName = onusDoc.name || row.rgiName || '';
    }
  }
  if (!Array.isArray(row.rgiHistory)) row.rgiHistory = [];
  row.bedrooms = catalogUnit.bedrooms;
  row.catalogStatus = catalogUnit.status || '';
  if (!row.engineeringValue && hist) row.engineeringValue = hist;
  return row;
}

function pickOnusDoc(docs) {
  var i;
  var d;
  for (i = 0; i < (docs || []).length; i++) {
    d = docs[i] || {};
    if (d.kind === 'onus' && d.storagePath) return d;
  }
  return null;
}

function currentRgiSnapshot(d) {
  d = d || {};
  var path = d.rgiPath || '';
  var name = d.rgiName || '';
  var date = d.rgiDate || '';
  if (!path) {
    var onus = pickOnusDoc(d.archiveDocuments);
    if (onus) {
      path = onus.storagePath || '';
      name = name || onus.name || '';
    }
  }
  return {
    rgiPath: path,
    rgiName: name,
    rgiDate: date,
    archivedAt: new Date().toISOString(),
  };
}

function shouldArchiveRgi(body, old) {
  var current = currentRgiSnapshot(old);
  if (!current.rgiPath) return false;
  if (body.archiveCurrentRgi === true || body.archiveCurrentRgi === 'true' || body.archiveCurrentRgi === 1) {
    return true;
  }
  var newPath = String(body.rgiPath || '').trim();
  if (newPath && current.rgiPath && newPath !== current.rgiPath) return true;
  return false;
}

function snapshotEngineering(d) {
  d = d || {};
  var appraiser = isPersonName(d.appraiser) ? String(d.appraiser).trim() : '';
  return {
    appraisalDate: d.appraisalDate || dateFromDocName(d.reportName) || '',
    expiresAt: d.expiresAt || '',
    appraiser: appraiser,
    engineeringValue: d.engineeringValue == null ? '' : d.engineeringValue,
    valuePerM2: d.valuePerM2 == null ? '' : d.valuePerM2,
    reportPath: d.reportPath || '',
    reportName: d.reportName || '',
    garantiaCaixa: d.garantiaCaixa === 'apta' || d.garantiaCaixa === 'inapta' ? d.garantiaCaixa : '',
    laudoUnitHint: d.laudoUnitHint || '',
    archivedAt: new Date().toISOString(),
  };
}

function hasEngineeringSnapshot(d) {
  if (!d) return false;
  return !!(d.appraisalDate || d.reportPath || d.engineeringValue);
}

function hasRealEngineeringData(d) {
  if (!d) return false;
  return !!(d.appraisalDate || d.engineeringValue || isPersonName(d.appraiser));
}

function shouldArchiveCurrent(body, old) {
  if (!hasRealEngineeringData(old)) return false;
  if (body.archiveCurrent === true || body.archiveCurrent === 'true' || body.archiveCurrent === 1) {
    return true;
  }
  var newPath = String(body.reportPath || '').trim();
  if (newPath && old.reportPath && newPath !== old.reportPath) return true;
  return false;
}

function saneValuePerM2(raw, valor) {
  var n = Number(raw);
  if (!isFinite(n) || n <= 0) return '';
  if (n > 20000) return '';
  if (!valor || !Number(valor)) return '';
  if (n >= Number(valor) * 0.35) return '';
  return n;
}

async function downloadReportBuffer(storagePath) {
  var buckets = [
    'site-interativo-b-f-marques.firebasestorage.app',
    'site-interativo-b-f-marques.appspot.com',
  ];
  var i;
  var file;
  var exists;
  var buf;
  for (i = 0; i < buckets.length; i++) {
    try {
      file = admin.storage().bucket(buckets[i]).file(storagePath);
      exists = await file.exists();
      if (exists[0]) {
        buf = await file.download();
        return buf[0];
      }
    } catch (err) {
      console.warn('downloadReportBuffer', buckets[i], err && err.message);
    }
  }
  return null;
}

function mergeExtractIntoDoc(docU, extracted, overwrite) {
  if (!extracted) return docU;
  if (extracted.appraisalDate && (overwrite || !docU.appraisalDate)) {
    docU.appraisalDate = extracted.appraisalDate;
    docU.expiresAt = addMonthsYmd(extracted.appraisalDate, VALIDITY_MONTHS);
  }
  if (extracted.appraiser && (overwrite || !isPersonName(docU.appraiser))) {
    docU.appraiser = extracted.appraiser;
  }
  if (extracted.engineeringValue && (overwrite || docU.engineeringValue === '' || docU.engineeringValue == null)) {
    docU.engineeringValue = extracted.engineeringValue;
  }
  var extractedM2 = saneValuePerM2(extracted.valuePerM2, docU.engineeringValue || extracted.engineeringValue);
  if (extractedM2 && (overwrite || !saneValuePerM2(docU.valuePerM2, docU.engineeringValue))) {
    docU.valuePerM2 = extractedM2;
  } else {
    docU.valuePerM2 = saneValuePerM2(docU.valuePerM2, docU.engineeringValue);
  }
  if (extracted.garantiaCaixa === 'apta' || extracted.garantiaCaixa === 'inapta') {
    if (overwrite || !docU.garantiaCaixa) docU.garantiaCaixa = extracted.garantiaCaixa;
  }
  if (extracted.unitHint) docU.laudoUnitHint = String(extracted.unitHint);
  if (extracted.addressStreet) docU.laudoAddressStreet = String(extracted.addressStreet).slice(0, 120);
  if (extracted.addressCity) docU.laudoAddressCity = String(extracted.addressCity).slice(0, 80);
  return docU;
}

function docNeedsLaudoParse(docU) {
  if (!docU || !docU.reportPath) return false;
  return !docU.appraisalDate || !docU.engineeringValue || !isPersonName(docU.appraiser) || !saneValuePerM2(docU.valuePerM2, docU.engineeringValue);
}

async function fillDocFromStoredLaudo(docU, overwrite) {
  if (!docU.reportPath) return docU;
  if (!overwrite && !docNeedsLaudoParse(docU)) return docU;
  var buf = await downloadReportBuffer(docU.reportPath);
  if (!buf) {
    console.warn('fillDocFromStoredLaudo: PDF não encontrado', docU.reportPath);
    return docU;
  }
  var extracted = await extractLaudoFromPdf(buf, docU.reportName || '');
  var identityErr = documentIdentityError({
    extracted: extracted,
    property: seedProperty(docU.propertyId),
    unitCode: docU.unitCode,
    expectedMatricula: docU.matricula || '',
    fileName: docU.reportName || '',
    allProperties: allSeedProperties(),
    kind: 'laudo',
  });
  if (identityErr) {
    if (overwrite) {
      var mismatch = new Error(identityErr);
      mismatch.code = 'laudo-mismatch';
      mismatch.unitHint = extracted && extracted.unitHint;
      throw mismatch;
    }
    if (extracted && extracted.unitHint) docU.laudoUnitHint = String(extracted.unitHint);
    return docU;
  }
  return mergeExtractIntoDoc(docU, extracted, overwrite);
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
  list.sort(function(a, b) {
    var A = unitSortTuple(a && a.unitCode);
    var B = unitSortTuple(b && b.unitCode);
    for (var i = 0; i < 3; i++) if (A[i] !== B[i]) return A[i] - B[i];
    return String((a && a.unitCode) || '').localeCompare(String((b && b.unitCode) || ''), 'pt');
  });
  return { catalog: catalog, rows: list };
}

function unitSortTuple(code) {
  var n = String(code || '').toLowerCase().replace(/\s+/g, ' ').replace(/\bcassa\b/, 'casa');
  var apto = n.match(/\bapto\s*(\d+)/);
  if (apto) return [2, Number(apto[1]), 0];
  if (/(casa|cs)\s*base/.test(n)) return [1, 0, 0];
  if (/^\d+\s*(\(|$)/.test(n) && !/\b(cs|casa)\b/.test(n)) return [1, 0, 0];
  var casa = n.match(/(?:casa|cs)\s*(\d+)/);
  if (casa) {
    var extra = /\bsob/.test(n) ? 2 : (/\bap\b/.test(n) ? 1 : 0);
    return [1, Number(casa[1]), extra];
  }
  return [3, 9999, 0];
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
      var propMeta = {};
      var propSnap = await db.collection(PROP_COL).limit(500).get();
      propSnap.forEach(function(doc) {
        var d = doc.data() || {};
        propMeta[doc.id] = {
          inventoryKind: d.inventoryKind === 'patrimonio' ? 'patrimonio' : 'empreendimento',
          occupancy: d.occupancy || '',
        };
      });
      function effectiveOcc(r) {
        if (r.occupancy) return r.occupancy;
        var m = propMeta[String(r.propertyId)];
        return (m && m.occupancy) || '';
      }
      function isPatrimonio(r) {
        var m = propMeta[String(r.propertyId)];
        return !!(m && m.inventoryKind === 'patrimonio');
      }
      var leaseEnding = all.filter(function(r) {
        if (effectiveOcc(r) !== 'alugado' || !r.leaseEnd) return false;
        var days = daysBetween(todayYmd(), r.leaseEnd);
        return days != null && days <= ALERT_DAYS;
      });
      var vacantPatrimonio = all.filter(function(r) {
        return isPatrimonio(r) && effectiveOcc(r) === 'vago';
      });
      var chargesDue = [];
      var chargesOverdue = [];
      var maintDue = [];
      all.forEach(function(r) {
        var bag = flattenOpenCharges(r.charges, {
          propertyId: r.propertyId,
          unitCode: r.unitCode,
          scope: 'unit',
        });
        chargesDue = chargesDue.concat(bag.due);
        chargesOverdue = chargesOverdue.concat(bag.overdue);
      });
      propSnap.forEach(function(doc) {
        var d = doc.data() || {};
        var meta = { propertyId: doc.id, unitCode: '', scope: 'building', officialName: d.officialName || '' };
        var b = flattenOpenCharges(d.buildingCharges, meta);
        var m = flattenOpenCharges(d.maintenances, meta);
        chargesDue = chargesDue.concat(b.due);
        chargesOverdue = chargesOverdue.concat(b.overdue);
        maintDue = maintDue.concat(m.due || []).concat(m.overdue || []);
      });
      return res.json({
        ok: true,
        alertDays: ALERT_DAYS,
        expiring: expiring,
        expired: expired,
        leaseEnding: leaseEnding,
        vacantPatrimonio: vacantPatrimonio,
        chargesDue: chargesDue,
        chargesOverdue: chargesOverdue,
        maintenancesDue: maintDue,
        counts: {
          expiring: expiring.length,
          expired: expired.length,
          vigente: all.filter(function(r) { return r.status === 'vigente'; }).length,
          leaseEnding: leaseEnding.length,
          vacantPatrimonio: vacantPatrimonio.length,
          chargesDue: chargesDue.length,
          chargesOverdue: chargesOverdue.length,
          maintenancesDue: maintDue.length,
        },
      });
    }

    if (action === 'list_charges') {
      var allC = await loadAllRows(db);
      var propSnapC = await db.collection(PROP_COL).limit(500).get();
      var items = [];
      allC.forEach(function(r) {
        (r.charges || []).forEach(function(ch) {
          items.push(Object.assign({}, ch, {
            propertyId: r.propertyId,
            unitCode: r.unitCode,
            scope: 'unit',
          }));
        });
      });
      propSnapC.forEach(function(doc) {
        var d = doc.data() || {};
        (sanitizeChargeList(d.buildingCharges) || []).concat(sanitizeChargeList(d.maintenances) || []).forEach(function(ch) {
          items.push(Object.assign({}, ch, {
            propertyId: doc.id,
            unitCode: '',
            scope: 'building',
            officialName: d.officialName || '',
          }));
        });
      });
      return res.json({ ok: true, charges: items });
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
      doc.inventoryKind = String(body.inventoryKind || doc.inventoryKind || '').trim() === 'patrimonio'
        ? 'patrimonio'
        : 'empreendimento';
      var occ = String(body.occupancy != null ? body.occupancy : doc.occupancy || '').trim();
      doc.occupancy = ({ venda: 1, alugado: 1, vago: 1, uso_proprio: 1 }[occ])
        ? occ
        : (doc.inventoryKind === 'patrimonio' ? 'vago' : 'venda');
      if (doc.inventoryKind === 'patrimonio') {
        doc.inSales = false;
        if (doc.occupancy === 'venda') doc.occupancy = 'vago';
      } else if (body.inSales === false || body.inSales === 'false' || body.inSales === 0) {
        doc.inSales = false;
      } else if (body.inSales === true || body.inSales === 'true' || body.inSales === 1) {
        doc.inSales = true;
      }
      if (body.condoDefaultAmount != null) {
        doc.condoDefaultAmount = String(body.condoDefaultAmount).trim().slice(0, 40);
      }
      if (body.buildingCharges != null) doc.buildingCharges = sanitizeChargeList(body.buildingCharges);
      if (body.maintenances != null) {
        doc.maintenances = sanitizeChargeList(body.maintenances).map(function(c) {
          c.kind = 'manutencao';
          return c;
        });
      }
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
      var history = Array.isArray(old.engineeringHistory) ? old.engineeringHistory.slice() : [];
      var archiveCurrent = shouldArchiveCurrent(body, old);
      if (archiveCurrent) {
        var snap = snapshotEngineering(old);
        snap.archivedBy = auth.email || '';
        var dup = history[0] &&
          String(history[0].appraisalDate || '') === String(snap.appraisalDate || '') &&
          String(history[0].reportPath || '') === String(snap.reportPath || '');
        if (!dup) history.unshift(snap);
        if (history.length > 20) history = history.slice(0, 20);
      }
      var rgiHistory = Array.isArray(old.rgiHistory) ? old.rgiHistory.slice() : [];
      var archiveRgi = shouldArchiveRgi(body, old);
      if (archiveRgi) {
        var rgiSnap = currentRgiSnapshot(old);
        rgiSnap.archivedBy = auth.email || '';
        var rgiDup = rgiHistory[0] &&
          String(rgiHistory[0].rgiPath || '') === String(rgiSnap.rgiPath || '') &&
          String(rgiHistory[0].rgiDate || '') === String(rgiSnap.rgiDate || '');
        if (!rgiDup && rgiSnap.rgiPath) rgiHistory.unshift(rgiSnap);
        if (rgiHistory.length > 20) rgiHistory = rgiHistory.slice(0, 20);
      }
      var rgiDate = String(body.rgiDate != null ? body.rgiDate : (archiveRgi ? '' : (old.rgiDate || ''))).trim();
      if (rgiDate && !/^\d{4}-\d{2}-\d{2}$/.test(rgiDate)) {
        return res.status(400).json({ error: 'Data do RGI inválida' });
      }
      var docU = {
        propertyId: typeof propertyId === 'number' ? propertyId : (Number(propertyId) || propertyId),
        unitCode: unitCode,
        matricula: String(body.matricula != null ? body.matricula : (old.matricula || '')).trim().slice(0, 40),
        inscricaoMunicipal: String(body.inscricaoMunicipal != null ? body.inscricaoMunicipal : (old.inscricaoMunicipal || '')).trim().slice(0, 60),
        salePrice: body.salePrice != null && body.salePrice !== '' ? parseSalePrice(body.salePrice) : (old.salePrice != null ? old.salePrice : ''),
        appraiser: (function() {
          var a = String(body.appraiser != null ? body.appraiser : (old.appraiser || '')).trim().slice(0, 120);
          return isPersonName(a) ? a : '';
        })(),
        engineeringValue: body.engineeringValue != null ? body.engineeringValue : (old.engineeringValue || ''),
        historicalEngineering: String(body.historicalEngineering != null ? body.historicalEngineering : (old.historicalEngineering || '')).trim().slice(0, 80),
        valuePerM2: saneValuePerM2(
          body.valuePerM2 != null ? body.valuePerM2 : (old.valuePerM2 || ''),
          body.engineeringValue != null ? body.engineeringValue : old.engineeringValue
        ),
        appraisalDate: appraisalDate || '',
        expiresAt: expiresAt,
        reportPath: String(body.reportPath || '').trim() || (archiveCurrent ? '' : (old.reportPath || '')),
        reportName: String(body.reportName || '').trim().slice(0, 160) || (archiveCurrent ? '' : (old.reportName || '')),
        garantiaCaixa: (function() {
          var g = String(body.garantiaCaixa != null ? body.garantiaCaixa : (archiveCurrent ? '' : (old.garantiaCaixa || ''))).trim();
          return g === 'apta' || g === 'inapta' ? g : '';
        })(),
        archiveDocuments: Array.isArray(body.archiveDocuments) ? body.archiveDocuments : (old.archiveDocuments || []),
        engineeringHistory: history,
        rgiPath: String(body.rgiPath || '').trim() || (archiveRgi ? '' : (old.rgiPath || '')),
        rgiName: String(body.rgiName || '').trim().slice(0, 160) || (archiveRgi ? '' : (old.rgiName || '')),
        rgiDate: rgiDate,
        rgiHistory: rgiHistory,
        notes: String(body.notes != null ? body.notes : (old.notes || '')).trim().slice(0, 500),
        occupancy: (function() {
          var o = String(body.occupancy != null ? body.occupancy : (old.occupancy || '')).trim();
          return ({ venda: 1, alugado: 1, vago: 1, uso_proprio: 1 }[o]) ? o : (old.occupancy || '');
        })(),
        updatedAt: nowU,
        updatedBy: auth.email || '',
      };
      var lease = leaseFromBody(body, old);
      Object.keys(lease).forEach(function(key) { docU[key] = lease[key]; });
      docU.charges = body.charges != null ? sanitizeChargeList(body.charges) : sanitizeChargeList(old.charges);
      var pathChanged = !!(docU.reportPath && docU.reportPath !== (old.reportPath || ''));
      try {
        docU = await fillDocFromStoredLaudo(docU, pathChanged);
      } catch (fillErr) {
        if (fillErr && (fillErr.code === 'unit-mismatch' || fillErr.code === 'laudo-mismatch')) {
          return res.status(400).json({
            error: fillErr.message,
            unitHint: fillErr.unitHint || '',
          });
        }
        throw fillErr;
      }
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
