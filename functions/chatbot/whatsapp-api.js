const axios = require('axios');

const GRAPH_API = 'https://graph.facebook.com/v22.0';

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
    const resp = await axios.post(url, {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: chunk },
    }, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    console.log(`[WA-API] Resposta Meta:`, JSON.stringify(resp.data));
  }
}

async function sendImageMessage(to, imageUrl, caption = '', options = {}) {
  const { token, phoneNumberId } = getConfig(options.phoneNumberId);
  const url = `${GRAPH_API}/${phoneNumberId}/messages`;

  await axios.post(url, {
    messaging_product: 'whatsapp',
    to,
    type: 'image',
    image: { link: imageUrl, caption },
  }, {
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
  sendInteractiveList,
  sendInteractiveButtons,
  markAsRead,
};
