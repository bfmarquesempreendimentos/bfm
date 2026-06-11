'use strict';

var admin = require('firebase-admin');
var { ADMIN_ACCOUNTS } = require('./admin-accounts');
var { verifyAdminAuth, extractIdToken } = require('./admin-auth');
var brokerAuth = require('./broker-auth');

function allowCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return {};
}

function tokenDocId(token) {
  var crypto = require('crypto');
  return crypto.createHash('sha256').update(String(token)).digest('hex').slice(0, 40);
}

async function saveFcmToken(db, opts) {
  var token = String((opts && opts.token) || '').trim();
  if (!token) return null;
  var email = String((opts && opts.email) || '').trim().toLowerCase();
  var uid = String((opts && opts.uid) || '').trim();
  var role = String((opts && opts.role) || 'client').trim().toLowerCase();
  var ref = db.collection('fcm_tokens').doc(tokenDocId(token));
  await ref.set({
    token: token,
    email: email,
    uid: uid,
    role: role,
    platform: String((opts && opts.platform) || 'web'),
    updatedAt: new Date().toISOString(),
  }, { merge: true });
  return ref.id;
}

async function collectTokensForEmails(db, emails) {
  var wanted = {};
  var i;
  for (i = 0; i < emails.length; i++) {
    wanted[String(emails[i] || '').trim().toLowerCase()] = true;
  }
  var snap = await db.collection('fcm_tokens').get();
  var tokens = [];
  snap.forEach(function(doc) {
    var d = doc.data() || {};
    if (!d.token) return;
    if (wanted[d.email]) tokens.push(d.token);
  });
  return tokens;
}

async function getAdminFcmTokens(db) {
  var emails = ADMIN_ACCOUNTS.map(function(a) { return a.email; });
  return collectTokensForEmails(db, emails);
}

async function sendPushToTokens(tokens, payload) {
  if (!tokens || !tokens.length) return { sent: 0, failed: 0 };
  var unique = [];
  var i;
  for (i = 0; i < tokens.length; i++) {
    if (unique.indexOf(tokens[i]) < 0) unique.push(tokens[i]);
  }
  var title = String((payload && payload.title) || 'B F Marques').slice(0, 120);
  var body = String((payload && payload.body) || '').slice(0, 240);
  var data = (payload && payload.data) || {};
  var dataOut = {};
  var k;
  for (k in data) {
    if (Object.prototype.hasOwnProperty.call(data, k)) dataOut[k] = String(data[k]);
  }
  var sent = 0;
  var failed = 0;
  for (i = 0; i < unique.length; i++) {
    try {
      await admin.messaging().send({
        token: unique[i],
        notification: { title: title, body: body },
        data: dataOut,
        webpush: {
          fcmOptions: { link: payload.link || 'https://bfmarquesempreendimentos.github.io/bfm/admin.html' },
        },
      });
      sent++;
    } catch (err) {
      failed++;
      console.warn('FCM send:', err.message || err);
    }
  }
  return { sent: sent, failed: failed };
}

async function notifyAdmins(db, title, body, data, link) {
  var tokens = await getAdminFcmTokens(db);
  return sendPushToTokens(tokens, { title: title, body: body, data: data, link: link });
}

async function notifyUserEmail(db, email, title, body, data, link) {
  var tokens = await collectTokensForEmails(db, [email]);
  return sendPushToTokens(tokens, { title: title, body: body, data: data, link: link });
}

async function registerFcmToken(req, res) {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    var body = parseJsonBody(req);
    var token = String(body.token || '').trim();
    if (!token) return res.status(400).json({ error: 'token obrigatório' });

    var email = '';
    var uid = '';
    var role = String(body.role || '').trim().toLowerCase();
    var db = admin.firestore();

    if ((await verifyAdminAuth(req)).ok) {
      var adminTok = extractIdToken(req);
      if (adminTok) {
        try {
          var decodedAdmin = await admin.auth().verifyIdToken(adminTok);
          email = String(decodedAdmin.email || '').trim().toLowerCase();
          uid = decodedAdmin.uid || '';
        } catch (eAdmin) { /* ignore */ }
      }
      if (!email && body.adminEmail) email = String(body.adminEmail).trim().toLowerCase();
      role = 'admin';
    } else {
      var idToken = extractIdToken(req);
      if (!idToken) return res.status(401).json({ error: 'Autenticação necessária' });
      var decoded = await admin.auth().verifyIdToken(idToken);
      email = String(decoded.email || '').trim().toLowerCase();
      uid = decoded.uid || '';
      if (!role || role === 'client') {
        var broker = await brokerAuth.getBrokerFromIdToken(idToken);
        role = broker ? 'broker' : 'client';
      }
    }

    await saveFcmToken(db, { token: token, email: email, uid: uid, role: role, platform: body.platform || 'web' });
    return res.json({ ok: true, role: role });
  } catch (err) {
    console.error('registerFcmToken:', err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  allowCors,
  saveFcmToken,
  notifyAdmins,
  notifyUserEmail,
  sendPushToTokens,
  registerFcmToken,
};
