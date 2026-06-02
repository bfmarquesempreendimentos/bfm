const axios = require('axios');
const FormData = require('form-data');
const admin = require('firebase-admin');

const GRAPH_API = 'https://graph.facebook.com/v22.0';

function rememberCloudPhoneNumberId(phoneNumberId) {
  if (!phoneNumberId) return;
  try {
    if (!admin.apps.length) admin.initializeApp();
    admin.firestore().collection('settings').doc('whatsapp').set({
      lastWebhookPhoneNumberId: String(phoneNumberId),
      lastWebhookPhoneAt: new Date().toISOString(),
      lastPhoneCaptureSource: 'outbound_api',
    }, { merge: true }).catch(function() {});
  } catch (e) {
    /* opcional */
  }
}

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
  if (options.phoneNumberId) rememberCloudPhoneNumberId(options.phoneNumberId);
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

function extractMetaError(err) {
  const meta = err && err.response && err.response.data && err.response.data.error;
  if (!meta) return err && err.message ? err.message : 'Falha ao enviar';
  var code = meta.code != null ? String(meta.code) : '';
  var sub = meta.error_subcode != null ? String(meta.error_subcode) : '';
  return (meta.message || 'Erro Meta') + (code ? ' (código ' + code + (sub ? '/' + sub : '') + ')' : '');
}

function isTemplateNameOrLanguageError(msg) {
  var s = String(msg || '').toLowerCase();
  return s.indexOf('132001') >= 0 || s.indexOf('132000') >= 0 || s.indexOf('132015') >= 0 ||
    s.indexOf('does not exist') >= 0 || s.indexOf('template name') >= 0 ||
    s.indexOf('template') >= 0 && s.indexOf('language') >= 0;
}

function normalizeTemplateName(raw) {
  return String(raw || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

/** Extrai WABA ID do token (granular_scopes do debug_token). */
async function resolveWabaIdViaDebugToken(token) {
  if (!token) return null;
  try {
    const resp = await axios.get(GRAPH_API + '/debug_token', {
      params: { input_token: token },
      headers: { Authorization: 'Bearer ' + token },
    });
    const granular = resp.data && resp.data.data && resp.data.data.granular_scopes;
    if (!granular || !granular.length) return null;
    var i;
    var scope;
    var ids;
    for (i = 0; i < granular.length; i++) {
      scope = granular[i];
      if (!scope || !scope.scope) continue;
      if (scope.scope.indexOf('whatsapp') < 0) continue;
      ids = scope.target_ids;
      if (ids && ids.length) return String(ids[0]);
    }
  } catch (e) {
    console.warn('[WA-API] debug_token WABA:', e.message || e);
  }
  return null;
}

/** Resolve WABA ID (vários caminhos — a Meta mudou campos entre versões da API). */
async function resolveWabaId(options) {
  options = options || {};
  const { token, phoneNumberId } = getConfig(options.phoneNumberId);
  if (!token || !phoneNumberId) return { wabaId: null, error: 'WhatsApp não configurado' };

  if (options.wabaId) {
    return { wabaId: String(options.wabaId).trim(), source: 'option' };
  }

  if (process.env.WHATSAPP_WABA_ID) {
    return { wabaId: String(process.env.WHATSAPP_WABA_ID).trim(), source: 'env' };
  }

  const debugWaba = await resolveWabaIdViaDebugToken(token);
  if (debugWaba) {
    return { wabaId: debugWaba, source: 'debug_token' };
  }

  /* Não tratar phone_number_id como WABA só porque /message_templates responde — isso gerava falso positivo. */

  const fieldAttempts = [
    'whatsapp_business_account{id}',
    'whatsapp_business_account',
    'business_id',
  ];
  var fi;
  for (fi = 0; fi < fieldAttempts.length; fi++) {
    try {
      const phoneResp = await axios.get(GRAPH_API + '/' + phoneNumberId, {
        params: { fields: fieldAttempts[fi] + ',display_phone_number,verified_name' },
        headers: { Authorization: 'Bearer ' + token },
      });
      const d = phoneResp.data || {};
      var wabaId = null;
      if (d.whatsapp_business_account) {
        wabaId = typeof d.whatsapp_business_account === 'object'
          ? d.whatsapp_business_account.id
          : d.whatsapp_business_account;
      }
      if (!wabaId && d.business_id) wabaId = d.business_id;
      if (wabaId) {
        return {
          wabaId: wabaId,
          source: 'phone_fields',
          displayPhone: d.display_phone_number || '',
          verifiedName: d.verified_name || '',
        };
      }
    } catch (fieldErr) {
      /* tentar próximo campo */
    }
  }

  try {
    const meResp = await axios.get(GRAPH_API + '/me', {
      params: { fields: 'whatsapp_business_accounts{id,name}' },
      headers: { Authorization: 'Bearer ' + token },
    });
    const rows = meResp.data && meResp.data.whatsapp_business_accounts &&
      meResp.data.whatsapp_business_accounts.data;
    if (rows && rows.length && rows[0].id) {
      return { wabaId: rows[0].id, source: 'me_waba_list', wabaName: rows[0].name || '' };
    }
  } catch (meErr) {
    /* seguir */
  }

  return { wabaId: null, error: 'WABA não encontrado. Defina o secret WHATSAPP_WABA_ID no Firebase (ID da conta em WhatsApp Manager).' };
}

/** Conta/número WhatsApp Business ligado ao phone_number_id (detecta conta de teste). */
async function getWhatsAppAccountInfo(options) {
  options = options || {};
  const { token, phoneNumberId } = getConfig(options.phoneNumberId);
  if (!token || !phoneNumberId) {
    return { ok: false, error: 'WhatsApp não configurado' };
  }
  try {
    const resolved = await resolveWabaId(options);
    if (!resolved.wabaId) {
      return { ok: false, error: resolved.error || 'WABA não encontrado' };
    }
    let wabaName = resolved.wabaName || '';
    if (!wabaName) {
      try {
        const wabaResp = await axios.get(GRAPH_API + '/' + resolved.wabaId, {
          params: { fields: 'name,account_review_status' },
          headers: { Authorization: 'Bearer ' + token },
        });
        wabaName = (wabaResp.data && wabaResp.data.name) || '';
      } catch (wabaErr) {
        wabaName = '';
      }
    }
    var displayPhone = resolved.displayPhone || '';
    var verifiedName = resolved.verifiedName || '';
    if (!displayPhone) {
      try {
        const phoneResp = await axios.get(GRAPH_API + '/' + phoneNumberId, {
          params: { fields: 'display_phone_number,verified_name' },
          headers: { Authorization: 'Bearer ' + token },
        });
        displayPhone = (phoneResp.data && phoneResp.data.display_phone_number) || '';
        verifiedName = (phoneResp.data && phoneResp.data.verified_name) || verifiedName;
      } catch (phoneErr) {
        /* opcional */
      }
    }
    const haystack = (wabaName + ' ' + verifiedName).toLowerCase();
    const isLikelyTestAccount = haystack.indexOf('test') >= 0;
    return {
      ok: true,
      wabaId: resolved.wabaId,
      wabaName: wabaName,
      verifiedName: verifiedName,
      displayPhone: displayPhone,
      isLikelyTestAccount: isLikelyTestAccount,
    };
  } catch (err) {
    return { ok: false, error: extractMetaError(err) };
  }
}

async function listWabaPhoneNumbers(token, wabaId) {
  if (!token || !wabaId) return [];
  try {
    const resp = await axios.get(GRAPH_API + '/' + wabaId + '/phone_numbers', {
      params: { fields: 'id,display_phone_number,verified_name' },
      headers: { Authorization: 'Bearer ' + token },
    });
    return (resp.data && resp.data.data) || [];
  } catch (e) {
    console.warn('[WA-API] listWabaPhoneNumbers:', extractMetaError(e));
    return [];
  }
}

/** Lista WABAs e números acessíveis pelo token (quando debug_token não retorna IDs). */
async function discoverWhatsAppAssetsFromMe(token) {
  var wabas = [];
  var phones = [];
  if (!token) return { wabas: wabas, phones: phones };
  var attempts = [
    { path: '/me', fields: 'whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name}}' },
    { path: '/me/businesses', fields: 'id,name,owned_whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name}}' },
  ];
  var ai;
  var att;
  for (ai = 0; ai < attempts.length; ai++) {
    att = attempts[ai];
    try {
      const resp = await axios.get(GRAPH_API + att.path, {
        params: { fields: att.fields },
        headers: { Authorization: 'Bearer ' + token },
      });
      const d = resp.data || {};
      var wabaRows = d.whatsapp_business_accounts && d.whatsapp_business_accounts.data;
      if (wabaRows && wabaRows.length) {
        collectWabaPhoneRows(wabaRows, wabas, phones);
      }
      var bizRows = d.data;
      if (bizRows && bizRows.length) {
        var bi;
        for (bi = 0; bi < bizRows.length; bi++) {
          var owned = bizRows[bi].owned_whatsapp_business_accounts &&
            bizRows[bi].owned_whatsapp_business_accounts.data;
          if (owned && owned.length) collectWabaPhoneRows(owned, wabas, phones);
        }
      }
      if (wabas.length) break;
    } catch (meErr) {
      console.warn('[WA-API] discoverWhatsAppAssetsFromMe:', att.path, extractMetaError(meErr));
    }
  }
  return { wabas: wabas, phones: phones };
}

function collectWabaPhoneRows(rows, wabasOut, phonesOut) {
  var ri;
  var row;
  var plist;
  var pi;
  var p;
  for (ri = 0; ri < rows.length; ri++) {
    row = rows[ri];
    if (!row || !row.id) continue;
    if (wabasOut.indexOf(row.id) < 0) wabasOut.push(String(row.id));
    plist = row.phone_numbers && row.phone_numbers.data;
    if (!plist || !plist.length) continue;
    for (pi = 0; pi < plist.length; pi++) {
      p = plist[pi];
      if (!p || !p.id) continue;
      phonesOut.push({
        wabaId: String(row.id),
        id: String(p.id),
        display_phone_number: p.display_phone_number || '',
        verified_name: p.verified_name || '',
      });
    }
  }
}

async function phoneBelongsToWaba(token, wabaId, phoneNumberId) {
  if (!token || !wabaId || !phoneNumberId) return false;
  const phones = await listWabaPhoneNumbers(token, wabaId);
  var i;
  for (i = 0; i < phones.length; i++) {
    if (String(phones[i].id) === String(phoneNumberId)) return true;
  }
  return false;
}

/** Se o ID salvo for phone_number_id (e não WABA), devolve a conta e o número corretos. */
async function resolvePhoneNodeToWaba(token, maybePhoneId) {
  if (!token || !maybePhoneId) return null;
  try {
    const phoneResp = await axios.get(GRAPH_API + '/' + maybePhoneId, {
      params: { fields: 'id,display_phone_number,verified_name,whatsapp_business_account{id}' },
      headers: { Authorization: 'Bearer ' + token },
    });
    const d = phoneResp.data || {};
    var wabaRaw = d.whatsapp_business_account;
    var wabaId = wabaRaw && (typeof wabaRaw === 'object' ? wabaRaw.id : wabaRaw);
    if (!wabaId || !d.id) return null;
    return {
      wabaId: String(wabaId),
      phoneNumberId: String(d.id),
      displayPhone: d.display_phone_number || '',
      verifiedName: d.verified_name || '',
    };
  } catch (e) {
    return null;
  }
}

/** IDs de WABA no token (debug_token). */
async function resolveAllWabaIdsFromDebugToken(token) {
  if (!token) return [];
  try {
    const resp = await axios.get(GRAPH_API + '/debug_token', {
      params: { input_token: token },
      headers: { Authorization: 'Bearer ' + token },
    });
    const granular = resp.data && resp.data.data && resp.data.data.granular_scopes;
    if (!granular || !granular.length) return [];
    var out = [];
    var seen = {};
    var i;
    var scope;
    var ids;
    var j;
    for (i = 0; i < granular.length; i++) {
      scope = granular[i];
      if (!scope || scope.scope.indexOf('whatsapp') < 0) continue;
      ids = scope.target_ids || [];
      for (j = 0; j < ids.length; j++) {
        if (ids[j] && !seen[ids[j]]) {
          seen[ids[j]] = true;
          out.push(String(ids[j]));
        }
      }
    }
    return out;
  } catch (e) {
    return [];
  }
}

/** WABA onde o phone_number_id da Cloud API está cadastrado (obrigatório para template). */
async function resolveWabaForCloudApiPhone(options) {
  options = options || {};
  const { token, phoneNumberId } = getConfig(options.phoneNumberId);
  if (!token || !phoneNumberId) {
    return { wabaId: null, phoneMatch: false, error: 'WHATSAPP_TOKEN ou WHATSAPP_PHONE_NUMBER_ID não configurado no Firebase.' };
  }
  var preferred = options.preferredWabaId ? String(options.preferredWabaId).trim() : '';
  var candidates = [];
  if (preferred) candidates.push(preferred);
  var debugList = await resolveAllWabaIdsFromDebugToken(token);
  var di;
  for (di = 0; di < debugList.length; di++) {
    if (candidates.indexOf(debugList[di]) < 0) candidates.push(debugList[di]);
  }
  var resolved = await resolveWabaId({ wabaId: preferred });
  if (resolved.wabaId && candidates.indexOf(resolved.wabaId) < 0) candidates.push(resolved.wabaId);

  for (di = 0; di < candidates.length; di++) {
    if (await phoneBelongsToWaba(token, candidates[di], phoneNumberId)) {
      return {
        wabaId: candidates[di],
        phoneMatch: true,
        phoneNumberId: phoneNumberId,
        source: candidates[di] === preferred ? 'preferred_match' : 'debug_match',
      };
    }
  }

  var phonesOnPreferred = preferred ? await listWabaPhoneNumbers(token, preferred) : [];
  return {
    wabaId: preferred || (candidates[0] || null),
    phoneMatch: false,
    phoneNumberId: phoneNumberId,
    phonesOnPreferred: phonesOnPreferred,
    error: 'O número da API (phone_number_id ' + phoneNumberId + ') não está na conta WABA ' +
      (preferred || '?') + '. O template existe na WABA, mas o envio usa outro número. ' +
      'Ajuste WHATSAPP_PHONE_NUMBER_ID no Firebase para um ID listado na conta ou use o WABA correto.',
  };
}

function countVarsInTemplateText(text) {
  if (!text) return 0;
  var matches = String(text).match(/\{\{[^}]+\}\}/g);
  return matches ? matches.length : 0;
}

function countTemplateBodyVariables(components) {
  if (!components || !components.length) return 0;
  var bodyText = '';
  var i;
  for (i = 0; i < components.length; i++) {
    if (components[i].type === 'BODY' && components[i].text) {
      bodyText = components[i].text;
      break;
    }
  }
  return countVarsInTemplateText(bodyText);
}

function countTemplateTotalVariables(components) {
  if (!components || !components.length) return 0;
  var total = 0;
  var i;
  var c;
  for (i = 0; i < components.length; i++) {
    c = components[i];
    if (c.type === 'BODY' && c.text) total += countVarsInTemplateText(c.text);
    else if (c.type === 'HEADER' && c.format === 'TEXT' && c.text) {
      total += countVarsInTemplateText(c.text);
    }
  }
  return total;
}

function findApprovedTemplatesByName(templates, name) {
  if (!name || !templates || !templates.length) return [];
  var out = [];
  var i;
  for (i = 0; i < templates.length; i++) {
    if (templates[i].name === name) out.push(templates[i]);
  }
  return out;
}

async function resolveWabaIdForTemplateList(token, options) {
  options = options || {};
  var phone = options.phoneNumberId ? String(options.phoneNumberId).trim() : '';
  var waba = options.wabaId ? String(options.wabaId).trim() : '';
  if (phone && waba && phone === waba) waba = '';
  if (phone) {
    var node = await resolvePhoneNodeToWaba(token, phone);
    if (node && node.wabaId) {
      return { wabaId: node.wabaId, source: 'phone_node' };
    }
    var fromPhone = await resolveWabaId({ phoneNumberId: phone });
    if (fromPhone.wabaId) return fromPhone;
  }
  if (waba) return { wabaId: waba, source: 'option' };
  return resolveWabaId(options);
}

async function listApprovedMessageTemplates(options) {
  options = options || {};
  const { token, phoneNumberId } = getConfig(options.phoneNumberId);
  if (!token) return { ok: false, templates: [], error: 'WHATSAPP_TOKEN não configurado' };
  if (!phoneNumberId && !options.wabaId && !options.phoneNumberId) {
    return { ok: false, templates: [], error: 'WHATSAPP_PHONE_NUMBER_ID não configurado' };
  }
  try {
    var resolved = await resolveWabaIdForTemplateList(token, {
      wabaId: options.wabaId,
      phoneNumberId: options.phoneNumberId || phoneNumberId,
    });
    if (!resolved.wabaId) {
      return { ok: false, templates: [], error: resolved.error || 'WABA não encontrado' };
    }
    const tplResp = await axios.get(GRAPH_API + '/' + resolved.wabaId + '/message_templates', {
      params: { limit: 200 },
      headers: { Authorization: 'Bearer ' + token },
    });
    const rows = (tplResp.data && tplResp.data.data) || [];
    const templates = rows
      .filter(function(t) {
        var st = String(t.status || '').toUpperCase();
        return st === 'APPROVED' || st === 'ACTIVE' || st.indexOf('APPROV') >= 0;
      })
      .map(function(t) {
        return {
          name: t.name,
          language: t.language,
          status: t.status,
          category: t.category,
          bodyVariableCount: countTemplateBodyVariables(t.components),
          totalVariableCount: countTemplateTotalVariables(t.components),
          components: t.components || [],
        };
      });
    return { ok: true, templates: templates, wabaId: resolved.wabaId };
  } catch (err) {
    return { ok: false, templates: [], error: extractMetaError(err) };
  }
}

function findApprovedTemplate(templates, name, languageCode) {
  if (!name || !templates || !templates.length) return null;
  var langs = [languageCode, 'pt_BR', 'pt', 'en_US', 'en'].filter(Boolean);
  var i;
  var j;
  for (i = 0; i < langs.length; i++) {
    for (j = 0; j < templates.length; j++) {
      if (templates[j].name === name && templates[j].language === langs[i]) {
        return {
          name: templates[j].name,
          language: templates[j].language,
          bodyVariableCount: templates[j].bodyVariableCount,
          totalVariableCount: templates[j].totalVariableCount,
          components: templates[j].components,
        };
      }
    }
  }
  for (j = 0; j < templates.length; j++) {
    if (templates[j].name === name) {
      return {
        name: templates[j].name,
        language: templates[j].language,
        bodyVariableCount: templates[j].bodyVariableCount,
        totalVariableCount: templates[j].totalVariableCount,
        components: templates[j].components,
      };
    }
  }
  return null;
}

/**
 * Monta components[] para envio conforme estrutura aprovada na Meta (header + body).
 */
function buildTemplateSendComponents(metaComponents, fill) {
  fill = fill || {};
  if (!metaComponents || !metaComponents.length) return null;
  var out = [];
  var i;
  var c;
  var ctype;
  var n;
  var params;
  var pi;
  for (i = 0; i < metaComponents.length; i++) {
    c = metaComponents[i];
    ctype = String(c.type || '').toUpperCase();
    if (ctype === 'HEADER' && c.format === 'TEXT' && c.text) {
      n = countVarsInTemplateText(c.text);
      if (n > 0) {
        params = [];
        for (pi = 0; pi < n; pi++) {
          params.push({
            type: 'text',
            text: String(fill.headerTexts && fill.headerTexts[pi] != null
              ? fill.headerTexts[pi]
              : (fill.weeklyTitle || 'B F Marques')).substring(0, 60),
          });
        }
        out.push({ type: 'header', parameters: params });
      }
    } else if (ctype === 'BODY' && c.text) {
      n = countVarsInTemplateText(c.text);
      if (n === 0) continue;
      params = [];
      if (fill.bodyTexts && fill.bodyTexts.length >= n) {
        for (pi = 0; pi < n; pi++) {
          params.push({ type: 'text', text: String(fill.bodyTexts[pi]).substring(0, 1024) });
        }
      } else if (n === 1 && fill.singleBody) {
        params.push({ type: 'text', text: String(fill.singleBody).substring(0, 1024) });
      } else if (fill.namedParams && fill.namedParams.length >= n) {
        for (pi = 0; pi < n; pi++) {
          params.push({ type: 'text', text: String(fill.namedParams[pi]).substring(0, 1024) });
        }
      }
      if (params.length === n) out.push({ type: 'body', parameters: params });
    }
  }
  return out.length ? out : null;
}

async function findApprovedTemplateRow(options, templateName, languageCode) {
  const listed = await listApprovedMessageTemplates(options);
  if (!listed.ok || !listed.templates.length) return null;
  var langs = [languageCode, 'pt_BR', 'pt', 'en_US', 'en'].filter(Boolean);
  var li;
  var j;
  for (li = 0; li < langs.length; li++) {
    for (j = 0; j < listed.templates.length; j++) {
      if (listed.templates[j].name === templateName && listed.templates[j].language === langs[li]) {
        return listed.templates[j];
      }
    }
  }
  for (j = 0; j < listed.templates.length; j++) {
    if (listed.templates[j].name === templateName) return listed.templates[j];
  }
  return null;
}

async function sendTemplateMessage(to, templateName, languageCode, components, options) {
  options = options || {};
  const { token, phoneNumberId } = getConfig(options.phoneNumberId);
  if (!phoneNumberId) {
    throw new Error('WHATSAPP_PHONE_NUMBER_ID não configurado.');
  }
  if (!templateName) {
    throw new Error('Nome do template WhatsApp não configurado.');
  }
  if (options.phoneNumberId) rememberCloudPhoneNumberId(options.phoneNumberId);
  const url = `${GRAPH_API}/${phoneNumberId}/messages`;
  try {
    const resp = await axios.post(url, {
      messaging_product: 'whatsapp',
      to: to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode || 'pt_BR' },
        components: components || [],
      },
    }, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    console.log('[WA-API] Template enviado:', JSON.stringify(resp.data));
    var mid = '';
    if (resp.data && resp.data.messages && resp.data.messages[0]) {
      mid = resp.data.messages[0].id || '';
    }
    return { messageId: mid, to: to, templateName: templateName, language: languageCode || 'pt_BR' };
  } catch (err) {
    console.error('[WA-API] Erro template:', extractMetaError(err));
    throw new Error(extractMetaError(err));
  }
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
  sendTemplateMessage,
  extractMetaError,
  isTemplateNameOrLanguageError,
  normalizeTemplateName,
  getWhatsAppAccountInfo,
  resolveWabaId,
  resolveWabaIdViaDebugToken,
  resolveWabaForCloudApiPhone,
  resolveAllWabaIdsFromDebugToken,
  listWabaPhoneNumbers,
  discoverWhatsAppAssetsFromMe,
  phoneBelongsToWaba,
  resolvePhoneNodeToWaba,
  rememberCloudPhoneNumberId,
  listApprovedMessageTemplates,
  findApprovedTemplate,
  findApprovedTemplatesByName,
  findApprovedTemplateRow,
  countTemplateBodyVariables,
  countTemplateTotalVariables,
  countVarsInTemplateText,
  resolveWabaIdForTemplateList,
  buildTemplateSendComponents,
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
