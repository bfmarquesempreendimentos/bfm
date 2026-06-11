'use strict';

const admin = require('firebase-admin');
const { getAdminAccount, verifyAdminFromReq } = require('./admin-accounts');

function extractIdToken(req) {
  if (!req) return null;
  var authHeader = req.headers && req.headers.authorization;
  if (authHeader && authHeader.indexOf('Bearer ') === 0) {
    return authHeader.split('Bearer ')[1];
  }
  var body = req.body || {};
  if (body.idToken) return String(body.idToken);
  if (req.query && req.query.idToken) return String(req.query.idToken);
  return null;
}

/** Aceita Bearer/idToken (preferido) ou credenciais legadas adminEmail/adminPassword (transição). */
async function verifyAdminAuth(req) {
  try {
    var token = extractIdToken(req);
    if (token) {
      try {
        var decoded = await admin.auth().verifyIdToken(token);
        var email = String(decoded.email || '').trim().toLowerCase();
        var acc = getAdminAccount(email);
        if (acc) {
          return { ok: true, email: email, role: acc.role || 'comercial', via: 'token' };
        }
        return { ok: false, error: 'not_admin' };
      } catch (e) {
        return { ok: false, error: 'invalid_token' };
      }
    }
    if (verifyAdminFromReq(req)) {
      var body = req.body || {};
      var q = req.query || {};
      var legacyEmail = String(body.adminEmail || q.adminEmail || '').trim().toLowerCase();
      var accLegacy = getAdminAccount(legacyEmail);
      return {
        ok: true,
        email: legacyEmail,
        role: accLegacy ? (accLegacy.role || 'comercial') : null,
        via: 'legacy',
      };
    }
    return { ok: false, error: 'unauthorized' };
  } catch (err) {
    console.error('verifyAdminAuth:', err);
    return { ok: false, error: 'auth_error' };
  }
}

module.exports = {
  extractIdToken,
  verifyAdminAuth,
};
