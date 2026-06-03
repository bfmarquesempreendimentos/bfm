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
  var lastMessageId = '';
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
      if (resp.data && resp.data.messages && resp.data.messages[0] && resp.data.messages[0].id) {
        lastMessageId = resp.data.messages[0].id;
      }
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
  return { messageId: lastMessageId, to: to };
}

async function sendImageMessage(to, imageUrl, caption = '', options = {}) {
  const { token, phoneNumberId } = getConfig(options.phoneNumberId);
  const url = `${GRAPH_API}/${phoneNumberId}/messages`;

  const resp = await axios.post(url, {
    messaging_product: 'whatsapp',
    to,
    type: 'image',
    image: { link: imageUrl, caption: caption || undefined },
  }, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  var mid = '';
  if (resp.data && resp.data.messages && resp.data.messages[0]) {
    mid = resp.data.messages[0].id || '';
  }
  return { messageId: mid, to: to };
}

async function sendVideoMessage(to, videoUrl, caption = '', options = {}) {
  const { token, phoneNumberId } = getConfig(options.phoneNumberId);
  const url = `${GRAPH_API}/${phoneNumberId}/messages`;

  const resp = await axios.post(url, {
    messaging_product: 'whatsapp',
    to,
    type: 'video',
    video: { link: videoUrl, caption: caption || undefined },
  }, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  var mid = '';
  if (resp.data && resp.data.messages && resp.data.messages[0]) {
    mid = resp.data.messages[0].id || '';
  }
  return { messageId: mid, to: to };
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

function isTemplateParamCountError(msg) {
  var s = String(msg || '').toLowerCase();
  return s.indexOf('132000') >= 0 || s.indexOf('number of parameters') >= 0 ||
    s.indexOf('expected number of params') >= 0;
}

function isTemplateParamValidationError(msg) {
  var s = String(msg || '').toLowerCase();
  return isTemplateParamCountError(msg) ||
    s.indexOf('132018') >= 0 || s.indexOf('132012') >= 0 || s.indexOf('132005') >= 0 ||
    s.indexOf('issue with the parameters') >= 0 ||
    s.indexOf('parameter format') >= 0 || s.indexOf('hydrated text') >= 0;
}

/** Meta rejeita alguns caracteres em variáveis de template (132018). */
function sanitizeWhatsAppTemplateParam(text) {
  var s = String(text || '');
  s = s.replace(/\u00a0/g, ' ');
  s = s.replace(/\r\n/g, '\n');
  s = s.replace(/\r/g, '\n');
  s = s.replace(/\n{4,}/g, '\n\n\n');
  s = s.replace(/\t/g, ' ');
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');
  s = s.replace(/\*/g, '');
  s = s.replace(/[—–]/g, '-');
  s = s.replace(/#/g, '');
  s = s.replace(/ {2,}/g, ' ');
  s = s.trim();
  if (!s) s = 'B F Marques Empreendimentos — parceria corretores.';
  if (s.length > 1024) s = s.substring(0, 1021) + '...';
  return s;
}

function templateHasImageHeader(metaComponents) {
  if (!metaComponents || !metaComponents.length) return false;
  var i;
  for (i = 0; i < metaComponents.length; i++) {
    if (metaComponents[i].type === 'HEADER' && metaComponents[i].format === 'IMAGE') return true;
  }
  return false;
}

function extractTemplateVarTokens(text) {
  var matches = String(text || '').match(/\{\{([^}]+)\}\}/g);
  if (!matches) return [];
  var out = [];
  var i;
  for (i = 0; i < matches.length; i++) {
    out.push(matches[i].replace(/\{\{|\}\}/g, '').trim());
  }
  return out;
}

function templateUsesNamedParameters(metaComponents) {
  if (!metaComponents || !metaComponents.length) return false;
  var i;
  var c;
  var tokens;
  for (i = 0; i < metaComponents.length; i++) {
    c = metaComponents[i];
    if (c.type === 'BODY' && c.text) {
      tokens = extractTemplateVarTokens(c.text);
      if (tokens.length && tokens[0] && !/^\d+$/.test(tokens[0])) return true;
    }
  }
  return false;
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
    var accountReviewStatus = '';
    if (!wabaName) {
      try {
        const wabaResp = await axios.get(GRAPH_API + '/' + resolved.wabaId, {
          params: { fields: 'name,account_review_status' },
          headers: { Authorization: 'Bearer ' + token },
        });
        wabaName = (wabaResp.data && wabaResp.data.name) || '';
        accountReviewStatus = (wabaResp.data && wabaResp.data.account_review_status) || '';
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
    var displayDigits = String(displayPhone || '').replace(/\D/g, '');
    var isBiaProductionNumber = displayDigits.indexOf('997590814') >= 0 ||
      displayDigits.indexOf('21997590814') >= 0;
    return {
      ok: true,
      wabaId: resolved.wabaId,
      wabaName: wabaName,
      verifiedName: verifiedName,
      displayPhone: displayPhone,
      isLikelyTestAccount: isLikelyTestAccount,
      isBiaProductionNumber: isBiaProductionNumber,
      accountReviewStatus: accountReviewStatus,
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
      params: { fields: 'id,display_phone_number,verified_name,whatsapp_business_account' },
      headers: { Authorization: 'Bearer ' + token },
    });
    const d = phoneResp.data || {};
    var wabaRaw = d.whatsapp_business_account;
    var wabaId = wabaRaw && (typeof wabaRaw === 'object' ? wabaRaw.id : wabaRaw);
    if (d.id) {
      return {
        wabaId: wabaId ? String(wabaId) : '',
        phoneNumberId: String(d.id),
        displayPhone: d.display_phone_number || '',
        verifiedName: d.verified_name || '',
      };
    }
  } catch (e) {
    /* tenta fallback abaixo */
  }
  var fallback = await resolveWabaId({ phoneNumberId: maybePhoneId });
  if (fallback && fallback.wabaId) {
    return {
      wabaId: String(fallback.wabaId),
      phoneNumberId: String(maybePhoneId),
      displayPhone: fallback.displayPhone || '',
      verifiedName: fallback.verifiedName || '',
    };
  }
  try {
    const bare = await axios.get(GRAPH_API + '/' + maybePhoneId, {
      params: { fields: 'id,display_phone_number,verified_name' },
      headers: { Authorization: 'Bearer ' + token },
    });
    const bd = bare.data || {};
    if (bd.id) {
      return {
        wabaId: '',
        phoneNumberId: String(bd.id),
        displayPhone: bd.display_phone_number || '',
        verifiedName: bd.verified_name || '',
      };
    }
  } catch (bareErr) {
    /* ignore */
  }
  return null;
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
      var probeId = options.phoneNumberId || phoneNumberId;
      if (probeId) {
        try {
          const probeResp = await axios.get(GRAPH_API + '/' + probeId + '/message_templates', {
            params: { limit: 200 },
            headers: { Authorization: 'Bearer ' + token },
          });
          const probeRows = (probeResp.data && probeResp.data.data) || [];
          if (probeRows.length) {
            resolved = { wabaId: String(probeId), source: 'phone_id_as_waba' };
          }
        } catch (probeErr) {
          /* continua */
        }
      }
    }
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
            text: sanitizeWhatsAppTemplateParam(fill.headerTexts && fill.headerTexts[pi] != null
              ? fill.headerTexts[pi]
              : (fill.weeklyTitle || 'B F Marques')).substring(0, 60),
          });
        }
        out.push({ type: 'header', parameters: params });
      }
    } else if (ctype === 'BODY' && c.text) {
      n = countVarsInTemplateText(c.text);
      if (n === 0) continue;
      var varTokens = extractTemplateVarTokens(c.text);
      var useNamed = fill.forceNamed || templateUsesNamedParameters(metaComponents);
      params = [];
      if (fill.bodyTexts && fill.bodyTexts.length >= n) {
        for (pi = 0; pi < n; pi++) {
          var txtBody = sanitizeWhatsAppTemplateParam(fill.bodyTexts[pi]);
          params.push(useNamed && varTokens[pi]
            ? { type: 'text', parameter_name: varTokens[pi], text: txtBody }
            : { type: 'text', text: txtBody });
        }
      } else if (n === 1 && fill.singleBody) {
        var txtSingle = sanitizeWhatsAppTemplateParam(fill.singleBody);
        params.push(useNamed && varTokens[0]
          ? { type: 'text', parameter_name: varTokens[0], text: txtSingle }
          : { type: 'text', text: txtSingle });
      } else if (fill.namedParams && fill.namedParams.length >= n) {
        for (pi = 0; pi < n; pi++) {
          var txtNamed = sanitizeWhatsAppTemplateParam(fill.namedParams[pi]);
          params.push(useNamed && varTokens[pi]
            ? { type: 'text', parameter_name: varTokens[pi], text: txtNamed }
            : { type: 'text', text: txtNamed });
        }
      }
      if (params.length === n) out.push({ type: 'body', parameters: params });
    } else if (ctype === 'BUTTONS' && c.buttons) {
      var bi;
      var btn;
      for (bi = 0; bi < c.buttons.length; bi++) {
        btn = c.buttons[bi];
        if (btn.type === 'URL' && btn.url && countVarsInTemplateText(btn.url) > 0) {
          out.push({
            type: 'button',
            sub_type: 'url',
            index: String(bi),
            parameters: [{
              type: 'text',
              text: String(fill.urlButtonSuffix || 'bfm').substring(0, 200),
            }],
          });
        }
      }
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
  var tplPayload = {
    name: templateName,
    language: { code: languageCode || 'pt_BR' },
  };
  if (components && components.length) tplPayload.components = components;
  try {
    const resp = await axios.post(url, {
      messaging_product: 'whatsapp',
      to: to,
      type: 'template',
      template: tplPayload,
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

function safeStatusDocId(messageId) {
  return String(messageId || '').replace(/[\/\.#]/g, '_');
}

function explainMetaDeliveryError(errors) {
  if (!errors || !errors.length) return '';
  var e = errors[0] || {};
  var code = e.code != null ? String(e.code) : '';
  var title = e.title || e.message || '';
  if (code === '131026') {
    return 'Número não tem WhatsApp ou está incorreto (131026). Confira DDD + 9 dígitos no cadastro.';
  }
  if (code === '131050') {
    return 'Corretor bloqueou mensagens de marketing no WhatsApp (131050).';
  }
  if (code === '131049') {
    return 'A Meta não entregou (131049 — limite de qualidade ou política). Tente mais tarde ou peça ao corretor enviar msg para a Bia.';
  }
  if (code === '131047') {
    return 'Fora da janela 24h (131047). Deve usar template — já tentamos; confira se campanha_corretor_msg está aprovado.';
  }
  if (code === '130472') {
    return 'Número em experimento Meta (130472). Teste com outro celular ou cadastre em números de teste.';
  }
  return (title || 'Falha na entrega Meta') + (code ? ' (código ' + code + ')' : '');
}

async function saveWhatsAppMessageStatus(statusObj) {
  if (!statusObj || !statusObj.id) return;
  try {
    if (!admin.apps.length) admin.initializeApp();
    await admin.firestore().collection('whatsapp_message_status').doc(safeStatusDocId(statusObj.id)).set({
      messageId: statusObj.id,
      status: statusObj.status || '',
      recipientId: statusObj.recipient_id || '',
      timestamp: statusObj.timestamp || '',
      errors: statusObj.errors || [],
      conversation: statusObj.conversation || null,
      pricing: statusObj.pricing || null,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (e) {
    console.warn('[WA-API] saveWhatsAppMessageStatus:', e.message);
  }
}

function delayMsStatus(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

/**
 * Aguarda webhook da Meta gravar status (sent/delivered/failed/read).
 * Retorna { status, errors, errorHint, timedOut }.
 */
async function waitForWhatsAppDeliveryStatus(messageId, maxWaitMs) {
  maxWaitMs = maxWaitMs || 8000;
  if (!messageId) return { status: '', errors: [], errorHint: '', timedOut: true };
  try {
    if (!admin.apps.length) admin.initializeApp();
    var ref = admin.firestore().collection('whatsapp_message_status').doc(safeStatusDocId(messageId));
    var elapsed = 0;
    var step = 400;
    while (elapsed < maxWaitMs) {
      var snap = await ref.get();
      if (snap.exists) {
        var data = snap.data() || {};
        var st = String(data.status || '');
        if (st === 'failed' || st === 'delivered' || st === 'read') {
          return {
            status: st,
            errors: data.errors || [],
            errorHint: explainMetaDeliveryError(data.errors),
            timedOut: false,
          };
        }
        /* Não parar em "sent" — aguardar delivered/failed (webhook chega segundos depois) */
      }
      await delayMsStatus(step);
      elapsed += step;
    }
    var finalSnap = await ref.get();
    if (finalSnap.exists) {
      var fd = finalSnap.data() || {};
      return {
        status: fd.status || 'unknown',
        errors: fd.errors || [],
        errorHint: explainMetaDeliveryError(fd.errors),
        timedOut: false,
      };
    }
    return {
      status: 'pending',
      errors: [],
      errorHint: '',
      timedOut: true,
      pendingDelivery: true,
    };
  } catch (e) {
    return { status: 'error', errors: [{ message: e.message }], errorHint: e.message, timedOut: true };
  }
}

module.exports = {
  sendTextMessage,
  sendTemplateMessage,
  extractMetaError,
  isTemplateNameOrLanguageError,
  isTemplateParamCountError,
  isTemplateParamValidationError,
  sanitizeWhatsAppTemplateParam,
  templateHasImageHeader,
  templateUsesNamedParameters,
  extractTemplateVarTokens,
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
  saveWhatsAppMessageStatus,
  waitForWhatsAppDeliveryStatus,
  explainMetaDeliveryError,
};
