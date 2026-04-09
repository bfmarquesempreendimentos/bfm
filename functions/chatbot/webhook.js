const crypto = require('crypto');
const { handleIncomingMessage } = require('./ai-agent');
const { markAsRead } = require('./whatsapp-api');
const { normalizeWhatsAppPhone } = require('./lead-manager');

function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('Webhook verificado com sucesso');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
}

async function processWebhook(req, res) {
  const body = req.body || {};

  // Log para diagnóstico (respondo e nada acontece)
  console.log('[Webhook] POST recebido. object=', body.object, 'entry_count=', (body.entry || []).length);

  if (body.object !== 'whatsapp_business_account') {
    console.log('[Webhook] Ignorando: object não é whatsapp_business_account');
    return res.sendStatus(200);
  }

  const messagesToProcess = [];
  const entries = body.entry || [];
  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      console.log('[Webhook] change.field=', change.field);
      if (change.field !== 'messages') continue;
      const value = change.value;
      if (!value || !value.messages) continue;

      const metadata = value.metadata || {};
      const contacts = value.contacts || [];

      for (const message of value.messages) {
        const from = message.from;
        const contact = contacts.find(c => c.wa_id === from);
        const profileName = contact?.profile?.name || '';
        const messageId = message.id;

        const extracted = extractMessageContent(message);
        if (!extracted) continue;

        var waId = normalizeWhatsAppPhone(from) || from;
        messagesToProcess.push({
          from: waId,
          profileName,
          messageId,
          ...extracted,
          phoneNumberId: metadata.phone_number_id,
          referral: message.referral || null,
        });
      }
    }
  }

  if (messagesToProcess.length === 0) {
    console.log('[Webhook] Nenhuma mensagem para processar (verifique se "messages" está assinado)');
    return res.sendStatus(200);
  }

  const waOptions = { phoneNumberId: messagesToProcess[0]?.phoneNumberId };
  try {
    for (const msg of messagesToProcess) {
      try { await markAsRead(msg.messageId, waOptions); } catch (_) {}
      console.log(`Processando mensagem de ${msg.from}: "${msg.text}" (phoneNumberId=${msg.phoneNumberId || 'env'})`);
      await handleIncomingMessage(msg);
    }
    return res.sendStatus(200);
  } catch (err) {
    console.error('Erro ao processar mensagem:', err);
    return res.sendStatus(200);
  }
}

/** id retornado pela Meta (string); evita gravar mensagem de áudio sem player no painel */
function pickWhatsAppMediaId(sub) {
  if (!sub || typeof sub !== 'object') return null;
  var id = sub.id != null ? sub.id : sub.media_id;
  if (id == null || id === '') return null;
  id = String(id).trim();
  if (!/^[0-9A-Za-z_.-]+$/.test(id)) return null;
  return id;
}

function extractMessageContent(message) {
  var rawType = message.type;
  var t = String(rawType || '').toLowerCase();
  if (t === 'voice') {
    t = 'audio';
  }

  switch (t) {
    case 'text': {
      var txt = message.text?.body || '';
      var r = message.referral;
      if (r && typeof r === 'object') {
        var bits = [];
        if (r.source_type) bits.push('origem:' + r.source_type);
        if (r.headline) bits.push(String(r.headline));
        if (r.source_url) bits.push(String(r.source_url));
        if (r.ctwa_clid) bits.push('anuncio');
        if (bits.length) txt = (txt ? txt + '\n' : '') + '[' + bits.join(' | ') + ']';
      }
      return { type: 'text', text: txt };
    }
    case 'interactive':
      if (message.interactive?.type === 'button_reply') {
        return { type: 'text', text: message.interactive.button_reply.title };
      }
      if (message.interactive?.type === 'list_reply') {
        return { type: 'text', text: message.interactive.list_reply.title };
      }
      return null;
    case 'location':
      return {
        type: 'location',
        text: `Localização: ${message.location?.latitude}, ${message.location?.longitude}`,
        location: message.location,
      };
    case 'image':
    case 'document':
    case 'video': {
      var subM = message[t] || message[rawType] || {};
      var idM = pickWhatsAppMediaId(subM);
      if (!idM) {
        console.warn('[Webhook] mídia tipo', rawType, 'sem id. Chaves do nó:', Object.keys(subM || {}).join(','));
      }
      return {
        type: t,
        text: subM.caption || ('[' + t + ']'),
        mediaId: idM,
        mimeType: subM.mime_type || '',
      };
    }
    case 'audio': {
      var subA = message.audio || message.voice || {};
      var idA = pickWhatsAppMediaId(subA);
      if (!idA) {
        console.warn('[Webhook] áudio sem media id. message.type=', rawType, 'chaves audio:', Object.keys(message.audio || {}).join(','), 'voice:', Object.keys(message.voice || {}).join(','));
      }
      return {
        type: 'audio',
        text: subA.caption || '[Mensagem de áudio]',
        mediaId: idA,
        mimeType: subA.mime_type || '',
      };
    }
    case 'button':
      return {
        type: 'text',
        text: (message.button && (message.button.text || message.button.payload)) || '[Resposta de botão]',
      };
    case 'unsupported':
      return { type: 'text', text: '[Mensagem em formato novo no WhatsApp — conteúdo indisponível na API]' };
    default:
      console.warn('[Webhook] message.type não tratado:', message.type);
      return { type: 'text', text: '[Tipo: ' + (message.type || '?') + ']' };
  }
}

function validateSignature(req, appSecret) {
  if (!appSecret) return true;
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret)
    .update(req.rawBody || JSON.stringify(req.body))
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

module.exports = { verifyWebhook, processWebhook, validateSignature };
