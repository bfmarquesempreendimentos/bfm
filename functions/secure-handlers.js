'use strict';

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { verifyAdminAuth } = require('./admin-auth');

const COMPANY_EMAIL = 'bfmarquesempreendimentos@gmail.com';
var STORAGE_BUCKETS = [
  'site-interativo-b-f-marques.firebasestorage.app',
  'site-interativo-b-f-marques.appspot.com',
];

async function findStorageFile(path) {
  var i;
  var file;
  var exists;
  for (i = 0; i < STORAGE_BUCKETS.length; i++) {
    file = admin.storage().bucket(STORAGE_BUCKETS[i]).file(path);
    exists = await file.exists();
    if (exists[0]) return file;
  }
  file = admin.storage().bucket().file(path);
  exists = await file.exists();
  return exists[0] ? file : null;
}
const MAX_EMAIL_BODY = 120000;
const MAX_SUBJECT = 500;
const TRACK_MAX_UA = 400;
const rateBuckets = {};

function allowCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function clientIp(req) {
  var fwd = '';
  if (req.headers) fwd = String(req.headers['x-forwarded-for'] || req.headers['x-appengine-user-ip'] || '');
  return (fwd.split(',')[0] || req.ip || 'unknown').trim().substring(0, 80);
}

function rateLimit(key, max, windowMs) {
  var now = Date.now();
  var b = rateBuckets[key];
  if (!b || now - b.start > windowMs) {
    rateBuckets[key] = { start: now, n: 1 };
    return true;
  }
  b.n += 1;
  return b.n <= max;
}

function extractBearerToken(req) {
  var authHeader = req.headers && req.headers.authorization;
  if (authHeader && authHeader.indexOf('Bearer ') === 0) {
    return authHeader.split('Bearer ')[1];
  }
  var body = req.body || {};
  if (body.idToken) return String(body.idToken);
  if (req.query && req.query.idToken) return String(req.query.idToken);
  return null;
}

async function verifyAnyFirebaseToken(req) {
  var token = extractBearerToken(req);
  if (!token) return { ok: false };
  try {
    var decoded = await admin.auth().verifyIdToken(token);
    return { ok: true, decoded: decoded, email: String(decoded.email || '').trim().toLowerCase() };
  } catch (e) {
    return { ok: false };
  }
}

function sanitizeFileName(name) {
  return String(name || 'file')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .substring(0, 120);
}

function isAllowedUploadFolder(folder, isAdmin) {
  var f = String(folder || '').replace(/^\/+|\/+$/g, '');
  if (f === 'sale-contracts' || f.indexOf('sale-contracts/') === 0) return isAdmin;
  if (f === 'engineering-reports' || f.indexOf('engineering-reports/') === 0) return isAdmin;
  if (f === 'property-dossiers' || f.indexOf('property-dossiers/') === 0) return isAdmin;
  if (f === 'repair-attachments' || f.indexOf('repair-attachments/') === 0) return true;
  if (f.indexOf('repair-response-attachments/') === 0) return true;
  if (f === 'boleto-receipts' || f.indexOf('boleto-receipts/') === 0) return true;
  return false;
}

async function queueEmailDoc(db, payload) {
  await db.collection('emailQueue').add(Object.assign({}, payload, {
    createdAt: new Date().toISOString(),
    status: 'queued',
  }));
}

/** POST — fila de e-mail sem expor Firestore ao browser. */
async function queueEmailHttp(req, res) {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  if (!rateLimit('email:' + clientIp(req), 20, 60000)) {
    return res.status(429).json({ error: 'Muitas tentativas. Aguarde um minuto.' });
  }
  try {
    var body = req.body || {};
    var type = String(body.type || 'generic').trim();
    var db = admin.firestore();

    if (type === 'contact') {
      var name = String(body.name || '').trim().substring(0, 200);
      var fromEmail = String(body.email || '').trim().toLowerCase().substring(0, 200);
      var phone = String(body.phone || '').trim().substring(0, 80);
      var subjectLine = String(body.subject || 'Contato').trim().substring(0, MAX_SUBJECT);
      var message = String(body.message || '').trim().substring(0, 8000);
      if (!name || !fromEmail || !message || fromEmail.indexOf('@') < 1) {
        return res.status(400).json({ error: 'Dados de contato incompletos' });
      }
      var htmlCompany =
        '<h2>Nova Mensagem do Site</h2><p><strong>Nome:</strong> ' + escapeHtml(name) + '</p>' +
        '<p><strong>Email:</strong> ' + escapeHtml(fromEmail) + '</p>' +
        '<p><strong>Telefone:</strong> ' + escapeHtml(phone || 'Não informado') + '</p>' +
        '<p><strong>Assunto:</strong> ' + escapeHtml(subjectLine) + '</p>' +
        '<p><strong>Mensagem:</strong></p><p>' + escapeHtml(message).replace(/\n/g, '<br>') + '</p>';
      await queueEmailDoc(db, {
        to: COMPANY_EMAIL,
        subject: 'Nova Mensagem do Site - ' + subjectLine,
        body: htmlCompany,
        type: 'contact_inbound',
      });
      await queueEmailDoc(db, {
        to: fromEmail,
        subject: 'Mensagem Recebida - B F Marques',
        body:
          '<p>Olá ' + escapeHtml(name) + ',</p><p>Recebemos sua mensagem e entraremos em contato em breve.</p>' +
          '<p>Atenciosamente,<br><strong>B F Marques Empreendimentos</strong></p>',
        type: 'contact_confirmation',
      });
      return res.json({ ok: true });
    }

    var auth = await verifyAnyFirebaseToken(req);
    var adminAuth = await verifyAdminAuth(req);
    var isAdmin = adminAuth.ok;
    var userEmail = auth.ok ? auth.email : (adminAuth.ok ? adminAuth.email : '');

    if (!isAdmin && !auth.ok) {
      return res.status(401).json({ error: 'Autenticação necessária' });
    }

    var to = String(body.to || '').trim().toLowerCase();
    var subject = String(body.subject || '').trim().substring(0, MAX_SUBJECT);
    var html = String(body.body || body.html || '').substring(0, MAX_EMAIL_BODY);
    if (!to || !subject || !html) return res.status(400).json({ error: 'to, subject e body obrigatórios' });

    if (!isAdmin) {
      if (to !== COMPANY_EMAIL && to !== userEmail) {
        return res.status(403).json({ error: 'Destinatário não permitido' });
      }
    }

    await queueEmailDoc(db, {
      to: to,
      subject: subject,
      body: html,
      type: String(body.queueType || type || 'client'),
      whatsappPhone: body.whatsappPhone || null,
      whatsappMessage: body.whatsappMessage || null,
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('queueEmailHttp:', err);
    return res.status(500).json({ error: err.message });
  }
}

/** POST — visitas do site (substitui write direto no Firestore). */
async function trackSiteVisitHttp(req, res) {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  if (!rateLimit('visit:' + clientIp(req), 40, 60000)) {
    return res.status(429).json({ error: 'rate_limited' });
  }
  try {
    var body = req.body || {};
    var page = String(body.page || '').substring(0, 120);
    if (!page) return res.status(400).json({ error: 'page obrigatório' });
    var data = {
      visitorId: String(body.visitorId || '').substring(0, 80),
      sessionId: String(body.sessionId || '').substring(0, 80),
      page: page,
      pageName: String(body.pageName || '').substring(0, 160),
      referrer: String(body.referrer || '').substring(0, 500),
      userAgent: String(body.userAgent || '').substring(0, TRACK_MAX_UA),
      device: String(body.device || '').substring(0, 40),
      browser: String(body.browser || '').substring(0, 40),
      os: String(body.os || '').substring(0, 40),
      screenWidth: Number(body.screenWidth) || 0,
      screenHeight: Number(body.screenHeight) || 0,
      language: String(body.language || '').substring(0, 20),
      utmSource: String(body.utmSource || '').substring(0, 120),
      utmMedium: String(body.utmMedium || '').substring(0, 120),
      utmCampaign: String(body.utmCampaign || '').substring(0, 120),
      clientTimestamp: body.clientTimestamp || new Date().toISOString(),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    };
    await admin.firestore().collection('site_visits').add(data);
    return res.json({ ok: true });
  } catch (err) {
    console.error('trackSiteVisitHttp:', err);
    return res.status(500).json({ error: err.message });
  }
}

/** GET — analytics admin (substitui read público de site_visits). */
async function adminSiteVisitsHttp(req, res) {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
  if (!(await verifyAdminAuth(req)).ok) return res.status(403).json({ error: 'Acesso negado' });
  try {
    var days = Math.min(90, Math.max(1, parseInt(req.query.days || '30', 10) || 30));
    var since = new Date();
    since.setDate(since.getDate() - days);
    var snap = await admin.firestore().collection('site_visits')
      .where('clientTimestamp', '>=', since.toISOString())
      .orderBy('clientTimestamp', 'desc')
      .limit(5000)
      .get();
    var visits = snap.docs.map(function(doc) {
      return Object.assign({ id: doc.id }, doc.data());
    });
    return res.json({ visits: visits });
  } catch (err) {
    console.error('adminSiteVisitsHttp:', err);
    return res.status(500).json({ error: err.message });
  }
}

/** POST — URL assinada para upload (contratos admin; anexos autenticados). */
async function prepareStorageUploadHttp(req, res) {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    var adminAuth = await verifyAdminAuth(req);
    var userAuth = await verifyAnyFirebaseToken(req);
    var isAdmin = adminAuth.ok;
    if (!isAdmin && !userAuth.ok) {
      return res.status(401).json({ error: 'Autenticação necessária' });
    }
    var body = req.body || {};
    var folder = String(body.folder || 'repair-attachments').replace(/^\/+|\/+$/g, '');
    if (!isAllowedUploadFolder(folder, isAdmin)) {
      return res.status(403).json({ error: 'Pasta não permitida' });
    }
    var fileName = sanitizeFileName(body.fileName || 'file');
    var contentType = String(body.contentType || 'application/octet-stream').substring(0, 120);
    var size = Number(body.size) || 0;
    if (size > 10 * 1024 * 1024) return res.status(400).json({ error: 'Arquivo acima de 10MB' });

    var path = folder + '/' + Date.now() + '-' + fileName;
    var bucket = admin.storage().bucket();
    var file = bucket.file(path);

    var uploadUrl = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000,
      contentType: contentType,
    });

    var readUrl = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      ok: true,
      path: path,
      uploadUrl: uploadUrl[0],
      url: readUrl[0],
    });
  } catch (err) {
    console.error('prepareStorageUploadHttp:', err);
    return res.status(500).json({ error: err.message });
  }
}

/** POST — leitura temporária de arquivo já existente (admin; não apaga nada). */
async function getStorageReadUrlHttp(req, res) {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  if (!(await verifyAdminAuth(req)).ok) return res.status(403).json({ error: 'Acesso negado' });
  try {
    var body = req.body || {};
    var path = String(body.path || body.storagePath || '').replace(/^\/+/, '');
    path = path.replace(/^gs:\/\/[^/]+\//, '');
    if (!path || path.indexOf('..') >= 0) return res.status(400).json({ error: 'path inválido' });
    var allowed =
      path.indexOf('sale-contracts/') === 0 ||
      path.indexOf('engineering-reports/') === 0 ||
      path.indexOf('property-dossiers/') === 0 ||
      path.indexOf('repair-attachments/') === 0 ||
      path.indexOf('repair-response-attachments/') === 0 ||
      path.indexOf('boleto-receipts/') === 0;
    if (!allowed) {
      return res.status(403).json({
        error: 'Pasta não permitida',
        hint: 'Use o arquivo do cadastro (property-dossiers/… ou engineering-reports/…).',
      });
    }
    var file = await findStorageFile(path);
    if (!file) return res.status(404).json({ error: 'Arquivo não encontrado' });
    var readUrl = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000,
    });
    return res.json({ ok: true, url: readUrl[0] });
  } catch (err) {
    console.error('getStorageReadUrlHttp:', err);
    return res.status(500).json({ error: err.message });
  }
}

/** POST — auditoria de e-mail (substitui create direto no Firestore). */
async function logEmailAuditHttp(req, res) {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  var auth = await verifyAnyFirebaseToken(req);
  var adminAuth = await verifyAdminAuth(req);
  if (!auth.ok && !adminAuth.ok) return res.status(401).json({ error: 'Autenticação necessária' });
  try {
    var body = req.body || {};
    var entry = {
      to: String(body.to || '').substring(0, 200),
      subject: String(body.subject || '').substring(0, MAX_SUBJECT),
      status: String(body.status || 'logged').substring(0, 40),
      sentAt: body.sentAt || new Date().toISOString(),
      loggedAt: new Date().toISOString(),
    };
    await admin.firestore().collection('emailAuditLog').add(entry);
    return res.json({ ok: true });
  } catch (err) {
    console.error('logEmailAuditHttp:', err);
    return res.status(500).json({ error: err.message });
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  queueEmailHttp,
  trackSiteVisitHttp,
  adminSiteVisitsHttp,
  prepareStorageUploadHttp,
  getStorageReadUrlHttp,
  logEmailAuditHttp,
  COMPANY_EMAIL,
};
