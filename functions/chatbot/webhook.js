const crypto = require('crypto');
const { handleIncomingMessage } = require('./ai-agent');
const { markAsRead } = require('./whatsapp-api');

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
  const body = req.body;

  if (body.object !== 'whatsapp_business_account') {
    return res.sendStatus(200);
  }

  const messagesToProcess = [];
  const entries = body.entry || [];
  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
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

        messagesToProcess.push({
          from,
          profileName,
          messageId,
          ...extracted,
          phoneNumberId: metadata.phone_number_id,
        });
      }
    }
  }

  if (messagesToProcess.length === 0) {
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

function extractMessageContent(message) {
  switch (message.type) {
    case 'text':
      return { type: 'text', text: message.text?.body || '' };
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
    case 'audio':
    case 'video':
      return { type: message.type, text: message[message.type]?.caption || `[${message.type}]` };
    default:
      return null;
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
