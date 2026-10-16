'use strict';

var admin = require('firebase-admin');
var { verifyAdminAuth } = require('./admin-auth');
var {
  uploadMediaBuffer,
  sendMediaById,
  extractMetaError,
  listWabaPhoneNumbers,
} = require('./chatbot/whatsapp-api');

var BRUNO_PERSONAL_HINT = '995557010';

function allowCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function normalizeBrazilWhatsApp(phone) {
  var digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  while (digits.charAt(0) === '0') digits = digits.substring(1);
  if (digits.indexOf('5555') === 0) digits = digits.substring(2);
  var national = digits;
  if (digits.indexOf('55') === 0 && digits.length > 2) national = digits.substring(2);
  if (national.length === 10) national = national.substring(0, 2) + '9' + national.substring(2);
  if (national.length === 11) digits = '55' + national;
  else if (digits.length === 11) digits = '55' + digits;
  else return null;
  if (digits.length === 12 || digits.length === 13) return digits;
  if (digits.length > 13) return digits.substring(0, 13);
  return null;
}

function pickPersonalPhoneId(phones, campaignId, hintDigits) {
  var i;
  var p;
  var hint = String(hintDigits || BRUNO_PERSONAL_HINT).replace(/\D/g, '');
  if (hint.length >= 8) {
    for (i = 0; i < (phones || []).length; i++) {
      p = phones[i] || {};
      var disp = String(p.display_phone_number || '').replace(/\D/g, '');
      if (disp && disp.indexOf(hint.slice(-8)) >= 0) return String(p.id || '');
    }
  }
  for (i = 0; i < (phones || []).length; i++) {
    p = phones[i] || {};
    var pid = String(p.id || '');
    if (pid && pid !== String(campaignId || '')) return pid;
  }
  return '';
}

async function resolveSendPhoneNumberId(db, channel) {
  var snap = await db.collection('settings').doc('whatsapp').get();
  var s = snap.exists ? (snap.data() || {}) : {};
  var campaignId = String(s.phoneNumberId || s.lastWebhookPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  if (channel !== 'personal') {
    return { phoneNumberId: campaignId, channel: 'campaign', fallback: false };
  }
  if (s.personalPhoneNumberId) {
    return { phoneNumberId: String(s.personalPhoneNumberId).trim(), channel: 'personal', fallback: false };
  }
  var wabaId = String(s.wabaId || '').trim();
  var token = process.env.WHATSAPP_TOKEN;
  var phones = [];
  if (wabaId && token) {
    phones = await listWabaPhoneNumbers(token, wabaId);
  }
  var personalId = pickPersonalPhoneId(phones, campaignId, BRUNO_PERSONAL_HINT);
  if (personalId) {
    db.collection('settings').doc('whatsapp').set({
      personalPhoneNumberId: personalId,
      updatedAt: new Date().toISOString(),
    }, { merge: true }).catch(function() {});
    return { phoneNumberId: personalId, channel: 'personal', fallback: false };
  }
  return { phoneNumberId: campaignId, channel: 'campaign', fallback: true };
}

async function sendBrokerReservationReportsHttp(req, res) {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  if (!(await verifyAdminAuth(req)).ok) return res.status(403).json({ error: 'Acesso negado' });
  try {
    var body = req.body || {};
    var phone = normalizeBrazilWhatsApp(body.phone);
    if (!phone) return res.status(400).json({ error: 'WhatsApp do responsável inválido' });
    var b64 = String(body.xlsxBase64 || '').replace(/\s/g, '');
    if (!b64) return res.status(400).json({ error: 'Arquivo Excel ausente' });
    var filename = String(body.filename || 'Reservas.xlsx').replace(/[^\w.\-]+/g, '_');
    if (filename.indexOf('.xlsx') < 0) filename += '.xlsx';
    var caption = String(body.caption || '').slice(0, 1000);
    var buf = Buffer.from(b64, 'base64');
    if (!buf.length || buf.length > 6 * 1024 * 1024) {
      return res.status(400).json({ error: 'Arquivo inválido ou grande demais' });
    }
    var db = admin.firestore();
    var resolved = await resolveSendPhoneNumberId(db, body.channel === 'personal' ? 'personal' : 'campaign');
    if (!resolved.phoneNumberId) {
      return res.status(400).json({ error: 'Número WhatsApp de envio não configurado' });
    }
    var uploaded = await uploadMediaBuffer(
      buf,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename,
      { phoneNumberId: resolved.phoneNumberId }
    );
    await sendMediaById(phone, 'document', uploaded.id, {
      filename: filename,
      caption: caption,
      phoneNumberId: resolved.phoneNumberId,
    });
    return res.json({
      ok: true,
      to: phone,
      filename: filename,
      channel: resolved.channel,
      fallbackToCampaign: !!resolved.fallback,
    });
  } catch (err) {
    console.error('adminBrokerReservationReportSend:', err);
    return res.status(500).json({
      error: extractMetaError(err) || err.message || 'Falha no envio. Use “eu envio” e mande o arquivo na conversa.',
      ok: false,
    });
  }
}

module.exports = {
  sendBrokerReservationReportsHttp,
};
