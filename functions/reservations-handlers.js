'use strict';

const admin = require('firebase-admin');
const { verifyAdminAuth, extractIdToken } = require('./admin-auth');
const brokerAuth = require('./broker-auth');
const { resolveSaleSlot, getPropertyUnitsRaw } = require('./sale-unit-validation');
const { allowCors, parseJsonBody, applyUnitStatusOverride } = require('./property-sales-handlers');
const fcmPush = require('./fcm-push');

var RESERVATION_BUSINESS_DAYS = 3;
var ACTIVE_STATUSES = { pending: true, active: true };

function isoNow() {
  return new Date().toISOString();
}

/** Prazo: fim do N-ésimo dia útil (seg–sex), contando o dia inicial se for útil. */
function endOfBusinessDaysFrom(startDate, businessDays) {
  var d = new Date(startDate.getTime());
  var remaining = businessDays;
  while (remaining > 0) {
    var dow = d.getDay();
    if (dow !== 0 && dow !== 6) remaining--;
    if (remaining > 0) d.setDate(d.getDate() + 1);
  }
  d.setHours(23, 59, 59, 999);
  return d;
}

function reservationSlotKey(propertyId, unitCode) {
  if (unitCode != null && String(unitCode).trim() !== '') {
    var slot = resolveSaleSlot(propertyId, unitCode);
    if (slot && slot.saleSlotKey) return slot.saleSlotKey;
    return String(propertyId) + '|' + String(unitCode).toLowerCase().replace(/\s+/g, ' ').trim();
  }
  return String(propertyId) + '|__legacy__';
}

function reservationPublicRow(docId, data) {
  var d = data || {};
  var client = d.client || d.clientInfo || {};
  return {
    id: docId,
    legacyId: d.legacyId || '',
    propertyId: d.propertyId,
    propertyTitle: d.propertyTitle || '',
    unitCode: d.unitCode || '',
    unitPrice: d.unitPrice != null ? d.unitPrice : null,
    unitBedrooms: d.unitBedrooms != null ? d.unitBedrooms : null,
    reservationSlotKey: d.reservationSlotKey || '',
    brokerId: d.brokerId || '',
    brokerName: d.brokerName || '',
    brokerEmail: d.brokerEmail || '',
    brokerPhone: d.brokerPhone || '',
    client: {
      name: client.name || '',
      email: client.email || '',
      phone: client.phone || '',
      cpf: client.cpf || '',
      notes: client.notes || '',
    },
    requestedAt: d.requestedAt || d.createdAt || '',
    approvedAt: d.approvedAt || '',
    approvedBy: d.approvedBy || null,
    expiresAt: d.expiresAt || '',
    rejectedAt: d.rejectedAt || '',
    cancelledAt: d.cancelledAt || '',
    expiredAt: d.expiredAt || '',
    rejectionReason: d.rejectionReason || '',
    status: d.status || 'pending',
    source: d.source || 'broker_form',
    notes: d.notes || '',
    saleId: d.saleId || '',
  };
}

async function getEffectiveUnitStatus(db, propertyId, unitCode) {
  if (!unitCode) return 'disponivel';
  var ref = db.collection('unit_status_overrides').doc(String(propertyId));
  var snap = await ref.get();
  if (snap.exists && snap.data().map && snap.data().map[unitCode]) {
    return snap.data().map[unitCode];
  }
  var raw = getPropertyUnitsRaw(propertyId);
  if (raw && raw.units) {
    var i;
    for (i = 0; i < raw.units.length; i++) {
      if (raw.units[i].code === unitCode) return raw.units[i].status || 'disponivel';
    }
  }
  return 'disponivel';
}

async function findConflictingReservation(db, slotKey, excludeDocId) {
  var snap = await db.collection('reservations').where('reservationSlotKey', '==', slotKey).get();
  var conflict = null;
  snap.forEach(function(doc) {
    if (excludeDocId && doc.id === excludeDocId) return;
    var st = String((doc.data() || {}).status || '');
    if (ACTIVE_STATUSES[st]) conflict = { id: doc.id, data: doc.data() };
  });
  return conflict;
}

async function expireStaleReservations(db) {
  var now = Date.now();
  var snap = await db.collection('reservations').where('status', '==', 'active').get();
  var expired = 0;
  var batch = [];
  snap.forEach(function(doc) {
    var d = doc.data() || {};
    var exp = d.expiresAt ? new Date(d.expiresAt).getTime() : 0;
    if (!exp || exp > now) return;
    batch.push({ ref: doc.ref, data: d });
  });
  var i;
  for (i = 0; i < batch.length; i++) {
    var item = batch[i];
    await item.ref.set({
      status: 'expired',
      expiredAt: isoNow(),
      updatedAt: isoNow(),
    }, { merge: true });
    if (item.data.unitCode) {
      await applyUnitStatusOverride(db, item.data.propertyId, item.data.unitCode, 'disponivel');
    }
    expired++;
  }
  return expired;
}

async function syncUnitForReservation(db, reservation, status) {
  if (!reservation || !reservation.unitCode) return;
  await applyUnitStatusOverride(db, reservation.propertyId, reservation.unitCode, status);
}

async function brokerCreateReservation(req, res) {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    var token = extractIdToken(req);
    if (!token) return res.status(401).json({ error: 'Autenticação necessária' });
    var broker = await brokerAuth.getBrokerFromIdToken(token);
    if (!broker) return res.status(403).json({ error: 'Corretor não autorizado' });

    var body = parseJsonBody(req);
    var propertyId = body.propertyId;
    if (propertyId === undefined || propertyId === null || propertyId === '') {
      return res.status(400).json({ error: 'propertyId obrigatório' });
    }

    var slotResolved = resolveSaleSlot(propertyId, body.unitCode);
    if (slotResolved.error) return res.status(400).json({ error: slotResolved.error });
    var unitCode = slotResolved.unitCode;
    var slotKey = reservationSlotKey(propertyId, unitCode);

    var client = body.client || body.clientInfo || {};
    var clientName = String(client.name || '').trim();
    var clientCpf = String(client.cpf || '').replace(/\D/g, '');
    if (!clientName) return res.status(400).json({ error: 'Nome do cliente obrigatório' });
    if (clientCpf.length !== 11) return res.status(400).json({ error: 'CPF do cliente inválido' });

    var db = admin.firestore();
    await expireStaleReservations(db);

    var conflict = await findConflictingReservation(db, slotKey, null);
    if (conflict) {
      return res.status(409).json({ error: 'Já existe reserva pendente ou ativa para esta unidade.' });
    }

    var unitStatus = await getEffectiveUnitStatus(db, propertyId, unitCode);
    if (unitStatus !== 'disponivel') {
      return res.status(409).json({ error: 'Unidade não está disponível (' + unitStatus + ').' });
    }

    var raw = getPropertyUnitsRaw(propertyId);
    var unitPrice = body.unitPrice != null ? Number(body.unitPrice) : null;
    var unitBedrooms = body.unitBedrooms != null ? Number(body.unitBedrooms) : null;
    if (raw && raw.units && unitCode) {
      var ui;
      for (ui = 0; ui < raw.units.length; ui++) {
        if (raw.units[ui].code === unitCode) {
          if (unitPrice == null) unitPrice = raw.units[ui].price;
          if (unitBedrooms == null) unitBedrooms = raw.units[ui].bedrooms;
          break;
        }
      }
    }

    var now = isoNow();
    var doc = {
      propertyId: typeof propertyId === 'number' ? propertyId : Number(propertyId) || propertyId,
      propertyTitle: String(body.propertyTitle || '').trim(),
      unitCode: unitCode || '',
      unitPrice: unitPrice,
      unitBedrooms: unitBedrooms,
      reservationSlotKey: slotKey,
      brokerId: broker.id,
      brokerName: broker.name,
      brokerEmail: broker.email,
      brokerPhone: broker.phone || '',
      client: {
        name: clientName,
        email: String(client.email || '').trim(),
        phone: String(client.phone || '').trim(),
        cpf: clientCpf,
        notes: String(client.notes || '').trim(),
      },
      requestedAt: now,
      createdAt: now,
      expiresAt: '',
      status: 'pending',
      source: String(body.source || 'broker_form'),
      notes: String(body.notes || '').trim(),
      updatedAt: now,
    };

    var ref = await db.collection('reservations').add(doc);
    fcmPush.notifyAdmins(
      db,
      'Nova solicitação de reserva',
      broker.name + ' — ' + (body.propertyTitle || 'Unidade') + (unitCode ? ' · ' + unitCode : ''),
      { type: 'reservation', reservationId: ref.id },
      'https://bfmarquesempreendimentos.github.io/bfm/admin.html#reservations'
    ).catch(function() {});
    return res.json({ ok: true, reservation: reservationPublicRow(ref.id, doc) });
  } catch (err) {
    console.error('brokerCreateReservation:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function brokerMyReservations(req, res) {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    var token = extractIdToken(req);
    if (!token) return res.status(401).json({ error: 'Autenticação necessária' });
    var broker = await brokerAuth.getBrokerFromIdToken(token);
    if (!broker) return res.status(403).json({ error: 'Corretor não autorizado' });

    var db = admin.firestore();
    await expireStaleReservations(db);
    var snap = await db.collection('reservations').where('brokerId', '==', broker.id).get();
    var rows = [];
    snap.forEach(function(doc) {
      rows.push(reservationPublicRow(doc.id, doc.data()));
    });
    rows.sort(function(a, b) {
      return new Date(b.requestedAt || 0) - new Date(a.requestedAt || 0);
    });
    return res.json({ ok: true, reservations: rows });
  } catch (err) {
    console.error('brokerMyReservations:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function adminReservationsMutate(req, res) {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  if (!(await verifyAdminAuth(req)).ok) return res.status(403).json({ error: 'Acesso negado' });
  try {
    var body = parseJsonBody(req);
    var action = String(body.action || 'list').trim().toLowerCase();
    var db = admin.firestore();
    var col = db.collection('reservations');

    if (action === 'list') {
      await expireStaleReservations(db);
      var snap = await col.limit(1000).get();
      var rows = [];
      snap.forEach(function(doc) {
        rows.push(reservationPublicRow(doc.id, doc.data()));
      });
      rows.sort(function(a, b) {
        return new Date(b.requestedAt || 0) - new Date(a.requestedAt || 0);
      });
      var filterStatus = String(body.status || '').trim().toLowerCase();
      var filterBroker = String(body.brokerId || '').trim();
      var filterProperty = body.propertyId != null && body.propertyId !== '' ? String(body.propertyId) : '';
      var expiringSoon = !!body.expiringSoon;
      var now = Date.now();
      var dayMs = 24 * 60 * 60 * 1000;
      rows = rows.filter(function(r) {
        if (filterStatus && r.status !== filterStatus) return false;
        if (filterBroker && String(r.brokerId) !== filterBroker) return false;
        if (filterProperty && String(r.propertyId) !== filterProperty) return false;
        if (expiringSoon) {
          if (r.status !== 'active' || !r.expiresAt) return false;
          var exp = new Date(r.expiresAt).getTime();
          if (exp <= now || exp > now + dayMs) return false;
        }
        return true;
      });
      var stats = { pending: 0, active: 0, expiringToday: 0, total: rows.length };
      snap.forEach(function(doc) {
        var d = doc.data() || {};
        var st = d.status || '';
        if (st === 'pending') stats.pending++;
        if (st === 'active') {
          stats.active++;
          var expT = d.expiresAt ? new Date(d.expiresAt).getTime() : 0;
          if (expT > now && expT <= now + dayMs) stats.expiringToday++;
        }
      });
      return res.json({ ok: true, reservations: rows, stats: stats });
    }

    if (action === 'import_batch') {
      var items = Array.isArray(body.items) ? body.items : [];
      if (!items.length) return res.status(400).json({ error: 'items obrigatório' });
      var imported = 0;
      var skipped = 0;
      var i;
      for (i = 0; i < items.length; i++) {
        var r = items[i] || {};
        var brokerEmail = String(r.brokerEmail || r.corretorEmail || '').trim().toLowerCase();
        if (!brokerEmail || /click/i.test(brokerEmail)) {
          skipped++;
          continue;
        }
        var brokerRow = await brokerAuth.findBrokerByEmail(db, brokerEmail);
        if (!brokerRow) {
          skipped++;
          continue;
        }
        var pid = r.propertyId;
        var slotResolvedImport = resolveSaleSlot(pid, r.unitCode);
        if (slotResolvedImport.error) {
          skipped++;
          continue;
        }
        var uCode = slotResolvedImport.unitCode;
        var sKey = reservationSlotKey(pid, uCode);
        var conflictImport = await findConflictingReservation(db, sKey, null);
        if (conflictImport) {
          skipped++;
          continue;
        }
        var approvedAt = isoNow();
        var expiresAt = endOfBusinessDaysFrom(new Date(), RESERVATION_BUSINESS_DAYS).toISOString();
        var unitPriceImp = null;
        var unitBedroomsImp = null;
        var rawImp = getPropertyUnitsRaw(pid);
        if (rawImp && rawImp.units && uCode) {
          var uj;
          for (uj = 0; uj < rawImp.units.length; uj++) {
            if (rawImp.units[uj].code === uCode) {
              unitPriceImp = rawImp.units[uj].price;
              unitBedroomsImp = rawImp.units[uj].bedrooms;
              break;
            }
          }
        }
        var importDoc = {
          propertyId: typeof pid === 'number' ? pid : Number(pid) || pid,
          propertyTitle: String(r.propertyTitle || '').trim(),
          unitCode: uCode || '',
          unitPrice: unitPriceImp,
          unitBedrooms: unitBedroomsImp,
          reservationSlotKey: sKey,
          brokerId: brokerRow.id,
          brokerName: brokerRow.data.name || '',
          brokerEmail: brokerEmail,
          brokerPhone: brokerRow.data.phone || '',
          client: {
            name: String(r.clientName || 'Importado do PDF').trim(),
            email: '',
            phone: '',
            cpf: '',
            notes: 'PRONTOS A VENDA',
          },
          requestedAt: approvedAt,
          createdAt: approvedAt,
          approvedAt: approvedAt,
          approvedBy: body.approvedBy || 'admin_import',
          expiresAt: expiresAt,
          status: 'active',
          source: 'pdf_import',
          updatedAt: approvedAt,
        };
        await col.add(importDoc);
        if (uCode) await applyUnitStatusOverride(db, pid, uCode, 'reservado');
        imported++;
      }
      return res.json({ ok: true, imported: imported, skipped: skipped });
    }

    var docId = String(body.reservationId || body.id || '').trim();
    if (!docId) return res.status(400).json({ error: 'reservationId obrigatório' });
    var ref = col.doc(docId);
    var docSnap = await ref.get();
    if (!docSnap.exists) return res.status(404).json({ error: 'Reserva não encontrada' });
    var existing = docSnap.data() || {};

    if (action === 'approve') {
      if (existing.status !== 'pending') {
        return res.status(400).json({ error: 'Somente reservas pendentes podem ser aprovadas.' });
      }
      var slotKeyApprove = existing.reservationSlotKey || reservationSlotKey(existing.propertyId, existing.unitCode);
      var conflictApprove = await findConflictingReservation(db, slotKeyApprove, docId);
      if (conflictApprove) {
        return res.status(409).json({ error: 'Outra reserva ativa/pendente conflita com esta unidade.' });
      }
      if (existing.unitCode) {
        var stUnit = await getEffectiveUnitStatus(db, existing.propertyId, existing.unitCode);
        if (stUnit !== 'disponivel') {
          return res.status(409).json({ error: 'Unidade não está disponível (' + stUnit + ').' });
        }
      }
      var approvedAt = isoNow();
      var expiresApprove = endOfBusinessDaysFrom(new Date(), RESERVATION_BUSINESS_DAYS).toISOString();
      var patchApprove = {
        status: 'active',
        approvedAt: approvedAt,
        approvedBy: body.approvedBy || 'admin',
        expiresAt: expiresApprove,
        updatedAt: approvedAt,
      };
      await ref.set(patchApprove, { merge: true });
      await syncUnitForReservation(db, existing, 'reservado');
      var merged = Object.assign({}, existing, patchApprove);
      if (existing.brokerEmail) {
        fcmPush.notifyUserEmail(
          db,
          existing.brokerEmail,
          'Reserva aprovada',
          (existing.propertyTitle || 'Imóvel') + (existing.unitCode ? ' · ' + existing.unitCode : ''),
          { type: 'reservation_approved', reservationId: docId },
          'https://bfmarquesempreendimentos.github.io/bfm/'
        ).catch(function() {});
      }
      return res.json({ ok: true, reservation: reservationPublicRow(docId, merged) });
    }

    if (action === 'reject') {
      if (existing.status !== 'pending') {
        return res.status(400).json({ error: 'Somente reservas pendentes podem ser rejeitadas.' });
      }
      var rejectedAt = isoNow();
      await ref.set({
        status: 'rejected',
        rejectedAt: rejectedAt,
        rejectionReason: String(body.reason || '').trim(),
        rejectedBy: body.rejectedBy || 'admin',
        updatedAt: rejectedAt,
      }, { merge: true });
      return res.json({ ok: true, id: docId, status: 'rejected' });
    }

    if (action === 'cancel') {
      if (existing.status !== 'active' && existing.status !== 'pending') {
        return res.status(400).json({ error: 'Esta reserva não pode ser cancelada.' });
      }
      var cancelledAt = isoNow();
      await ref.set({
        status: 'cancelled',
        cancelledAt: cancelledAt,
        cancelledBy: body.cancelledBy || 'admin',
        updatedAt: cancelledAt,
      }, { merge: true });
      if (existing.status === 'active' && existing.unitCode) {
        await syncUnitForReservation(db, existing, 'disponivel');
      }
      return res.json({ ok: true, id: docId, status: 'cancelled' });
    }

    if (action === 'extend') {
      if (existing.status !== 'active') {
        return res.status(400).json({ error: 'Somente reservas ativas podem ser prorrogadas.' });
      }
      var baseDate = existing.expiresAt ? new Date(existing.expiresAt) : new Date();
      var newExpires = endOfBusinessDaysFrom(baseDate, RESERVATION_BUSINESS_DAYS).toISOString();
      await ref.set({ expiresAt: newExpires, updatedAt: isoNow() }, { merge: true });
      return res.json({ ok: true, id: docId, expiresAt: newExpires });
    }

    return res.status(400).json({ error: 'Ação inválida' });
  } catch (err) {
    console.error('adminReservationsMutate:', err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  RESERVATION_BUSINESS_DAYS,
  endOfBusinessDaysFrom,
  brokerCreateReservation,
  brokerMyReservations,
  adminReservationsMutate,
};
