'use strict';

const crypto = require('crypto');
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { verifyAdminAuth } = require('./admin-auth');
const { extractLaudoFromPdf } = require('./laudo-extract');
const { nextDocFileName } = require('./doc-revision-name');

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

async function firebaseMediaUrl(file) {
  var meta = await file.getMetadata();
  var data = Array.isArray(meta) ? meta[0] : meta;
  var custom = (data && data.metadata) || {};
  var token = custom.firebaseStorageDownloadTokens
    ? String(custom.firebaseStorageDownloadTokens).split(',')[0].trim()
    : '';
  if (!token) {
    token = crypto.randomUUID();
    custom.firebaseStorageDownloadTokens = token;
    await file.setMetadata({ metadata: custom });
  }
  var bucketName = file.bucket.name;
  var encoded = encodeURIComponent(file.name);
  return 'https://firebasestorage.googleapis.com/v0/b/' + bucketName + '/o/' + encoded +
    '?alt=media&token=' + encodeURIComponent(token);
}

const MAX_EMAIL_BODY = 120000;
const MAX_SUBJECT = 500;
const TRACK_MAX_UA = 400;
const rateBuckets = {};

function allowCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Upload-Folder, X-Upload-FileName, X-Parse-Kind');
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

var ALLOWED_STORAGE_PREFIXES = [
  'sale-contracts/',
  'engineering-reports/',
  'property-dossiers/',
  'repair-attachments/',
  'repair-response-attachments/',
  'boleto-receipts/',
];

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

function parseJsonBody(req) {
  var body = req && req.body;
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch (e) { return {}; }
  }
  if (body && typeof Buffer !== 'undefined' && Buffer.isBuffer(body)) {
    try { return JSON.parse(body.toString('utf8')); } catch (e) { return {}; }
  }
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    if (Object.keys(body).length) return body;
  }
  var raw = req && req.rawBody;
  if (raw) {
    try {
      return JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw));
    } catch (e2) {}
  }
  return {};
}

function looksLikeStorageObject(value) {
  var s = String(value || '').trim();
  if (!s || s === '/' || s.indexOf('..') >= 0) return false;
  if (s.charAt(0) === '/' && s.indexOf('/') === s.lastIndexOf('/')) return false;
  return s.indexOf('/') >= 0 || /^https?:\/\//i.test(s) || /^gs:\/\//i.test(s);
}

function normalizeStorageObjectPath(raw) {
  raw = String(raw || '').trim();
  if (!raw) return '';
  try {
    if (/^https?:\/\//i.test(raw)) {
      var u = new URL(raw);
      var pathname = u.pathname || '';
      var oIdx = pathname.indexOf('/o/');
      if (oIdx >= 0) {
        raw = decodeURIComponent(pathname.slice(oIdx + 3));
      } else if (/(firebasestorage|storage\.googleapis)/i.test(u.hostname)) {
        raw = decodeURIComponent(pathname.replace(/^\/+/, '').replace(/^[^/]+\//, ''));
      }
    }
  } catch (e) {}
  raw = raw.replace(/^gs:\/\/[^/]+\//, '');
  try { raw = decodeURIComponent(raw); } catch (e2) {}
  raw = raw.replace(/^\/+/, '');
  var q = raw.indexOf('?');
  if (q >= 0) raw = raw.slice(0, q);
  return raw;
}

function resolveStorageObjectPath(body, req) {
  var candidates = [];
  function push(v) {
    if (looksLikeStorageObject(v)) candidates.push(String(v).trim());
  }
  if (req && req.query) {
    push(req.query.storagePath);
    push(req.query.filePath);
    push(req.query.objectPath);
    push(req.query.p);
  }
  if (body && typeof body === 'object') {
    push(body.storagePath);
    push(body.filePath);
    push(body.objectPath);
    push(body.url);
    push(body.path);
  }
  var i;
  var normalized;
  for (i = 0; i < candidates.length; i++) {
    normalized = normalizeStorageObjectPath(candidates[i]);
    if (normalized && isAllowedStorageReadPath(normalized)) return normalized;
    if (normalized) return normalized;
  }
  return '';
}

function isAllowedStorageReadPath(path) {
  var p = String(path || '');
  var i;
  for (i = 0; i < ALLOWED_STORAGE_PREFIXES.length; i++) {
    if (p.indexOf(ALLOWED_STORAGE_PREFIXES[i]) === 0) return true;
  }
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

function headerValue(req, name) {
  if (req && typeof req.get === 'function') {
    try {
      var fromGet = req.get(name);
      if (fromGet) return String(fromGet);
    } catch (e) {}
  }
  var h = (req && req.headers) || {};
  var key = String(name || '').toLowerCase();
  return String(h[key] || h[name] || '');
}

function requestContentType(req) {
  return headerValue(req, 'content-type').split(';')[0].trim().toLowerCase();
}

function uploadBufferFromRequest(req, body) {
  var ct = requestContentType(req);
  var isJson = ct.indexOf('application/json') >= 0 || ct.indexOf('text/') >= 0;
  if (!isJson) {
    if (req.rawBody && req.rawBody.length > 16) {
      return Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.rawBody);
    }
    if (req.body && Buffer.isBuffer(req.body) && req.body.length > 16) {
      return req.body;
    }
  }
  if (body && body.contentBase64) {
    try {
      return Buffer.from(String(body.contentBase64), 'base64');
    } catch (e) {
      return null;
    }
  }
  return null;
}

async function saveUploadBuffer(folder, fileName, contentType, buf) {
  var path = folder + '/' + fileName;
  var token = crypto.randomUUID();
  var bucketName = STORAGE_BUCKETS[0];
  var file = admin.storage().bucket(bucketName).file(path);
  var type = contentType && (contentType.indexOf('application/') === 0 || contentType.indexOf('image/') === 0)
    ? contentType.substring(0, 120)
    : 'application/pdf';
  await file.save(buf, {
    resumable: false,
    metadata: {
      contentType: type,
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });
  var url = await firebaseMediaUrl(file);
  return { path: path, url: url };
}

/** POST — grava arquivo no Storage (laudo/RGI) ou devolve URL assinada (anexos). */
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
    var body = parseJsonBody(req);
    var q = req.query || {};
    var folder = String(q.folder || headerValue(req, 'x-upload-folder') || body.folder || 'repair-attachments').replace(/^\/+|\/+$/g, '');
    var fileName = sanitizeFileName(q.fileName || headerValue(req, 'x-upload-filename') || body.fileName || 'file');
    var docKind = String(q.docKind || body.docKind || '').trim().toLowerCase();
    if (docKind === 'laudo' || docKind === 'rgi' || docKind === 'onus') {
      var kind = docKind === 'onus' ? 'rgi' : docKind;
      fileName = nextDocFileName(kind, body.existingNames || []);
      var pid = String(q.propertyId || body.propertyId || '').replace(/[^a-zA-Z0-9_-]/g, '');
      var unit = String(q.unitCode || body.unitCode || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 80);
      if (pid && unit) {
        folder = kind === 'laudo'
          ? ('engineering-reports/' + pid + '/' + unit)
          : (folder || ('property-dossiers/' + pid + '/unidades'));
      }
    }
    if (!isAllowedUploadFolder(folder, isAdmin)) {
      return res.status(403).json({ error: 'Pasta não permitida' });
    }
    var contentType = String(q.contentType || body.contentType || headerValue(req, 'x-upload-content-type') || '').substring(0, 120);
    if (!contentType || contentType.indexOf('json') >= 0 || contentType.indexOf('octet-stream') >= 0) {
      contentType = 'application/pdf';
    }
    var parseKind = String(q.parseKind || headerValue(req, 'x-parse-kind') || body.parseKind || '').trim().toLowerCase();
    var buf = uploadBufferFromRequest(req, body);
    console.log('prepareStorageUpload', {
      folder: folder,
      parseKind: parseKind,
      ct: requestContentType(req),
      rawLen: req.rawBody ? req.rawBody.length : 0,
      hasB64: !!(body && body.contentBase64),
      bufLen: buf ? buf.length : 0,
    });
    if (buf) {
      if (buf.length > 10 * 1024 * 1024) return res.status(400).json({ error: 'Arquivo acima de 10MB' });
      var saved = await saveUploadBuffer(folder, fileName, contentType, buf);
      var extracted = null;
      if (parseKind === 'laudo') {
        extracted = await extractLaudoFromPdf(buf);
      }
      return res.json({
        ok: true,
        path: saved.path,
        url: saved.url,
        name: fileName,
        extracted: extracted || undefined,
      });
    }
    if (folder.indexOf('engineering-reports') === 0 || folder.indexOf('property-dossiers') === 0) {
      return res.status(400).json({
        error: 'Arquivo não chegou ao servidor. Escolha o PDF de novo.',
      });
    }

    var size = Number(body.size) || 0;
    if (size > 10 * 1024 * 1024) return res.status(400).json({ error: 'Arquivo acima de 10MB' });

    var path = folder + '/' + Date.now() + '-' + fileName;
    var bucket = admin.storage().bucket(STORAGE_BUCKETS[0]);
    var file = bucket.file(path);

    var uploadUrl = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000,
      contentType: contentType,
    });

    return res.json({
      ok: true,
      path: path,
      uploadUrl: uploadUrl[0],
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
    var body = parseJsonBody(req);
    var path = resolveStorageObjectPath(body, req);
    if (!path || path.indexOf('..') >= 0) {
      console.warn('getStorageReadUrl sem caminho', {
        query: req.query || {},
        bodyKeys: body ? Object.keys(body) : [],
      });
      return res.status(400).json({ error: 'Caminho do arquivo inválido' });
    }
    if (!isAllowedStorageReadPath(path)) {
      console.warn('getStorageReadUrl pasta recusada:', path);
      return res.status(403).json({
        error: 'Arquivo fora das pastas do cadastro',
        hint: 'O admin só abre property-dossiers/ ou engineering-reports/.',
      });
    }
    var file = await findStorageFile(path);
    if (!file) return res.status(404).json({ error: 'Arquivo não encontrado no Storage' });
    var mode = String((req.query && req.query.mode) || body.mode || '').trim().toLowerCase();
    if (mode === 'file') {
      var meta = await file.getMetadata();
      var data = Array.isArray(meta) ? meta[0] : meta;
      var downloadName = path.split('/').pop() || 'documento.pdf';
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Content-Type', (data && data.contentType) || 'application/pdf');
      res.set('Content-Disposition', 'inline; filename="' + downloadName.replace(/"/g, '') + '"');
      file.createReadStream()
        .on('error', function(streamErr) {
          console.error('getStorageReadUrl stream:', streamErr);
          if (!res.headersSent) res.status(500).json({ error: streamErr.message });
        })
        .pipe(res);
      return;
    }
    var readUrl = await firebaseMediaUrl(file);
    return res.json({ ok: true, url: readUrl, path: path });
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
