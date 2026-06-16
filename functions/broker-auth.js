'use strict';

var admin = require('firebase-admin');
var { verifyPassword, isPasswordHashed, passwordFieldsForStorage } = require('./broker-password');

/** Corretores antigos sem isActive explícito permanecem ativos (exceto pending/rejected). */
function brokerIsActive(data) {
  var d = data || {};
  if (d.isActive === true) return true;
  if (d.isActive === false) return false;
  var st = String(d.registrationStatus || '').toLowerCase();
  if (st === 'pending' || st === 'rejected') return false;
  return true;
}

function brokerPublicProfile(docId, data) {
  var d = data || {};
  return {
    id: docId,
    name: d.name || '',
    cpf: d.cpf || '',
    email: d.email || '',
    phone: d.phone || '',
    creci: d.creci || '',
    isActive: brokerIsActive(d),
    isAdmin: !!d.isAdmin,
    whatsappCampaignOptOut: !!d.whatsappCampaignOptOut,
    registrationStatus: d.registrationStatus || '',
    createdAt: d.createdAt || '',
  };
}

async function findBrokerByEmail(db, email) {
  var norm = String(email || '').trim().toLowerCase();
  if (!norm) return null;
  var snap = await db.collection('brokers').where('email', '==', norm).limit(5).get();
  if (snap.empty) return null;
  var doc = snap.docs[0];
  return { id: doc.id, ref: doc.ref, data: doc.data() || {} };
}

async function verifyBrokerCredentials(db, email, password) {
  var row = await findBrokerByEmail(db, email);
  if (!row) return { ok: false };
  var stored = row.data.passwordHash || row.data.password || '';
  if (!verifyPassword(password, stored)) return { ok: false };
  if (!brokerIsActive(row.data)) return { ok: false, inactive: true };
  return { ok: true, broker: brokerPublicProfile(row.id, row.data), ref: row.ref, data: row.data };
}

async function upgradeBrokerPasswordHash(ref, data, plainPassword) {
  if (!ref || !plainPassword) return;
  if (data.passwordHash && isPasswordHashed(data.passwordHash)) return;
  var fields = passwordFieldsForStorage(plainPassword);
  await ref.set({
    passwordHash: fields.passwordHash,
    password: '',
    passwordUpgradedAt: new Date().toISOString(),
  }, { merge: true });
}

async function ensureBrokerFirebaseUser(email, password) {
  var norm = String(email || '').trim().toLowerCase();
  try {
    await admin.auth().createUser({ email: norm, password: password, emailVerified: true });
    return { created: true, synced: false };
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      var existing = await admin.auth().getUserByEmail(norm);
      await admin.auth().updateUser(existing.uid, { password: password, emailVerified: true });
      return { created: false, synced: true };
    }
    throw err;
  }
}

async function getBrokerFromIdToken(idToken) {
  var decoded = await admin.auth().verifyIdToken(idToken);
  var email = String(decoded.email || '').trim().toLowerCase();
  if (!email) return null;
  var db = admin.firestore();
  var row = await findBrokerByEmail(db, email);
  if (!row || !brokerIsActive(row.data)) return null;
  return brokerPublicProfile(row.id, row.data);
}

module.exports = {
  brokerIsActive,
  brokerPublicProfile,
  findBrokerByEmail,
  verifyBrokerCredentials,
  upgradeBrokerPasswordHash,
  ensureBrokerFirebaseUser,
  getBrokerFromIdToken,
  passwordFieldsForStorage,
};
