const axios = require('axios');
const FormData = require('form-data');

const GRAPH_API = 'https://graph.facebook.com/v22.0';

function mimeToWhatsAppType(mime) {
  if (!mime || typeof mime !== 'string') return 'document';
  const m = mime.toLowerCase();
  if (m.indexOf('image/') === 0) return 'image';
  if (m.indexOf('video/') === 0) return 'video';
  if (m.indexOf('audio/') === 0) return 'audio';
  return 'document';
}

function getConfig(overridePhoneNumberId) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = overridePhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  return { token, phoneNumberId };
}

async function sendTextMessage(to, text, options = {}) {
  const { token, phoneNumberId } = getConfig(options.phoneNumberId);
  if (!phoneNumberId) {
    throw new Error('WHATSAPP_PHONE_NUMBER_ID não configurado. Defina o secret ou use número cadastrado no Meta.');
  }
  const url = `${GRAPH_API}/${phoneNumberId}/messages`;

  console.log(`[WA-API] Enviando para ${to}, phoneNumberId=${phoneNumberId}, token=${token ? token.substring(0, 20) + '...' : 'VAZIO'}`);

  const chunks = splitMessage(text, 4000);
  for (const chunk of chunks) {
    try {
      const resp = await axios.post(url, {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: chunk },
      }, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      console.log(`[WA-API] Resposta Meta:`, JSON.stringify(resp.data));
    } catch (err) {
      const status = err.response?.status;
      const metaError = err.response?.data?.error?.message || err.message;
      console.error(`[WA-API] Erro Meta status=${status}:`, metaError);
      if (status === 401) {
        throw new Error('Token WhatsApp inválido ou expirado. Use token PERMANENTE: Meta Business Suite → Usuários do sistema → Gerar token.');
      }
      throw err;
    }
  }
}

async function sendImageMessage(to, imageUrl, caption = '', options = {}) {
  const { token, phoneNumberId } = getConfig(options.phoneNumberId);
  const url = `${GRAPH_API}/${phoneNumberId}/messages`;

  await axios.post(url, {
    messaging_product: 'whatsapp',
    to,
    type: 'image',
    image: { link: imageUrl, caption: caption || undefined },
  }, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
}

async function sendVideoMessage(to, videoUrl, caption = '', options = {}) {
  const { token, phoneNumberId } = getConfig(options.phoneNumberId);
  const url = `${GRAPH_API}/${phoneNumberId}/messages`;

  await axios.post(url, {
    messaging_product: 'whatsapp',
    to,
    type: 'video',
    video: { link: videoUrl, caption: caption || undefined },
  }, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
}

async function sendDocumentMessage(to, documentUrl, filename, caption = '', options = {}) {
  const { token, phoneNumberId } = getConfig(options.phoneNumberId);
  const url = `${GRAPH_API}/${phoneNumberId}/messages`;

  await axios.post(url, {
    messaging_product: 'whatsapp',
    to,
    type: 'document',
    document: {
      link: documentUrl,
      filename: filename || 'documento',
      caption: caption || undefined,
    },
  }, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
}

/** Upload binário para a Meta e retorna id + tipo (image|video|audio|document) */
async function uploadMediaBuffer(buffer, mimeType, filename, options = {}) {
  const { token, phoneNumberId } = getConfig(options.phoneNumberId);
  if (!phoneNumberId) {
    throw new Error('WHATSAPP_PHONE_NUMBER_ID não configurado.');
  }
  if (!token) {
    throw new Error('WHATSAPP_TOKEN não configurado.');
  }
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', buffer, {
    filename: filename || 'arquivo',
    contentType: mimeType || 'application/octet-stream',
  });
  form.append('type', mimeType || 'application/octet-stream');
  const url = `${GRAPH_API}/${phoneNumberId}/media`;
  const resp = await axios.post(url, form, {
    headers: { Authorization: `Bearer ${token}`, ...form.getHeaders() },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
  const id = resp.data && resp.data.id;
  if (!id) {
    throw new Error('Upload de mídia não retornou id.');
  }
  return { id: id, waType: mimeToWhatsAppType(mimeType) };
}

/** Envia mensagem de mídia referenciando id retornado pelo upload (painel admin). */
async function sendMediaById(to, waType, mediaId, opts = {}) {
  const { token, phoneNumberId } = getConfig(opts.phoneNumberId);
  const url = `${GRAPH_API}/${phoneNumberId}/messages`;
  const caption = (opts.caption || '').trim();
  const filename = opts.filename || 'documento';
  const payload = { messaging_product: 'whatsapp', to: to, type: waType };
  if (waType === 'image') {
    payload.image = { id: mediaId };
    if (caption) payload.image.caption = caption;
  } else if (waType === 'video') {
    payload.video = { id: mediaId };
    if (caption) payload.video.caption = caption;
  } else if (waType === 'audio') {
    payload.audio = { id: mediaId };
  } else {
    payload.document = { id: mediaId, filename: filename };
    if (caption) payload.document.caption = caption;
  }
  await axios.post(url, payload, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
}

async function sendInteractiveList(to, bodyText, buttonText, sections, options = {}) {
  const { token, phoneNumberId } = getConfig(options.phoneNumberId);
  const url = `${GRAPH_API}/${phoneNumberId}/messages`;

  await axios.post(url, {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText },
      action: {
        button: buttonText,
        sections,
      },
    },
  }, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
}

async function sendInteractiveButtons(to, bodyText, buttons, options = {}) {
  const { token, phoneNumberId } = getConfig(options.phoneNumberId);
  const url = `${GRAPH_API}/${phoneNumberId}/messages`;

  await axios.post(url, {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.map((b, i) => ({
          type: 'reply',
          reply: { id: b.id || `btn_${i}`, title: b.title.substring(0, 20) },
        })),
      },
    },
  }, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
}

/**
 * Baixa binário de mídia já existente no WhatsApp (recebida do cliente).
 * Meta: GET /{media-id} → url + mime_type; GET url com Authorization.
 */
async function getWhatsAppMediaBuffer(mediaId, options = {}) {
  const { token } = getConfig(options.phoneNumberId);
  if (!token) {
    throw new Error('WHATSAPP_TOKEN não configurado');
  }
  const id = String(mediaId || '').trim();
  if (!id || !/^[0-9A-Za-z_.-]+$/.test(id)) {
    throw new Error('mediaId inválido');
  }
  const metaUrl = `${GRAPH_API}/${id}`;
  const metaRes = await axios.get(metaUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const downloadUrl = metaRes.data && metaRes.data.url;
  const rawMime = (metaRes.data && metaRes.data.mime_type) || 'application/octet-stream';
  const mimeType = String(rawMime).split(';')[0].trim();
  if (!downloadUrl) {
    throw new Error('URL de mídia não retornada pela Meta');
  }
  const binRes = await axios.get(downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: 'arraybuffer',
    maxContentLength: 50 * 1024 * 1024,
  });
  return { buffer: Buffer.from(binRes.data), mimeType: mimeType };
}

async function markAsRead(messageId, options = {}) {
  const { token, phoneNumberId } = getConfig(options.phoneNumberId);
  const url = `${GRAPH_API}/${phoneNumberId}/messages`;

  await axios.post(url, {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  }, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  }).catch(() => {});
}

function splitMessage(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf('\n', maxLen);
    if (splitAt < maxLen * 0.3) splitAt = maxLen;
    chunks.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt).trimStart();
  }
  return chunks;
}

module.exports = {
  sendTextMessage,
  sendImageMessage,
  sendVideoMessage,
  sendDocumentMessage,
  uploadMediaBuffer,
  sendMediaById,
  getWhatsAppMediaBuffer,
  mimeToWhatsAppType,
  sendInteractiveList,
  sendInteractiveButtons,
  markAsRead,
};
