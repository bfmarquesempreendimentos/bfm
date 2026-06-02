'use strict';

const admin = require('firebase-admin');
const { verifyAdminFromBody } = require('./admin-accounts');

function allowCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return {};
}

/** Lista vendas (admin). */
async function adminPropertySalesList(req, res) {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  var body = parseJsonBody(req);
  if (!verifyAdminFromBody(body)) return res.status(403).json({ error: 'Acesso negado' });
  try {
    var db = admin.firestore();
    var snap = await db.collection('propertySales').get();
    var list = [];
    snap.forEach(function(doc) {
      list.push({ id: doc.id, ...doc.data() });
    });
    list.sort(function(a, b) {
      var ta = new Date(a.createdAt || a.saleDate || 0).getTime();
      var tb = new Date(b.createdAt || b.saleDate || 0).getTime();
      return tb - ta;
    });
    return res.json({ success: true, sales: list });
  } catch (err) {
    console.error('adminPropertySalesList:', err);
    return res.status(500).json({ error: err.message });
  }
}

function collectSalesDocsData(snapshot) {
  var out = [];
  snapshot.forEach(function(doc) {
    out.push({ id: doc.id, ...doc.data() });
  });
  return out;
}

function checkSaleDuplicates(existingList, propertyId, saleSlotKey) {
  var pidStr = String(propertyId);
  var legacyBlocks = false;
  var i;
  var d;
  for (i = 0; i < existingList.length; i++) {
    d = existingList[i];
    if (String(d.propertyId) !== pidStr) continue;
    if (!d.saleSlotKey) {
      legacyBlocks = true;
    } else if (d.saleSlotKey === saleSlotKey) {
      return 'DUP';
    }
  }
  if (legacyBlocks) return 'LEGACY';
  return 'OK';
}

async function mergePropertyIntoClientProfile(db, auth, email, propertyObj) {
  var normEmail = String(email || '').trim().toLowerCase();
  if (!normEmail || !propertyObj) return { merged: false, reason: 'invalid' };
  var userRecord;
  try {
    userRecord = await auth.getUserByEmail(normEmail);
  } catch (e) {
    return { merged: false, reason: 'no_user' };
  }
  var uid = userRecord.uid;
  var ref = db.collection('clients').doc(uid);
  var snap = await ref.get();
  var props = [];
  if (snap.exists) {
    var data = snap.data();
    props = Array.isArray(data.properties) ? data.properties.slice() : [];
  }
  var exists = false;
  var i;
  var p;
  for (i = 0; i < props.length; i++) {
    p = props[i];
    if (String(p.propertyId) === String(propertyObj.propertyId) && String(p.unitCode || '') === String(propertyObj.unitCode || '')) {
      exists = true;
      break;
    }
  }
  if (!exists) props.push(propertyObj);
  await ref.set({ properties: props, updatedAt: new Date().toISOString() }, { merge: true });
  return { merged: true };
}

async function removeSaleFromClientProfile(db, auth, clientEmail, saleFirestoreId, propertyId, unitCode) {
  var email = String(clientEmail || '').trim().toLowerCase();
  if (!email) return;
  var userRecord;
  try {
    userRecord = await auth.getUserByEmail(email);
  } catch (e) {
    return;
  }
  var uid = userRecord.uid;
  var ref = db.collection('clients').doc(uid);
  var snap = await ref.get();
  if (!snap.exists) return;
  var data = snap.data();
  var props = Array.isArray(data.properties) ? data.properties : [];
  var filtered = props.filter(function(p) {
    if (saleFirestoreId && String(p.id) === String(saleFirestoreId)) return false;
    if (String(p.propertyId) === String(propertyId) && String(p.unitCode || '') === String(unitCode || '')) return false;
    return true;
  });
  await ref.set({ properties: filtered, updatedAt: new Date().toISOString() }, { merge: true });
}

async function applyUnitStatusOverride(db, propertyId, unitCode, status) {
  if (!propertyId || !unitCode) return;
  var ref = db.collection('unit_status_overrides').doc(String(propertyId));
  var snap = await ref.get();
  var map = {};
  if (snap.exists && snap.data().map && typeof snap.data().map === 'object') {
    map = { ...snap.data().map };
  }
  map[unitCode] = status || 'assinado';
  await ref.set({ map: map, updatedAt: new Date().toISOString() }, { merge: true });
}

async function adminPropertySaleMutate(req, res) {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  var body = parseJsonBody(req);
  if (!verifyAdminFromBody(body)) return res.status(403).json({ error: 'Acesso negado' });
  var action = String(body.action || '').toLowerCase();
  var db = admin.firestore();
  var auth = admin.auth();

  try {
    if (action === 'delete') {
      var delId = String(body.saleFirestoreId || '').trim();
      if (!delId) return res.status(400).json({ error: 'saleFirestoreId obrigatório' });
      var delRef = db.collection('propertySales').doc(delId);
      var delSnap = await delRef.get();
      if (!delSnap.exists) return res.status(404).json({ error: 'Venda não encontrada' });
      var delData = delSnap.data() || {};
      await removeSaleFromClientProfile(
        db,
        auth,
        delData.clientEmail,
        delId,
        delData.propertyId,
        delData.unitCode
      );
      await delRef.delete();
      return res.json({ success: true, deletedId: delId });
    }

    if (action === 'update') {
      var upId = String(body.saleFirestoreId || '').trim();
      var patch = body.sale || {};
      if (!upId) return res.status(400).json({ error: 'saleFirestoreId obrigatório' });
      var upRef = db.collection('propertySales').doc(upId);
      var upSnap = await upRef.get();
      if (!upSnap.exists) return res.status(404).json({ error: 'Venda não encontrada' });
      var prev = upSnap.data() || {};
      var cpfClean = patch.clientCPF != null ? String(patch.clientCPF).replace(/\D/g, '') : prev.clientCPF;
      var update = {
        clientName: patch.clientName != null ? patch.clientName : prev.clientName,
        clientCPF: cpfClean,
        clientEmail: patch.clientEmail != null ? String(patch.clientEmail).trim().toLowerCase() : prev.clientEmail,
        clientPhone: patch.clientPhone != null ? patch.clientPhone : prev.clientPhone,
        salePrice: patch.salePrice != null ? Number(patch.salePrice) : prev.salePrice,
        contractNumber: patch.contractNumber != null ? patch.contractNumber : prev.contractNumber,
        brokerName: patch.brokerName != null ? patch.brokerName : prev.brokerName,
        brokerEmail: patch.brokerEmail != null ? patch.brokerEmail : prev.brokerEmail,
        notes: patch.notes != null ? patch.notes : prev.notes,
        updatedAt: new Date().toISOString(),
      };
      if (patch.contractPhotos != null) update.contractPhotos = patch.contractPhotos;
      if (body.updatedBy && typeof body.updatedBy === 'object') update.updatedBy = body.updatedBy;
      await upRef.set(update, { merge: true });
      var merged = await upRef.get();
      return res.json({ success: true, sale: { id: upId, ...merged.data() } });
    }

    if (action !== 'create') return res.status(400).json({ error: 'action inválida' });

    var sale = body.sale || {};
    var propertyId = sale.propertyId;
    if (propertyId === undefined || propertyId === null || propertyId === '') {
      return res.status(400).json({ error: 'propertyId obrigatório' });
    }
    var saleSlotKey = String(sale.saleSlotKey || '').trim();
    if (!saleSlotKey) return res.status(400).json({ error: 'saleSlotKey obrigatório (erro interno de formulário)' });

    var allSnap = await db.collection('propertySales').get();
    var allList = collectSalesDocsData(allSnap);
    var dup = checkSaleDuplicates(allList, propertyId, saleSlotKey);
    if (dup === 'DUP') return res.status(409).json({ error: 'Já existe venda para esta mesma unidade/posição.' });
    if (dup === 'LEGACY') {
      return res.status(409).json({
        error:
          'Existe venda antiga sem unidade neste empreendimento. Exclua ou edite a venda antiga antes de cadastrar por unidade.',
      });
    }

    var clientCPF = String(sale.clientCPF || '').replace(/\D/g, '');
    if (clientCPF.length !== 11 && clientCPF.length !== 14) {
      return res.status(400).json({ error: 'CPF/CNPJ inválido' });
    }

    var salePrice = Number(sale.salePrice || 0);
    if (!(salePrice > 0)) return res.status(400).json({ error: 'Valor inválido' });

    var doc = {
      propertyId: typeof propertyId === 'number' ? propertyId : Number(propertyId) || propertyId,
      propertyTitle: sale.propertyTitle || 'Imóvel',
      unitCode: sale.unitCode != null ? sale.unitCode : null,
      saleSlotKey: saleSlotKey,
      clientCPF: clientCPF,
      clientName: sale.clientName || '',
      clientEmail: String(sale.clientEmail || '').trim().toLowerCase(),
      clientPhone: sale.clientPhone || '',
      saleDate: sale.saleDate || new Date().toISOString(),
      salePrice: salePrice,
      contractNumber: sale.contractNumber || null,
      contractPhotos: sale.contractPhotos || null,
      contractPhotosSkippedBySuperAdmin: !!sale.contractPhotosSkippedBySuperAdmin,
      brokerName: sale.brokerName || null,
      brokerEmail: sale.brokerEmail || null,
      notes: sale.notes || null,
      status: 'vendido',
      createdAt: new Date().toISOString(),
    };
    if (sale.createdBy && typeof sale.createdBy === 'object') doc.createdBy = sale.createdBy;

    var ref = await db.collection('propertySales').add(doc);
    var newId = ref.id;
    await db.collection('propertySales').doc(newId).set({ id: newId }, { merge: true });

    if (body.syncUnitStatus && doc.unitCode) {
      await applyUnitStatusOverride(db, doc.propertyId, doc.unitCode, 'assinado');
    }

    var outSnap = await db.collection('propertySales').doc(newId).get();
    return res.status(201).json({ success: true, sale: { id: newId, ...outSnap.data() } });
  } catch (err) {
    console.error('adminPropertySaleMutate:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function adminMergeClientProperty(req, res) {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  var body = parseJsonBody(req);
  if (!verifyAdminFromBody(body)) return res.status(403).json({ error: 'Acesso negado' });
  var clientEmail = String(body.clientEmail || '').trim().toLowerCase();
  var propertyFromSale = body.propertyFromSale;
  if (!clientEmail || !propertyFromSale) return res.status(400).json({ error: 'Dados incompletos' });
  try {
    var db = admin.firestore();
    var r = await mergePropertyIntoClientProfile(db, admin.auth(), clientEmail, propertyFromSale);
    return res.json({ success: true, ...r });
  } catch (err) {
    console.error('adminMergeClientProperty:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function clientPropertySalesMe(req, res) {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  var token = null;
  var authHeader = req.headers.authorization;
  if (authHeader && authHeader.indexOf('Bearer ') === 0) {
    token = authHeader.split('Bearer ')[1];
  }
  var body = parseJsonBody(req);
  if (!token && body.idToken) token = body.idToken;
  if (!token) return res.status(401).json({ error: 'Token necessário' });
  try {
    var decoded = await admin.auth().verifyIdToken(token);
    var email = String(decoded.email || '').trim().toLowerCase();
    if (!email) return res.status(403).json({ error: 'Email não disponível no token' });
    var db = admin.firestore();
    var snap = await db.collection('propertySales').where('clientEmail', '==', email).get();
    var list = [];
    snap.forEach(function(doc) {
      list.push({ id: doc.id, ...doc.data() });
    });
    return res.json({ success: true, sales: list });
  } catch (err) {
    console.error('clientPropertySalesMe:', err);
    return res.status(403).json({ error: 'Token inválido ou expirado' });
  }
}

async function clientSaleEligibility(req, res) {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  var body = parseJsonBody(req);
  var email = String(body.email || '').trim().toLowerCase();
  var cpf = String(body.cpf || '').replace(/\D/g, '');
  if (!email && !cpf) return res.status(400).json({ error: 'Informe email ou CPF' });
  try {
    var db = admin.firestore();
    var eligible = false;
    if (email) {
      var s1 = await db.collection('propertySales').where('clientEmail', '==', email).limit(1).get();
      if (!s1.empty) eligible = true;
    }
    if (!eligible && cpf) {
      var s2 = await db.collection('propertySales').where('clientCPF', '==', cpf).limit(1).get();
      if (!s2.empty) eligible = true;
    }
    return res.json({ eligible: eligible });
  } catch (err) {
    console.error('clientSaleEligibility:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function getPublicUnitOverrides(req, res) {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
  try {
    var db = admin.firestore();
    var snap = await db.collection('unit_status_overrides').get();
    var payload = {};
    snap.forEach(function(doc) {
      var d = doc.data();
      if (d.map && typeof d.map === 'object') {
        payload[doc.id] = d.map;
      }
    });
    return res.json(payload);
  } catch (err) {
    console.error('getPublicUnitOverrides:', err);
    return res.status(500).json({ error: err.message });
  }
}

function normalizeUnitSlotTokenServer(raw) {
  if (raw == null || raw === '') return '';
  return String(raw)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Preenche saleSlotKey em vendas antigas (uma execução após deploy). */
async function adminMigrateLegacySaleSlots(req, res) {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  var body = parseJsonBody(req);
  if (!verifyAdminFromBody(body)) return res.status(403).json({ error: 'Acesso negado' });
  try {
    var db = admin.firestore();
    var snap = await db.collection('propertySales').get();
    var updated = 0;
    var skipped = 0;
    var batch = db.batch();
    var batchCount = 0;
    var commits = [];

    function flushBatch() {
      if (batchCount === 0) return;
      commits.push(batch.commit());
      batch = db.batch();
      batchCount = 0;
    }

    snap.forEach(function(doc) {
      var d = doc.data() || {};
      if (d.saleSlotKey) {
        skipped++;
        return;
      }
      var pid = d.propertyId;
      var slot;
      if (d.unitCode != null && String(d.unitCode).trim() !== '') {
        slot = String(pid) + '|' + normalizeUnitSlotTokenServer(d.unitCode);
      } else {
        slot = String(pid) + '|__legacy__';
      }
      batch.update(doc.ref, {
        saleSlotKey: slot,
        migratedSaleSlotAt: new Date().toISOString(),
      });
      batchCount++;
      updated++;
      if (batchCount >= 400) flushBatch();
    });
    flushBatch();
    await Promise.all(commits);
    return res.json({ success: true, updated: updated, skippedAlreadyHadSlot: skipped, totalDocs: snap.size });
  } catch (err) {
    console.error('adminMigrateLegacySaleSlots:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function adminSetUnitStatusOverrides(req, res) {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  var body = parseJsonBody(req);
  if (!verifyAdminFromBody(body)) return res.status(403).json({ error: 'Acesso negado' });
  var items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return res.status(400).json({ error: 'items obrigatório' });
  try {
    var db = admin.firestore();
    var i;
    for (i = 0; i < items.length; i++) {
      var item = items[i];
      if (!item || item.propertyId == null || !item.unitCode) continue;
      await applyUnitStatusOverride(db, item.propertyId, item.unitCode, item.status || 'reservado');
    }
    return res.json({ success: true, count: items.length });
  } catch (err) {
    console.error('adminSetUnitStatusOverrides:', err);
    return res.status(500).json({ error: err.message });
  }
}

/** Grava no Firestore o mapa completo de status por empreendimento (espelho de property-units-data.js). */
async function adminSyncCatalogUnitStatuses(req, res) {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  var body = parseJsonBody(req);
  if (!verifyAdminFromBody(body)) return res.status(403).json({ error: 'Acesso negado' });
  try {
    var catalog = require('./chatbot/property-units-data');
    var db = admin.firestore();
    var pid;
    var prop;
    var map;
    var i;
    var u;
    var unitsWritten = 0;
    var propertiesWritten = 0;
    for (pid in catalog) {
      if (!Object.prototype.hasOwnProperty.call(catalog, pid)) continue;
      prop = catalog[pid];
      if (!prop || !Array.isArray(prop.units) || !prop.units.length) continue;
      map = {};
      for (i = 0; i < prop.units.length; i++) {
        u = prop.units[i];
        if (!u || !u.code) continue;
        map[u.code] = u.status || 'disponivel';
        unitsWritten++;
      }
      await db.collection('unit_status_overrides').doc(String(pid)).set({
        map: map,
        updatedAt: new Date().toISOString(),
        source: 'catalog-sync',
      }, { merge: true });
      propertiesWritten++;
    }
    return res.json({ success: true, propertiesWritten: propertiesWritten, unitsWritten: unitsWritten });
  } catch (err) {
    console.error('adminSyncCatalogUnitStatuses:', err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  allowCors,
  adminPropertySalesList,
  adminPropertySaleMutate,
  adminMergeClientProperty,
  clientPropertySalesMe,
  clientSaleEligibility,
  getPublicUnitOverrides,
  adminMigrateLegacySaleSlots,
  adminSetUnitStatusOverrides,
  adminSyncCatalogUnitStatuses,
};
