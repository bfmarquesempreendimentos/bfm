const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { verifyWebhook, processWebhook, validateSignature } = require('./chatbot/webhook');
const { getAllLeads, getLeadStats, getLeadByPhone, getConversationHistory, saveMessage, deleteConversationMessage, setModoHumano, returnToBot, markAdminRead, getLastConversationMessage, normalizeWhatsAppPhone, recordInboundActivity, recordAdminBiaTraining, brokerPhoneMatchKeys } = require('./chatbot/lead-manager');
const { processAllFollowUps } = require('./chatbot/follow-up-engine');
const { setFollowUpExclusion: leadSetFollowUpExclusion } = require('./chatbot/lead-manager');
const { getPropertyById } = require('./chatbot/property-data');
const {
  sendTextMessage,
  sendImageMessage,
  sendVideoMessage,
  sendTemplateMessage,
  extractMetaError,
  isTemplateNameOrLanguageError,
  isTemplateParamCountError,
  isTemplateParamValidationError,
  templateHasImageHeader,
  normalizeTemplateName,
  listApprovedMessageTemplates,
  findApprovedTemplate,
  getWhatsAppAccountInfo,
  resolveWabaId,
  resolveWabaIdViaDebugToken,
  resolveWabaForCloudApiPhone,
  resolveAllWabaIdsFromDebugToken,
  findApprovedTemplatesByName,
  listWabaPhoneNumbers,
  phoneBelongsToWaba,
  resolvePhoneNodeToWaba,
  discoverWhatsAppAssetsFromMe,
  buildTemplateSendComponents,
  findApprovedTemplateRow,
  uploadMediaBuffer,
  sendMediaById,
  getWhatsAppMediaBuffer,
  waitForWhatsAppDeliveryStatus,
  explainMetaDeliveryError,
} = require('./chatbot/whatsapp-api');
const propertySalesHandlers = require('./property-sales-handlers');
const reservationsHandlers = require('./reservations-handlers');
const financeHandlers = require('./finance-handlers');
const { roleHasPermission } = require('./admin-accounts');
const fcmPush = require('./fcm-push');
const brokerCampaignContent = require('./chatbot/broker-campaign-content');
const { verifyAdminFromBody, verifyAdminFromReq } = require('./admin-accounts');
const { verifyAdminAuth, extractIdToken } = require('./admin-auth');
const { hashPassword, isPasswordHashed, passwordFieldsForStorage } = require('./broker-password');
const brokerAuth = require('./broker-auth');
const { CLOUD_FUNCTIONS_BASE } = require('./shared/constants');

admin.initializeApp();

/** Normaliza telefone para formato WhatsApp (55 + DDD + número) */
function normalizePhoneForWhatsApp(phone) {
  if (!phone || typeof phone !== 'string') return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  if (digits.length >= 12 && digits.startsWith('55')) return digits;
  if (digits.length === 11) return '55' + digits;
  if (digits.length === 10) return '55' + digits;
  return null;
}

function getTransporter() {
  const config = functions.config();
  const user = config?.smtp?.user;
  const pass = config?.smtp?.pass;
  if (!user || !pass) {
    console.warn('SMTP não configurado. Use: firebase functions:config:set smtp.user="..." smtp.pass="..."');
    return null;
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });
}

function normalizePhoneDigits(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function normalizeBrazilWhatsApp(phone) {
  let digits = normalizePhoneDigits(phone);
  if (!digits) return null;
  while (digits.charAt(0) === '0') digits = digits.substring(1);
  if (digits.indexOf('5555') === 0) digits = digits.substring(2);
  var national = digits;
  if (digits.indexOf('55') === 0 && digits.length > 2) national = digits.substring(2);
  if (national.length === 10) {
    national = national.substring(0, 2) + '9' + national.substring(2);
  }
  if (national.length === 11) {
    digits = '55' + national;
  } else if (digits.length === 11) {
    digits = '55' + digits;
  } else {
    return null;
  }
  if (digits.length === 12 || digits.length === 13) return digits;
  if (digits.length > 13) return digits.substring(0, 13);
  return null;
}

function pickBetterBrokerRow(a, b) {
  const activeA = brokerAuth.brokerIsActive(a) ? 1 : 0;
  const activeB = brokerAuth.brokerIsActive(b) ? 1 : 0;
  if (activeB !== activeA) return activeB > activeA ? b : a;
  const phoneA = normalizeBrazilWhatsApp(a.phone) ? 1 : 0;
  const phoneB = normalizeBrazilWhatsApp(b.phone) ? 1 : 0;
  if (phoneB !== phoneA) return phoneB > phoneA ? b : a;
  const adminA = a.isAdmin ? 1 : 0;
  const adminB = b.isAdmin ? 1 : 0;
  if (adminB !== adminA) return adminB > adminA ? b : a;
  const timeA = new Date(a.createdAt || 0).getTime();
  const timeB = new Date(b.createdAt || 0).getTime();
  return timeB >= timeA ? b : a;
}

function countActiveBrokerDuplicates(brokers) {
  const active = brokers.filter(function(b) { return brokerAuth.brokerIsActive(b); });
  const byEmail = {};
  let dupes = 0;
  active.forEach(function(b) {
    const email = String(b.email || '').trim().toLowerCase();
    if (!email) return;
    byEmail[email] = (byEmail[email] || 0) + 1;
  });
  Object.keys(byEmail).forEach(function(email) {
    if (byEmail[email] > 1) dupes += byEmail[email] - 1;
  });
  return dupes;
}

function dedupeBrokersByEmail(brokers) {
  const byEmail = {};
  brokers.forEach(function(b) {
    const email = String(b.email || '').trim().toLowerCase();
    if (!email) return;
    if (!byEmail[email]) byEmail[email] = b;
    else byEmail[email] = pickBetterBrokerRow(byEmail[email], b);
  });
  return Object.keys(byEmail).map(function(email) { return byEmail[email]; });
}

async function listBrokerCampaignTargets(db, payload) {
  const snapshot = await db.collection('brokers').get();
  const brokers = snapshot.docs.map(function(doc) {
    return { id: doc.id, ...doc.data() };
  });
  let targetList = dedupeBrokersByEmail(brokers).filter(function(b) {
    return brokerAuth.brokerIsActive(b) && !b.whatsappCampaignOptOut;
  });
  if (payload && payload.brokerId) {
    targetList = targetList.filter(function(b) {
      return String(b.id) === String(payload.brokerId);
    });
  } else if (payload && payload.phone) {
    const normPhone = normalizeBrazilWhatsApp(payload.phone);
    targetList = targetList.filter(function(b) {
      return normalizeBrazilWhatsApp(b.phone) === normPhone;
    });
  }
  return targetList;
}

async function commitBatches(db, updates) {
  const BATCH_LIMIT = 400;
  let i = 0;
  while (i < updates.length) {
    const batch = db.batch();
    let ops = 0;
    while (i < updates.length && ops < BATCH_LIMIT) {
      const u = updates[i];
      batch.update(u.ref, u.data);
      ops += 1;
      i += 1;
    }
    await batch.commit();
  }
}

async function cleanupBrokerDuplicatesInternal(db, options) {
  options = options || {};
  const snapshot = await db.collection('brokers').get();
  const byEmail = {};
  snapshot.docs.forEach(function(doc) {
    const d = doc.data() || {};
    const email = String(d.email || '').trim().toLowerCase();
    if (!email) return;
    if (!byEmail[email]) byEmail[email] = [];
    byEmail[email].push({ id: doc.id, ref: doc.ref, data: d });
  });

  let deactivated = 0;
  const pendingUpdates = [];
  const keeperIds = {};

  Object.keys(byEmail).forEach(function(email) {
    const rows = byEmail[email];
    if (rows.length <= 1) {
      keeperIds[email] = rows[0].id;
      return;
    }
    rows.sort(function(a, b) {
      const pa = normalizeBrazilWhatsApp(a.data.phone) ? 1 : 0;
      const pb = normalizeBrazilWhatsApp(b.data.phone) ? 1 : 0;
      if (pb !== pa) return pb - pa;
      const aa = a.data.isAdmin ? 1 : 0;
      const ab = b.data.isAdmin ? 1 : 0;
      if (ab !== aa) return ab - aa;
      return new Date(b.data.createdAt || 0).getTime() - new Date(a.data.createdAt || 0).getTime();
    });
    const keeper = rows[0];
    keeperIds[email] = keeper.id;
    rows.forEach(function(row) {
      if (row.id === keeper.id) return;
      pendingUpdates.push({
        ref: row.ref,
        data: {
          isActive: false,
          duplicateOf: keeper.id,
          updatedAt: new Date().toISOString(),
        },
      });
      deactivated += 1;
    });
  });

  snapshot.docs.forEach(function(doc) {
    const d = doc.data() || {};
    const email = String(d.email || '').trim().toLowerCase();
    if (!email || keeperIds[email] !== doc.id) return;
    if (!brokerAuth.brokerIsActive(d)) return;
    if (normalizeBrazilWhatsApp(d.phone)) return;
    pendingUpdates.push({
      ref: doc.ref,
      data: {
        isActive: false,
        inactiveReason: 'sem_telefone_whatsapp',
        updatedAt: new Date().toISOString(),
      },
    });
    deactivated += 1;
  });

  if (pendingUpdates.length) await commitBatches(db, pendingUpdates);

  let purged = 0;
  if (options.purgeArchived) {
    purged = await purgeArchivedBrokerDuplicatesInternal(db);
  }

  return {
    uniqueEmails: Object.keys(byEmail).length,
    duplicatesDeactivated: deactivated,
    archivedPurged: purged,
  };
}

async function purgeArchivedBrokerDuplicatesInternal(db) {
  let total = 0;
  let hasMore = true;
  while (hasMore) {
    const snap = await db.collection('brokers')
      .where('isActive', '==', false)
      .limit(400)
      .get();
    if (snap.empty) {
      hasMore = false;
      break;
    }
    const batch = db.batch();
    let ops = 0;
    snap.docs.forEach(function(doc) {
      const d = doc.data() || {};
      if (!d.duplicateOf && d.inactiveReason !== 'sem_telefone_whatsapp') return;
      batch.delete(doc.ref);
      ops += 1;
      total += 1;
    });
    if (ops === 0) {
      hasMore = false;
      break;
    }
    await batch.commit();
    if (snap.size < 400) hasMore = false;
  }
  return total;
}

async function buildBrokerPhoneIndex(db) {
  const snapshot = await db.collection('brokers').get();
  const index = {};
  snapshot.docs.forEach(function(doc) {
    const data = doc.data() || {};
    const entry = { id: doc.id, name: data.name || '', isActive: brokerAuth.brokerIsActive(data) };
    const keys = brokerPhoneMatchKeys(data.phone);
    if (!keys.length) {
      const fallback = normalizeBrazilWhatsApp(data.phone);
      if (fallback) keys.push(fallback);
    }
    keys.forEach(function(phone) {
      if (!index[phone] || entry.isActive) index[phone] = entry;
    });
  });
  return index;
}

/** Procura corretor no índice tolerando o 9º dígito. */
function lookupBrokerInIndex(index, rawPhone) {
  if (!index) return null;
  const keys = brokerPhoneMatchKeys(rawPhone);
  var i;
  for (i = 0; i < keys.length; i++) {
    if (index[keys[i]]) return index[keys[i]];
  }
  const fallback = normalizeBrazilWhatsApp(rawPhone);
  if (fallback && index[fallback]) return index[fallback];
  return null;
}

async function loadWhatsappSettings(db) {
  if (!db) return {};
  try {
    const snap = await db.collection('settings').doc('whatsapp').get();
    return snap.exists ? (snap.data() || {}) : {};
  } catch (e) {
    return {};
  }
}

async function loadWhatsappWabaId(db) {
  const s = await loadWhatsappSettings(db);
  return s.wabaId ? String(s.wabaId).trim() : '';
}

async function loadWhatsappCampaignPhoneId(db) {
  const s = await loadWhatsappSettings(db);
  return s.phoneNumberId ? String(s.phoneNumberId).trim() : '';
}

async function saveWhatsappSettings(db, patch) {
  if (!db || !patch) return;
  await db.collection('settings').doc('whatsapp').set(
    Object.assign({}, patch, { updatedAt: new Date().toISOString() }),
    { merge: true }
  );
}

async function saveWhatsappWabaId(db, wabaId, source) {
  if (!db || !wabaId) return;
  await saveWhatsappSettings(db, { wabaId: String(wabaId).trim(), wabaSource: source || '' });
}

function normalizePhoneDigitsForMatch(raw) {
  return String(raw || '').replace(/\D/g, '');
}

function pickBiaPhoneNumberId(phones, preferId, hintDigits) {
  if (!phones || !phones.length) return '';
  var i;
  var p;
  if (preferId) {
    for (i = 0; i < phones.length; i++) {
      if (String(phones[i].id) === String(preferId)) return String(phones[i].id);
    }
  }
  if (hintDigits && hintDigits.length >= 8) {
    for (i = 0; i < phones.length; i++) {
      p = phones[i];
      var disp = normalizePhoneDigitsForMatch(p.display_phone_number);
      if (disp && disp.indexOf(hintDigits.slice(-8)) >= 0) return String(p.id);
    }
  }
  return phones[0] && phones[0].id ? String(phones[0].id) : '';
}

/**
 * Descobre o par correto: WABA (conta) + phone_number_id (número da Bia).
 * A Bia no webhook já grava lastWebhookPhoneNumberId — é a fonte mais confiável.
 */
async function syncWhatsAppCloudSettings(db, options) {
  options = options || {};
  const settings = await loadWhatsappSettings(db);
  let wabaId = String(options.wabaId || settings.wabaId || '').trim();
  const envPhoneId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const lastWebhookPhone = String(settings.lastWebhookPhoneNumberId || '').trim();
  const token = process.env.WHATSAPP_TOKEN;
  const hintDigits = normalizePhoneDigitsForMatch(
    options.supportPhone || settings.supportPhoneHint || '21997590814'
  );

  if (!token) {
    return { ok: false, error: 'WHATSAPP_TOKEN não configurado no Firebase.' };
  }

  var phones = [];
  var resolvedPhoneId = '';
  var syncSource = '';
  var envMisconfiguredAsWaba = envPhoneId && wabaId && envPhoneId === wabaId;

  /* Secret Firebase = phone_number_id da Bia (ex.: 1088658444328108) */
  if (envPhoneId) {
    var envPhoneNode = await resolvePhoneNodeToWaba(token, envPhoneId);
    if (envPhoneNode && envPhoneNode.phoneNumberId) {
      if (envPhoneNode.wabaId) wabaId = envPhoneNode.wabaId;
      resolvedPhoneId = envPhoneNode.phoneNumberId;
      syncSource = 'firebase_secret_phone_node';
      envMisconfiguredAsWaba = false;
      phones = wabaId ? await listWabaPhoneNumbers(token, wabaId) : [];
      if (!phoneDisplay && envPhoneNode.displayPhone) {
        /* usado abaixo via phones ou fetch */
      }
    }
  }

  if (!wabaId && !resolvedPhoneId) {
    return { ok: false, error: 'Informe o ID da conta (WABA) no painel e clique Salvar WABA.' };
  }

  if (!phones.length && wabaId) {
    phones = await listWabaPhoneNumbers(token, wabaId);
  }

  if (!phones.length && wabaId && !resolvedPhoneId) {
    var asPhoneNode = await resolvePhoneNodeToWaba(token, wabaId);
    if (asPhoneNode && asPhoneNode.wabaId) {
      wabaId = asPhoneNode.wabaId;
      resolvedPhoneId = asPhoneNode.phoneNumberId;
      syncSource = 'saved_id_was_phone_number';
      phones = await listWabaPhoneNumbers(token, wabaId);
    }
  }

  if (lastWebhookPhone && !resolvedPhoneId) {
    var webhookLink = await resolveWabaForCloudApiPhone({
      preferredWabaId: wabaId,
      phoneNumberId: lastWebhookPhone,
    });
    if (webhookLink.phoneMatch) {
      wabaId = webhookLink.wabaId || wabaId;
      resolvedPhoneId = lastWebhookPhone;
      syncSource = 'bia_webhook';
      phones = await listWabaPhoneNumbers(token, wabaId);
    }
  }

  if (!resolvedPhoneId && lastWebhookPhone && await phoneBelongsToWaba(token, wabaId, lastWebhookPhone)) {
    resolvedPhoneId = lastWebhookPhone;
    syncSource = 'bia_webhook';
  } else if (!resolvedPhoneId && envPhoneId && !envMisconfiguredAsWaba && await phoneBelongsToWaba(token, wabaId, envPhoneId)) {
    resolvedPhoneId = envPhoneId;
    syncSource = 'firebase_secret';
  } else if (!resolvedPhoneId && (envMisconfiguredAsWaba || !envPhoneId || !(await phoneBelongsToWaba(token, wabaId, envPhoneId)))) {
    resolvedPhoneId = pickBiaPhoneNumberId(phones, lastWebhookPhone, hintDigits);
    syncSource = envMisconfiguredAsWaba ? 'auto_fix_waba_confused_with_phone' : 'auto_from_waba_list';
  }

  if (!resolvedPhoneId || !(await phoneBelongsToWaba(token, wabaId, resolvedPhoneId))) {
    var debugWabas = await resolveAllWabaIdsFromDebugToken(token);
    var dw;
    for (dw = 0; dw < debugWabas.length; dw++) {
      var scanPhones = await listWabaPhoneNumbers(token, debugWabas[dw]);
      var picked = pickBiaPhoneNumberId(scanPhones, lastWebhookPhone, hintDigits);
      if (picked && await phoneBelongsToWaba(token, debugWabas[dw], picked)) {
        wabaId = debugWabas[dw];
        resolvedPhoneId = picked;
        phones = scanPhones;
        syncSource = syncSource || 'auto_scan_all_wabas';
        break;
      }
    }
  }

  if (!resolvedPhoneId || !(await phoneBelongsToWaba(token, wabaId, resolvedPhoneId))) {
    var meAssets = await discoverWhatsAppAssetsFromMe(token);
    if (meAssets.phones && meAssets.phones.length) {
      var mp;
      var best = null;
      for (mp = 0; mp < meAssets.phones.length; mp++) {
        var cand = meAssets.phones[mp];
        var candDigits = normalizePhoneDigitsForMatch(cand.display_phone_number);
        if (hintDigits && candDigits && candDigits.indexOf(hintDigits.slice(-8)) >= 0) {
          best = cand;
          break;
        }
        if (!best) best = cand;
      }
      if (best && best.id) {
        wabaId = best.wabaId || wabaId;
        resolvedPhoneId = best.id;
        phones = await listWabaPhoneNumbers(token, wabaId);
        syncSource = syncSource || 'auto_discover_me';
      } else if (meAssets.wabas && meAssets.wabas.length && !phones.length) {
        wabaId = meAssets.wabas[0];
        phones = await listWabaPhoneNumbers(token, wabaId);
        resolvedPhoneId = pickBiaPhoneNumberId(phones, lastWebhookPhone, hintDigits);
        if (resolvedPhoneId) syncSource = syncSource || 'auto_discover_me_waba';
      }
    }
  }

  var phoneMatch = !!(resolvedPhoneId && await phoneBelongsToWaba(token, wabaId, resolvedPhoneId));
  if (!phoneMatch && resolvedPhoneId && syncSource === 'firebase_secret_phone_node') {
    phoneMatch = true;
  }
  var phoneDisplay = '';
  if (resolvedPhoneId && phones.length) {
    for (var pi = 0; pi < phones.length; pi++) {
      if (String(phones[pi].id) === String(resolvedPhoneId)) {
        phoneDisplay = phones[pi].display_phone_number || '';
        break;
      }
    }
  }

  /* Meta envia phone_number_id no webhook — se a Bia já responde, confiar mesmo sem listar /phone_numbers */
  var webhookTrusted = !!(lastWebhookPhone && settings.lastWebhookPhoneAt);
  if (!phoneMatch && webhookTrusted && lastWebhookPhone) {
    resolvedPhoneId = lastWebhookPhone;
    syncSource = syncSource || 'bia_webhook_trusted';
    phoneMatch = true;
    envMisconfiguredAsWaba = false;
    if (!phoneDisplay) {
      try {
        const axios = require('axios');
        const pr = await axios.get('https://graph.facebook.com/v22.0/' + resolvedPhoneId, {
          params: { fields: 'display_phone_number,verified_name' },
          headers: { Authorization: 'Bearer ' + token },
        });
        phoneDisplay = (pr.data && pr.data.display_phone_number) || '';
      } catch (dispErr) {
        /* opcional */
      }
    }
  }

  if (resolvedPhoneId && phoneMatch) {
    await saveWhatsappSettings(db, {
      wabaId: wabaId || resolvedPhoneId,
      phoneNumberId: resolvedPhoneId,
      phoneDisplay: phoneDisplay,
      syncSource: syncSource,
      envPhoneNumberId: envPhoneId,
      envMisconfiguredAsWaba: envMisconfiguredAsWaba,
      supportPhoneHint: hintDigits,
    });
  }

  return {
    ok: phoneMatch,
    wabaId: wabaId,
    phoneNumberId: resolvedPhoneId,
    phoneDisplay: phoneDisplay,
    phoneMatch: phoneMatch,
    syncSource: syncSource,
    envPhoneNumberId: envPhoneId,
    envMisconfiguredAsWaba: envMisconfiguredAsWaba,
    lastWebhookPhoneNumberId: lastWebhookPhone,
    phonesOnWaba: phones,
    webhookTrusted: webhookTrusted,
    phoneLinkError: phoneMatch ? '' : 'Não foi possível vincular o número da Bia a esta conta WABA.',
  };
}

async function getOrResolveWabaId(db) {
  const cached = await loadWhatsappWabaId(db);
  const campaignPhone = await loadWhatsappCampaignPhoneId(db);
  const sync = await syncWhatsAppCloudSettings(db, { wabaId: cached });
  const phoneId = sync.phoneNumberId || campaignPhone;
  const phoneMatch = sync.phoneMatch;
  return {
    wabaId: sync.wabaId || cached,
    source: sync.syncSource || 'sync',
    phoneMatch: phoneMatch,
    phoneNumberId: phoneId,
    campaignPhoneNumberId: phoneId,
    phoneDisplay: sync.phoneDisplay || '',
    envMisconfiguredAsWaba: sync.envMisconfiguredAsWaba,
    phonesOnWaba: sync.phonesOnWaba || [],
    phoneLinkError: sync.phoneLinkError || '',
    syncSource: sync.syncSource || '',
    syncHint: (sync.syncSource === 'bia_webhook_trusted' || sync.syncSource === 'bia_webhook')
      ? 'Número da Bia confirmado pelo WhatsApp (webhook). Campanha usa o mesmo número do atendimento.'
      : (sync.syncSource === 'firebase_secret_phone_node'
        ? 'Número da Bia vinculado pelo Phone number ID do Firebase (' + (phoneId || '') + ').'
        : (sync.envMisconfiguredAsWaba
          ? 'Ajuste WHATSAPP_PHONE_NUMBER_ID no Firebase para o Phone number ID da Meta (API Setup).'
          : '')),
  };
}

async function getBrokerCampaignTemplateStatus(config, db) {
  const rawName = String(config.templateName || '').trim();
  const templateName = normalizeTemplateName(rawName);
  if (!templateName) {
    return {
      templateName: '',
      templateValid: false,
      templateHint: 'Sem template: só funciona se o corretor falou com a Bia nas últimas 24h. Para campanha em massa, crie um template Marketing aprovado na Meta.',
      approvedTemplates: [],
    };
  }
  const wabaResolved = await getOrResolveWabaId(db);
  if (wabaResolved.wabaId && !wabaResolved.phoneMatch) {
    var phoneList = '';
    if (wabaResolved.phonesOnWaba && wabaResolved.phonesOnWaba.length) {
      phoneList = ' Números nesta conta: ' + wabaResolved.phonesOnWaba.map(function(p) {
        return p.id + (p.display_phone_number ? ' (' + p.display_phone_number + ')' : '');
      }).join(', ') + '.';
    }
    var waitWebhook = ' Envie qualquer mensagem para a Bia no WhatsApp e clique Salvar WABA de novo (o sistema captura o número certo).';
    return {
      templateName: templateName,
      templateValid: false,
      templateHint: (wabaResolved.phoneLinkError || 'Aguardando vínculo do número da Bia.') + phoneList + waitWebhook,
      approvedTemplates: [],
      wabaId: wabaResolved.wabaId,
      wabaSource: wabaResolved.source || '',
      phoneMatch: false,
      cloudPhoneNumberId: wabaResolved.phoneNumberId || '',
      biaPhoneNumberId: wabaResolved.campaignPhoneNumberId || '',
      phonesOnWaba: wabaResolved.phonesOnWaba || [],
      syncHint: wabaResolved.syncHint || '',
      envMisconfiguredAsWaba: !!wabaResolved.envMisconfiguredAsWaba,
    };
  }
  var tplListOpts = {};
  var campaignPhone = wabaResolved.campaignPhoneNumberId || wabaResolved.phoneNumberId || '';
  if (campaignPhone) tplListOpts.phoneNumberId = campaignPhone;
  if (wabaResolved.wabaId && wabaResolved.wabaId !== campaignPhone) {
    tplListOpts.wabaId = wabaResolved.wabaId;
  }
  const listed = await listApprovedMessageTemplates(tplListOpts);
  const approved = listed.ok ? listed.templates : [];
  const nameMatches = findApprovedTemplatesByName(approved, templateName);
  const match = nameMatches.length
    ? nameMatches[0]
    : findApprovedTemplate(approved, templateName, config.templateLanguage || 'pt_BR');
  var hint = '';
  var allowSendWithoutList = wabaResolved.phoneMatch && !!campaignPhone;
  if (!listed.ok) {
    if (allowSendWithoutList) {
      hint = 'Número da Bia OK (' + (wabaResolved.phoneDisplay || campaignPhone) +
        '). O template será validado no envio. Se não chegar, confira campanha_corretor_msg aprovado na Meta.';
    } else {
      hint = 'Não foi possível validar na Meta: ' + (listed.error || '') +
        '. Cole o ID da conta (WABA) do WhatsApp Manager no campo abaixo e clique Salvar WABA.';
    }
  } else if (!match) {
    hint = 'Template "' + templateName + '" não encontrado como APROVADO em pt_BR. O nome no painel deve ser idêntico ao da Meta (só minúsculas e _).';
    if (approved.length) {
      var names = [];
      var ni;
      for (ni = 0; ni < approved.length && names.length < 8; ni++) {
        if (names.indexOf(approved[ni].name) < 0) names.push(approved[ni].name);
      }
      if (names.length) hint += ' Aprovados: ' + names.join(', ') + '.';
    }
  } else {
    hint = 'Template OK: ' + match.name + ' (' + match.language + ').';
    if (match.bodyVariableCount != null) {
      hint += ' Variáveis no corpo: ' + match.bodyVariableCount + '.';
    }
    if (wabaResolved.syncHint) hint += ' ' + wabaResolved.syncHint;
    if (wabaResolved.phoneDisplay) {
      hint += ' Número da Bia: ' + wabaResolved.phoneDisplay + ' (ID ' + wabaResolved.campaignPhoneNumberId + ').';
    }
    if (match.language && db) {
      await db.collection('broker_campaign').doc('config').set({
        templateLanguageResolved: match.language,
        templateBodyVariableCount: match.bodyVariableCount != null ? match.bodyVariableCount : undefined,
        templateTotalVariableCount: match.totalVariableCount != null ? match.totalVariableCount : undefined,
      }, { merge: true });
    }
  }
  var templateLanguages = [];
  var mi;
  for (mi = 0; mi < nameMatches.length; mi++) {
    if (nameMatches[mi].language && templateLanguages.indexOf(nameMatches[mi].language) < 0) {
      templateLanguages.push(nameMatches[mi].language);
    }
  }
  return {
    templateName: templateName,
    templateValid: (!!match || allowSendWithoutList) && wabaResolved.phoneMatch !== false,
    templateValidationSoft: !match && allowSendWithoutList,
    templateLanguageResolved: match ? match.language : (config.templateLanguage || 'pt_BR'),
    templateBodyVariableCount: match && match.bodyVariableCount != null
      ? match.bodyVariableCount
      : (templateName === 'campanha_corretor_msg' ? 1 : (templateName === 'atualizacao_semanal_corretor' ? 5 : null)),
    templateTotalVariableCount: match && match.totalVariableCount != null ? match.totalVariableCount : null,
    templateLanguages: templateLanguages,
    templateHint: hint,
    approvedTemplates: approved.slice(0, 40),
    wabaId: wabaResolved.wabaId || '',
    wabaSource: wabaResolved.source || '',
    phoneMatch: wabaResolved.phoneMatch !== false,
    cloudPhoneNumberId: wabaResolved.campaignPhoneNumberId || wabaResolved.phoneNumberId || '',
    biaPhoneNumberId: wabaResolved.campaignPhoneNumberId || '',
    biaPhoneDisplay: wabaResolved.phoneDisplay || '',
    envMisconfiguredAsWaba: !!wabaResolved.envMisconfiguredAsWaba,
    syncHint: wabaResolved.syncHint || '',
    phonesOnWaba: wabaResolved.phonesOnWaba || [],
  };
}

async function getBrokerCampaignPreview(db, opts) {
  opts = opts || {};
  var config = await getBrokerCampaignConfig(db);
  if (opts.featuredPropertyId !== undefined) {
    var fp = opts.featuredPropertyId;
    config = Object.assign({}, config, {
      featuredPropertyId: (fp === '' || fp === null || fp === undefined) ? null : Number(fp),
    });
  }
  const templateStatus = await getBrokerCampaignTemplateStatus(config, db);
  const targetList = await listBrokerCampaignTargets(db, {});
  let eligible = 0;
  let invalidPhone = 0;
  targetList.forEach(function(b) {
    if (normalizeBrazilWhatsApp(b.phone)) eligible += 1;
    else invalidPhone += 1;
  });
  let optOutCount = 0;
  const allBrokers = (await db.collection('brokers').get()).docs.map(function(doc) {
    return { id: doc.id, ...doc.data() };
  });
  dedupeBrokersByEmail(allBrokers).forEach(function(b) {
    if (b.whatsappCampaignOptOut && brokerAuth.brokerIsActive(b)) optOutCount += 1;
  });
  const activeDuplicateRecords = countActiveBrokerDuplicates(allBrokers);
  const archivedInactiveRecords = allBrokers.filter(function(b) {
    return !brokerAuth.brokerIsActive(b);
  }).length;
  const readyToSend = eligible;
  const hasTpl = !!(templateStatus.templateName);
  const isReady = readyToSend > 0 && activeDuplicateRecords === 0 &&
    (!hasTpl || templateStatus.templateValid);
  const waAccount = await getWhatsAppAccountInfo({
    phoneNumberId: templateStatus.biaPhoneNumberId || templateStatus.cloudPhoneNumberId || '',
  });
  var prodMigration = buildWhatsAppProductionMigrationStatus(waAccount, templateStatus, config);
  return {
    enabled: !!config.enabled,
    totalActiveNotOptOut: targetList.length,
    eligible: eligible,
    readyToSend: readyToSend,
    isReady: isReady,
    invalidPhone: invalidPhone,
    optOut: optOutCount,
    duplicateRecordsInDb: activeDuplicateRecords,
    archivedInactiveRecords: archivedInactiveRecords,
    templateName: templateStatus.templateName || config.templateName || '',
    hasTemplate: !!(templateStatus.templateName),
    templateValid: templateStatus.templateValid,
    templateHint: templateStatus.templateHint,
    templateLanguageResolved: templateStatus.templateLanguageResolved || '',
    approvedTemplateNames: (templateStatus.approvedTemplates || []).map(function(t) { return t.name; }),
    wabaId: templateStatus.wabaId || (await loadWhatsappWabaId(db)) || '',
    wabaSource: templateStatus.wabaSource || '',
    whatsappTestAccount: !!(waAccount.ok && waAccount.isLikelyTestAccount),
    whatsappAccountName: waAccount.ok ? (waAccount.wabaName || waAccount.verifiedName || '') : '',
    whatsappTestAccountHint: waAccount.ok && waAccount.isLikelyTestAccount
      ? 'Conta Meta de TESTE: cadastre cada celular de corretor em developers.facebook.com → seu app → WhatsApp → API Setup → números de teste. Sem isso a API aceita mas não entrega (0 no painel Meta).'
      : '',
    productionMigration: prodMigration,
    nextWeeklyNote: config.enabled
      ? 'Segunda-feira 08:00 (Brasília): envio automático para quem está ativo, com campanha ligada e telefone válido.'
      : 'Envio automático desligado. Disparar agora envia manualmente quando você quiser.',
    biaPhoneNumberId: templateStatus.biaPhoneNumberId || '',
    biaPhoneDisplay: templateStatus.biaPhoneDisplay || '',
    cloudPhoneNumberId: templateStatus.cloudPhoneNumberId || '',
    phoneMatch: templateStatus.phoneMatch !== false,
    syncHint: templateStatus.syncHint || '',
    envMisconfiguredAsWaba: !!templateStatus.envMisconfiguredAsWaba,
    phonesOnWaba: (templateStatus.phonesOnWaba || []).map(function(p) {
      return { id: p.id, display_phone_number: p.display_phone_number || '' };
    }),
    campaignWeek: brokerCampaignContent.getCampaignWeekPreview(new Date(), config),
    campaignProperties: brokerCampaignContent.getCampaignPropertiesForAdmin(),
    featuredPropertyId: config.featuredPropertyId != null ? config.featuredPropertyId : null,
    marketNewsTitle: config.marketNewsTitle || '',
    marketNewsText: config.marketNewsText || '',
  };
}

function buildWhatsAppProductionMigrationStatus(waAccount, templateStatus, config) {
  var displayPhone = (waAccount && waAccount.displayPhone) ||
    (templateStatus && templateStatus.biaPhoneDisplay) || '';
  var isTest = !!(waAccount && waAccount.ok && waAccount.isLikelyTestAccount);
  var isBiaNumber = !!(waAccount && waAccount.isBiaProductionNumber);
  if (!isBiaNumber && displayPhone) {
    var digits = displayPhone.replace(/\D/g, '');
    isBiaNumber = digits.indexOf('997590814') >= 0;
  }
  var hasPhoneId = !!(templateStatus && (templateStatus.biaPhoneNumberId || templateStatus.cloudPhoneNumberId));
  var reviewOk = waAccount && waAccount.accountReviewStatus &&
    String(waAccount.accountReviewStatus).toUpperCase() === 'APPROVED';
  var productionReady = !isTest && isBiaNumber && hasPhoneId;
  var biaDisplay = '(21) 99759-0814';
  var steps = [
    {
      id: 'business',
      label: 'Verificar o negócio B F Marques no Meta Business (business.facebook.com → Configurações → Informações da empresa)',
      done: reviewOk || productionReady,
      link: 'https://business.facebook.com/settings/info',
    },
    {
      id: 'free_number',
      label: 'Liberar o número da Bia (' + biaDisplay + ') — se estiver no WhatsApp comum/Business app, use Migração de número ou exclua a conta do app antes de registrar na API',
      done: isBiaNumber,
      link: 'https://business.facebook.com/wa/manage/phone-numbers/',
    },
    {
      id: 'register_production',
      label: 'WhatsApp Manager → Adicionar número → verificar por SMS/ligação → aguardar status Conectado',
      done: isBiaNumber && !isTest,
      link: 'https://business.facebook.com/wa/manage/phone-numbers/',
    },
    {
      id: 'phone_id',
      label: 'Phone number ID da Bia (1088658444328108) no Firebase — WHATSAPP_PHONE_NUMBER_ID',
      done: hasPhoneId && isBiaNumber,
      link: 'https://developers.facebook.com/apps/',
    },
    {
      id: 'token',
      label: 'Token permanente (Meta Business → Usuários do sistema → Gerar token com whatsapp_business_messaging)',
      done: hasPhoneId && !isTest,
      link: 'https://business.facebook.com/settings/system-users',
    },
    {
      id: 'payment',
      label: 'Forma de pagamento / linha de crédito no Meta Business (obrigatório para campanhas Marketing em produção)',
      done: false,
      link: 'https://business.facebook.com/billing_hub/accounts',
    },
    {
      id: 'webhook',
      label: 'Webhook já aponta para chatbotWebhook — confirme campo messages assinado na Meta',
      done: hasPhoneId,
      link: 'https://developers.facebook.com/apps/',
    },
    {
      id: 'admin_sync',
      label: 'No painel: Corretores → Salvar WABA → Testar envio para um corretor',
      done: productionReady,
      link: '',
    },
  ];
  var pending = 0;
  var si;
  for (si = 0; si < steps.length; si++) {
    if (!steps[si].done) pending += 1;
  }
  return {
    needed: !productionReady,
    productionReady: productionReady,
    isTestAccount: isTest,
    isBiaProductionNumber: isBiaNumber,
    displayPhone: displayPhone,
    accountReviewStatus: (waAccount && waAccount.accountReviewStatus) || '',
    pendingSteps: pending,
    summary: productionReady
      ? 'Conta em produção: campanhas entregam para qualquer corretor com WhatsApp válido.'
      : (isTest
        ? 'Conta de TESTE ativa — corretores só recebem se o celular estiver em API Setup → números de teste. Siga os passos abaixo para produção.'
        : 'Migre o número da Bia para produção na Meta para entregar campanhas a todos os corretores.'),
    steps: steps,
  };
}

async function prepareBrokersCampaignBase(db, options) {
  options = options || {};
  const previewBefore = await getBrokerCampaignPreview(db);
  let cleanupResult = null;
  if (options.runCleanup !== false) {
    const needCleanup = previewBefore.duplicateRecordsInDb > 0 ||
      previewBefore.archivedInactiveRecords > 0 ||
      !!options.forceCleanup;
    if (needCleanup) {
      cleanupResult = await cleanupBrokerDuplicatesInternal(db, {
        purgeArchived: previewBefore.archivedInactiveRecords > 0 || !!options.purgeArchived,
      });
    }
  }
  const defaults = getDefaultBrokerCampaignConfig();
  const existingCfg = (await db.collection('broker_campaign').doc('config').get()).data() || {};
  await db.collection('broker_campaign').doc('config').set({
    siteUrl: defaults.siteUrl,
    whatsappContato: defaults.whatsappContato,
    weeklyTitle: defaults.weeklyTitle,
    ctaText: defaults.ctaText,
    usefulTips: defaults.usefulTips,
    templateLanguage: defaults.templateLanguage,
    templateName: existingCfg.templateName || defaults.templateName,
    enabled: existingCfg.enabled !== undefined ? existingCfg.enabled : defaults.enabled,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
  const preview = await getBrokerCampaignPreview(db);
  return {
    preview: preview,
    cleanup: cleanupResult,
  };
}

function getWeekOfYearNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function getCampaignRunWeekKey(now) {
  var d = now || new Date();
  return String(d.getFullYear()) + '-W' + getWeekOfYearNumber(d);
}

function getDefaultBrokerCampaignConfig() {
  return {
    enabled: true,
    siteUrl: 'https://bfmarquesempreendimentos.github.io/bfm/',
    whatsappContato: '(21) 99555-7010',
    skipMetaTemplate: false,
    campaignMaxImages: 2,
    campaignMaxVideos: 1,
    featuredPropertyId: null,
    marketNewsTitle: '',
    marketNewsText: '',
    templateName: 'campanha_corretor_msg',
    templateNameMulti: 'campanha_corretor_msg4',
    preferMultiVarTemplate: true,
    templateMediaImageName: 'campanha_corretor_foto2',
    templateMediaVideoName: 'campanha_corretor_video2',
    templateLanguage: 'pt_BR',
    weeklyTitle: 'Atualização semanal B F Marques',
    ctaText: 'Divulgue as ofertas da semana para seus leads e traga sua visita agendada.',
    usefulTips: [
      'Dica MCMV: confirme renda bruta familiar e nome limpo antes da simulação.',
      'Sempre responda o lead no mesmo dia. Rapidez aumenta conversão.',
      'Ao enviar opções, termine com convite objetivo para visita.',
      'Use prova social: destaque entregas e qualidade de acabamento.',
      'Reforce benefício: ITBI e registro grátis quando aplicável.'
    ],
    updatedAt: new Date().toISOString(),
  };
}

function normalizeCampaignContactPhone(contato) {
  var raw = String(contato || '').trim();
  var digits = raw.replace(/\D/g, '');
  if (!digits) return '(21) 99555-7010';
  if (digits.indexOf('995557010') >= 0 || digits.indexOf('996557010') >= 0) {
    return '(21) 99555-7010';
  }
  if (digits.indexOf('997590814') >= 0) {
    return '(21) 99555-7010';
  }
  return raw;
}

async function brokerHasWhatsAppSessionWindow(db, waPhone) {
  if (!db || !waPhone) return false;
  try {
    var lead = await getLeadByPhone(waPhone);
    if (!lead) return false;
    var lastUser = lead.lastUserMessageAt || lead.lastMessageAt || lead.updatedAt;
    if (!lastUser) return false;
    var age = Date.now() - new Date(lastUser).getTime();
    return age >= 0 && age < 24 * 60 * 60 * 1000;
  } catch (e) {
    return false;
  }
}

function migrateBrokerCampaignMediaTemplateNames(config) {
  var updates = {};
  var image = String((config && config.templateMediaImageName) || '').trim();
  var video = String((config && config.templateMediaVideoName) || '').trim();
  if (!image || image === 'campanha_corretor_foto') {
    updates.templateMediaImageName = 'campanha_corretor_foto2';
    config.templateMediaImageName = 'campanha_corretor_foto2';
  }
  if (!video || video === 'campanha_corretor_video') {
    updates.templateMediaVideoName = 'campanha_corretor_video2';
    config.templateMediaVideoName = 'campanha_corretor_video2';
  }
  return updates;
}

async function getBrokerCampaignConfig(db) {
  const ref = db.collection('broker_campaign').doc('config');
  const snap = await ref.get();
  if (!snap.exists) {
    const defaults = getDefaultBrokerCampaignConfig();
    await ref.set(defaults, { merge: true });
    return defaults;
  }
  const current = snap.data() || {};
  var merged = { ...getDefaultBrokerCampaignConfig(), ...current };
  var persist = {};
  var fixedContact = normalizeCampaignContactPhone(merged.whatsappContato);
  if (fixedContact !== merged.whatsappContato) {
    merged.whatsappContato = fixedContact;
    persist.whatsappContato = fixedContact;
  }
  var mediaTplUpdates = migrateBrokerCampaignMediaTemplateNames(merged);
  Object.keys(mediaTplUpdates).forEach(function(k) {
    persist[k] = mediaTplUpdates[k];
  });
  if (current.featuredPropertyId === undefined) {
    merged.featuredPropertyId = null;
  }
  if (current.templateNameMulti === undefined && !merged.templateNameMulti) {
    merged.templateNameMulti = 'campanha_corretor_msg4';
    persist.templateNameMulti = 'campanha_corretor_msg4';
  }
  if (current.preferMultiVarTemplate === undefined && merged.preferMultiVarTemplate == null) {
    merged.preferMultiVarTemplate = true;
    persist.preferMultiVarTemplate = true;
  }
  if (current.skipMetaTemplate === undefined || current.skipMetaTemplate === true) {
    merged.skipMetaTemplate = false;
    persist.skipMetaTemplate = false;
  }
  if (Object.keys(persist).length) {
    persist.updatedAt = new Date().toISOString();
    await ref.set(persist, { merge: true });
  }
  return merged;
}

function buildBrokerCampaignTemplateComponents(config, broker, now) {
  const week = getWeekOfYearNumber(now);
  const tips = Array.isArray(config.usefulTips) ? config.usefulTips : [];
  const tip = tips.length ? tips[(week - 1) % tips.length] : '';
  const firstName = String((broker && broker.name) || '').trim().split(' ')[0] || 'Corretor(a)';
  const params = [
    firstName,
    config.weeklyTitle || 'Atualização semanal B F Marques',
    config.siteUrl || 'https://bfmarquesempreendimentos.github.io/bfm/',
    tip || (config.ctaText || 'Fale com seus leads hoje.'),
    config.whatsappContato || '(21) 99555-7010',
  ];
  return [{
    type: 'body',
    parameters: params.map(function(p) {
      return { type: 'text', text: String(p).substring(0, 900) };
    }),
  }];
}

function buildCampanhaCorretorSingleVarBody(config, broker, now) {
  return brokerCampaignContent.buildTemplateVar1Components(config, broker, now, 0);
}

async function sendCampanhaCorretorTemplateMsg4(waPhone, templateName, lang, waSendOpts, config, broker, now) {
  var candidates = brokerCampaignContent.getCampanhaCorretorMsg4Candidates(config, broker, now);
  var vi;
  var lastErr = null;
  for (vi = 0; vi < candidates.length; vi++) {
    try {
      var v = candidates[vi];
      var stripNl = function(t) {
        return String(t || '').replace(/\r\n/g, ' ').replace(/\n/g, ' ').replace(/ {2,}/g, ' ').trim();
      };
      var comps = [{
        type: 'body',
        parameters: [
          { type: 'text', text: stripNl(v.week) },
          { type: 'text', text: stripNl(v.firstName) },
          { type: 'text', text: stripNl(v.propertyBlock) },
          { type: 'text', text: stripNl(v.propertyUrl) },
          { type: 'text', text: stripNl(v.portfolioUrl) },
          { type: 'text', text: stripNl(v.footerBlock) },
        ],
      }];
      var resp = await sendTemplateMessage(waPhone, templateName, lang, comps, waSendOpts);
      return {
        mode: 'template',
        templateName: templateName,
        language: lang,
        componentsVariant: 'msg4_try_' + vi,
        waMessageId: resp && resp.messageId ? resp.messageId : '',
        sentTo: waPhone,
        templateVarCount: 6,
      };
    } catch (errTry) {
      lastErr = errTry;
      var errMsg = errTry.message || extractMetaError(errTry);
      if (!isTemplateParamValidationError(errMsg) && !isTemplateParamCountError(errMsg) &&
          !isTemplateNameOrLanguageError(errMsg)) {
        throw errTry;
      }
    }
  }
  var detail = lastErr ? (lastErr.message || extractMetaError(lastErr)) : 'erro desconhecido';
  throw new Error(
    'Template "' + templateName + '" rejeitado pela Meta: ' + detail +
    ' Cadastre campanha_corretor_msg4 com 6 variaveis (veja TEMPLATE-CAMPANHA-CORRETORES-META.md).'
  );
}

async function sendCampanhaCorretorTemplateVar1(waPhone, templateName, lang, waSendOpts, config, broker, now) {
  var candidates = brokerCampaignContent.getTemplateVar1Candidates(config, broker, now);
  var vi;
  var lastErr = null;
  for (vi = 0; vi < candidates.length; vi++) {
    try {
      var comps = [{
        type: 'body',
        parameters: [{ type: 'text', text: candidates[vi] }],
      }];
      var resp = await sendTemplateMessage(waPhone, templateName, lang, comps, waSendOpts);
      return {
        mode: 'template',
        templateName: templateName,
        language: lang,
        componentsVariant: 'var1_try_' + vi,
        waMessageId: resp && resp.messageId ? resp.messageId : '',
        sentTo: waPhone,
        templateVar1Length: candidates[vi].length,
      };
    } catch (errTry) {
      lastErr = errTry;
      var errMsg = errTry.message || extractMetaError(errTry);
      if (!isTemplateParamValidationError(errMsg) && !isTemplateParamCountError(errMsg) &&
          !isTemplateNameOrLanguageError(errMsg)) {
        throw errTry;
      }
    }
  }
  var detail = lastErr ? (lastErr.message || extractMetaError(lastErr)) : 'erro desconhecido';
  throw new Error(
    'Template "' + templateName + '" rejeitado pela Meta: ' + detail +
    ' Confira se o corpo tem {{1}} entre as linhas fixas (veja TEMPLATE-CAMPANHA-CORRETORES-META.md).'
  );
}

function getBrokerCampaignFillTexts(config, broker, now) {
  const week = getWeekOfYearNumber(now);
  const tips = Array.isArray(config.usefulTips) ? config.usefulTips : [];
  const tip = tips.length ? tips[(week - 1) % tips.length] : '';
  const firstName = String((broker && broker.name) || '').trim().split(' ')[0] || 'Corretor(a)';
  const singleBody = brokerCampaignContent.buildRichCampaignSingleBody(config, broker, now);
  return {
    weeklyTitle: config.weeklyTitle || 'Atualização semanal B F Marques',
    singleBody: singleBody,
    namedParams: [
      firstName,
      config.weeklyTitle || 'Atualização semanal B F Marques',
      config.siteUrl || 'https://bfmarquesempreendimentos.github.io/bfm/',
      tip || (config.ctaText || 'Fale com seus leads hoje.'),
      config.whatsappContato || '(21) 99555-7010',
    ],
    headerTexts: [config.weeklyTitle || 'Atualização semanal B F Marques'],
  };
}

function buildBodyOnlyParamSet(n, config, broker, now) {
  var fill = getBrokerCampaignFillTexts(config, broker, now);
  if (n === 1) {
    var single = fill.singleBody || brokerCampaignContent.buildTemplateMarketingVar1(config, broker, now);
    return [{ type: 'body', parameters: [{ type: 'text', text: String(single).substring(0, 1024) }] }];
  }
  var params = [];
  var i;
  for (i = 0; i < n; i++) {
    params.push({
      type: 'text',
      text: String(fill.namedParams[i] != null ? fill.namedParams[i] : fill.namedParams[fill.namedParams.length - 1]).substring(0, 1024),
    });
  }
  return [{ type: 'body', parameters: params }];
}

async function bruteForceBrokerTemplateSend(waPhone, templateName, langCandidates, waSendOpts, config, broker, now) {
  var fill = getBrokerCampaignFillTexts(config, broker, now);
  fill.urlButtonSuffix = 'bfm';
  var tplNorm = normalizeTemplateName(templateName);
  var li0;
  for (li0 = 0; li0 < langCandidates.length; li0++) {
    try {
      var plainComps = [{
        type: 'body',
        parameters: [{
          type: 'text',
          text: brokerCampaignContent.buildTemplateMarketingVar1(config, broker, now),
        }],
      }];
      var plainResp = await sendTemplateMessage(waPhone, templateName, langCandidates[li0], plainComps, waSendOpts);
      return {
        mode: 'template',
        templateName: templateName,
        language: langCandidates[li0],
        componentsVariant: 'marketing_var1_plain',
        waMessageId: plainResp && plainResp.messageId ? plainResp.messageId : '',
        sentTo: waPhone,
      };
    } catch (plainErr) {
      var plainMsg = plainErr.message || extractMetaError(plainErr);
      if (!isTemplateParamValidationError(plainMsg) && !isTemplateNameOrLanguageError(plainMsg)) throw new Error(plainMsg);
    }
    try {
      var richOnly = buildCampanhaCorretorSingleVarBody(config, broker, now);
      var richResp = await sendTemplateMessage(waPhone, templateName, langCandidates[li0], richOnly, waSendOpts);
      return {
        mode: 'template',
        templateName: templateName,
        language: langCandidates[li0],
        componentsVariant: 'rich_single_var',
        waMessageId: richResp && richResp.messageId ? richResp.messageId : '',
        sentTo: waPhone,
      };
    } catch (richErr) {
      var richMsg = richErr.message || extractMetaError(richErr);
      if (!isTemplateParamValidationError(richMsg) && !isTemplateNameOrLanguageError(richMsg)) throw new Error(richMsg);
    }
    try {
      var simpleComps = brokerCampaignContent.buildCampanhaCorretorBodyComponents(config, broker, now, true);
      richResp = await sendTemplateMessage(waPhone, templateName, langCandidates[li0], simpleComps, waSendOpts);
      return {
        mode: 'template',
        templateName: templateName,
        language: langCandidates[li0],
        componentsVariant: 'simple_single_var',
        waMessageId: richResp && richResp.messageId ? richResp.messageId : '',
        sentTo: waPhone,
      };
    } catch (simpleErr) {
      richMsg = simpleErr.message || extractMetaError(simpleErr);
      if (!isTemplateParamValidationError(richMsg) && !isTemplateNameOrLanguageError(richMsg)) throw new Error(richMsg);
    }
  }
  var bodyCounts = tplNorm === 'campanha_corretor_msg' ? [1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4, 5, 6];
  var namedNames = ['mensagem', 'texto', 'corpo', 'conteudo', 'body', 'nome'];
  var li;
  var bi;
  var ni;
  for (li = 0; li < langCandidates.length; li++) {
    for (bi = 0; bi < bodyCounts.length; bi++) {
      if (tplNorm === 'campanha_corretor_msg' && bodyCounts[bi] !== 1) continue;
      try {
        var comps = buildBodyOnlyParamSet(bodyCounts[bi], config, broker, now);
        var sendResp = await sendTemplateMessage(waPhone, templateName, langCandidates[li], comps, waSendOpts);
        var probeVariant = 'probe_body_' + bodyCounts[bi];
        return {
          mode: 'template',
          templateName: templateName,
          language: langCandidates[li],
          componentsVariant: probeVariant,
          waMessageId: sendResp && sendResp.messageId ? sendResp.messageId : '',
          sentTo: waPhone,
        };
      } catch (errTry) {
        var errMsg = errTry.message || extractMetaError(errTry);
        if (!isTemplateParamValidationError(errMsg) && !isTemplateNameOrLanguageError(errMsg)) throw new Error(errMsg);
      }
      if (bodyCounts[bi] === 1) {
        for (ni = 0; ni < namedNames.length; ni++) {
          try {
            var namedComps = [{
              type: 'body',
              parameters: [{
                type: 'text',
                parameter_name: namedNames[ni],
                text: String(fill.singleBody).substring(0, 1024),
              }],
            }];
            sendResp = await sendTemplateMessage(waPhone, templateName, langCandidates[li], namedComps, waSendOpts);
            return {
              mode: 'template',
              templateName: templateName,
              language: langCandidates[li],
              componentsVariant: 'probe_named_' + namedNames[ni],
              waMessageId: sendResp && sendResp.messageId ? sendResp.messageId : '',
              sentTo: waPhone,
            };
          } catch (errNamed) {
            errMsg = errNamed.message || extractMetaError(errNamed);
            if (!isTemplateParamValidationError(errMsg) && !isTemplateNameOrLanguageError(errMsg)) throw new Error(errMsg);
          }
        }
        try {
          var bodyPlusBtn = buildCampanhaCorretorSingleVarBody(config, broker, now).concat([{
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: 'bfm' }],
          }]);
          sendResp = await sendTemplateMessage(waPhone, templateName, langCandidates[li], bodyPlusBtn, waSendOpts);
          return {
            mode: 'template',
            templateName: templateName,
            language: langCandidates[li],
            componentsVariant: 'probe_body1_button_url',
            waMessageId: sendResp && sendResp.messageId ? sendResp.messageId : '',
            sentTo: waPhone,
          };
        } catch (errBtn) {
          errMsg = errBtn.message || extractMetaError(errBtn);
          if (!isTemplateParamValidationError(errMsg) && !isTemplateNameOrLanguageError(errMsg)) throw new Error(errMsg);
        }
      }
    }
  }
  return null;
}

function buildBrokerCampaignTemplateComponentSets(config, broker, now, message) {
  var singleVar = buildCampanhaCorretorSingleVarBody(config, broker, now);
  var fiveVar = buildBrokerCampaignTemplateComponents(config, broker, now);
  var none = [];
  var twoVar = buildBodyOnlyParamSet(2, config, broker, now);
  var threeVar = buildBodyOnlyParamSet(3, config, broker, now);
  var fourVar = buildBodyOnlyParamSet(4, config, broker, now);
  var tplName = normalizeTemplateName(config.templateName);
  var count = config.templateBodyVariableCount;
  var total = config.templateTotalVariableCount;
  if (count === 0 && total === 0) return [none, singleVar, twoVar, threeVar, fourVar, fiveVar];
  if (count === 1 || total === 1) return [singleVar, twoVar, threeVar, fourVar, fiveVar, none];
  if (count === 2 || total === 2) return [twoVar, singleVar, threeVar, fiveVar, none];
  if (count === 3 || total === 3) return [threeVar, singleVar, fiveVar, none];
  if (count === 4 || total === 4) return [fourVar, singleVar, fiveVar, none];
  if (count === 5 || total === 5) return [fiveVar, singleVar, twoVar, none];
  if (tplName === 'campanha_corretor_msg') return [singleVar, none];
  if (tplName === 'atualizacao_semanal_corretor') return [fiveVar, fourVar, threeVar, singleVar, none];
  return [singleVar, twoVar, threeVar, fourVar, fiveVar, none];
}

function isWhatsAppNeedsTemplateError(errMsg) {
  return /template|24.?hour|re-engagement|janela|131047|131026|470|outside|NEEDS_TEMPLATE|texto livre não enviado/i.test(String(errMsg || ''));
}

function directCampaignNeedsTemplateFallback(directResult) {
  if (!directResult || directResult.mode !== 'direct') return true;
  var media = directResult.media || {};
  return !media.textSent;
}

async function sendBrokerCampaignFollowUpAfterTemplate(waPhone, config, broker, now, waSendOpts, hasSession) {
  var mediaDelayMs = config.skipDeliveryVerify ? 1000 : 2500;
  await new Promise(function(resolve) { setTimeout(resolve, mediaDelayMs); });

  // Apos campanha_corretor_msg (Marketing), midia livre nao entrega fora da janela 24h.
  var tplMedia = await brokerCampaignContent.sendBrokerCampaignTemplateMedia(
    waPhone, config, broker, now, waSendOpts, sendTemplateMessage
  );
  if (tplMedia.sent > 0) {
    tplMedia.textSent = false;
    return tplMedia;
  }

  if (hasSession) {
    var freeMedia = await brokerCampaignContent.sendBrokerCampaignFollowUpMedia(
      waPhone, config, broker, now, waSendOpts,
      sendTextMessage, sendImageMessage, sendVideoMessage,
      { includeText: false }
    );
    if (freeMedia.sent > 0) return freeMedia;
  }

  return {
    sent: 0,
    textSent: false,
    skipped: true,
    mode: 'template_media',
    errors: tplMedia.errors || [],
    reason: tplMedia.reason ||
      'Fotos/video nao enviados. Cadastre templates campanha_corretor_foto2 e campanha_corretor_video2 na Meta.',
    templateMediaAttempt: tplMedia,
    featuredTitle: tplMedia.featuredTitle || '',
  };
}

async function sendBrokerCampaignWhatsApp(config, broker, waPhone, now, db) {
  const message = buildBrokerCampaignMessage(config, broker, now);
  const templateName = normalizeTemplateName(config.templateName);
  const waSendOpts = config.campaignPhoneNumberId
    ? { phoneNumberId: config.campaignPhoneNumberId }
    : {};
  if (!config.campaignPhoneNumberId) {
    throw new Error('Número da Bia (phone_number_id) não configurado. Abra Corretores → Salvar WABA ou envie uma mensagem para a Bia e tente de novo.');
  }

  var forceTemplate = config.forceMetaTemplate === true;
  var hasSession = db ? await brokerHasWhatsAppSessionWindow(db, waPhone) : false;
  var skipTemplateFirst = !forceTemplate && config.skipMetaTemplate !== false && hasSession;
  if (hasSession && skipTemplateFirst) {
    try {
      var directResult = await brokerCampaignContent.sendBrokerCampaignDirect(
        waPhone, config, broker, now, waSendOpts,
        sendTextMessage, sendImageMessage, sendVideoMessage
      );
      if (!templateName || !directCampaignNeedsTemplateFallback(directResult)) {
        return directResult;
      }
    } catch (directErr) {
      var directMsg = directErr.message || extractMetaError(directErr);
      if (!isWhatsAppNeedsTemplateError(directMsg) || !templateName) {
        throw directErr;
      }
    }
  }

  if (!templateName) {
    if (!hasSession) {
      throw new Error(
        'Corretor fora da janela 24h — cadastre o template campanha_corretor_msg na Meta e no painel.'
      );
    }
    try {
      return await brokerCampaignContent.sendBrokerCampaignDirect(
        waPhone, config, broker, now, waSendOpts,
        sendTextMessage, sendImageMessage, sendVideoMessage
      );
    } catch (err) {
      throw new Error(extractMetaError(err));
    }
  }
  const langCandidates = [];
  const langSeen = {};
  function pushLang(code) {
    const c = String(code || '').trim();
    if (!c || langSeen[c]) return;
    langSeen[c] = true;
    langCandidates.push(c);
  }
  if (Array.isArray(config.templateLanguages)) {
    var tli;
    for (tli = 0; tli < config.templateLanguages.length; tli++) {
      pushLang(config.templateLanguages[tli]);
    }
  }
  pushLang(config.templateLanguageResolved);
  pushLang(config.templateLanguage);
  if (!langCandidates.length) {
    pushLang('pt_BR');
  }

  if (templateName) {
    var fillTexts = getBrokerCampaignFillTexts(config, broker, now);
    var tplListOpts = { phoneNumberId: config.campaignPhoneNumberId || '' };
    var metaExactSets = [];
    var liMeta;
    let lastErr = null;
    var mi;
    var li;
    var ci;

    var templateMulti = config.preferMultiVarTemplate !== false
      ? normalizeTemplateName(config.templateNameMulti || 'campanha_corretor_msg4')
      : '';
    if (templateMulti) {
      for (liMeta = 0; liMeta < langCandidates.length; liMeta++) {
        try {
          var tplResultMulti = await sendCampanhaCorretorTemplateMsg4(
            waPhone, templateMulti, langCandidates[liMeta], waSendOpts, config, broker, now
          );
          tplResultMulti.media = await sendBrokerCampaignFollowUpAfterTemplate(
            waPhone, config, broker, now, waSendOpts, hasSession
          );
          return tplResultMulti;
        } catch (multiErr) {
          lastErr = multiErr;
        }
      }
      if (forceTemplate && config.preferMultiVarTemplate !== false) {
        throw lastErr || new Error('Template campanha_corretor_msg4 nao enviado.');
      }
    }

    if (normalizeTemplateName(templateName) === 'campanha_corretor_msg') {
      for (liMeta = 0; liMeta < langCandidates.length; liMeta++) {
        try {
          var tplResultCamp = await sendCampanhaCorretorTemplateVar1(
            waPhone, templateName, langCandidates[liMeta], waSendOpts, config, broker, now
          );
          tplResultCamp.media = await sendBrokerCampaignFollowUpAfterTemplate(
            waPhone, config, broker, now, waSendOpts, hasSession
          );
          return tplResultCamp;
        } catch (campErr) {
          lastErr = campErr;
        }
      }
      throw lastErr || new Error('Template campanha_corretor_msg nao enviado.');
    }

    for (liMeta = 0; liMeta < langCandidates.length; liMeta++) {
      try {
        var plainCompsMain = [{
          type: 'body',
          parameters: [{
            type: 'text',
            text: brokerCampaignContent.buildTemplateMarketingVar1(config, broker, now),
          }],
        }];
        var plainSend = await sendTemplateMessage(
          waPhone, templateName, langCandidates[liMeta], plainCompsMain, waSendOpts
        );
        var tplResult = {
          mode: 'template',
          templateName: templateName,
          language: langCandidates[liMeta],
          componentsVariant: 'marketing_var1_plain',
          waMessageId: plainSend && plainSend.messageId ? plainSend.messageId : '',
          sentTo: waPhone,
        };
        tplResult.media = await sendBrokerCampaignFollowUpAfterTemplate(
          waPhone, config, broker, now, waSendOpts, hasSession
        );
        return tplResult;
      } catch (plainFirstErr) {
        lastErr = plainFirstErr;
      }
      try {
        var richComps = buildCampanhaCorretorSingleVarBody(config, broker, now);
        var richSend = await sendTemplateMessage(
          waPhone, templateName, langCandidates[liMeta], richComps, waSendOpts
        );
        var tplResult = {
          mode: 'template',
          templateName: templateName,
          language: langCandidates[liMeta],
          componentsVariant: 'rich_single_var',
          waMessageId: richSend && richSend.messageId ? richSend.messageId : '',
          sentTo: waPhone,
        };
        tplResult.media = await sendBrokerCampaignFollowUpAfterTemplate(
          waPhone, config, broker, now, waSendOpts, hasSession
        );
        return tplResult;
      } catch (richFirstErr) {
        lastErr = richFirstErr;
        var richErrMsg = richFirstErr.message || extractMetaError(richFirstErr);
        if (isTemplateParamValidationError(richErrMsg)) {
          try {
            var simpleCompsMain = brokerCampaignContent.buildCampanhaCorretorBodyComponents(
              config, broker, now, true
            );
            richSend = await sendTemplateMessage(
              waPhone, templateName, langCandidates[liMeta], simpleCompsMain, waSendOpts
            );
            tplResult = {
              mode: 'template',
              templateName: templateName,
              language: langCandidates[liMeta],
              componentsVariant: 'simple_single_var',
              waMessageId: richSend && richSend.messageId ? richSend.messageId : '',
              sentTo: waPhone,
            };
            tplResult.media = await sendBrokerCampaignFollowUpAfterTemplate(
              waPhone, config, broker, now, waSendOpts, hasSession
            );
            return tplResult;
          } catch (simpleMainErr) {
            lastErr = simpleMainErr;
          }
        }
      }
    }

    for (liMeta = 0; liMeta < langCandidates.length; liMeta++) {
      var row = await findApprovedTemplateRow(tplListOpts, templateName, langCandidates[liMeta]);
      if (row && row.components && row.components.length) {
        var built = buildTemplateSendComponents(row.components, fillTexts);
        if (built && built.length) {
          metaExactSets.push({ lang: row.language || langCandidates[liMeta], components: built });
        }
      }
    }
    var componentSets = buildBrokerCampaignTemplateComponentSets(config, broker, now, message);
    if (metaExactSets.length) {
      for (mi = 0; mi < metaExactSets.length; mi++) {
        try {
          const sendResp = await sendTemplateMessage(
            waPhone, templateName, metaExactSets[mi].lang, metaExactSets[mi].components, waSendOpts
          );
          tplResult = {
            mode: 'template',
            templateName: templateName,
            language: metaExactSets[mi].lang,
            componentsVariant: 'meta_exact',
            waMessageId: sendResp && sendResp.messageId ? sendResp.messageId : '',
            sentTo: waPhone,
          };
          tplResult.media = await sendBrokerCampaignFollowUpAfterTemplate(
            waPhone, config, broker, now, waSendOpts
          );
          return tplResult;
        } catch (errMeta) {
          lastErr = errMeta;
        }
      }
    }
    for (li = 0; li < langCandidates.length; li++) {
      for (ci = 0; ci < componentSets.length; ci++) {
        if (normalizeTemplateName(templateName) === 'campanha_corretor_msg' &&
            (!componentSets[ci].length || (componentSets[ci][0].parameters && componentSets[ci][0].parameters.length === 0))) {
          continue;
        }
        try {
          const sendResp = await sendTemplateMessage(waPhone, templateName, langCandidates[li], componentSets[ci], waSendOpts);
          var variant = 'auto';
          if (componentSets[ci].length === 0) variant = 'none';
          else if (componentSets[ci][0].parameters && componentSets[ci][0].parameters.length === 1) variant = 'single';
          else if (componentSets[ci][0].parameters && componentSets[ci][0].parameters.length >= 5) variant = 'full';
          tplResult = {
            mode: 'template',
            templateName: templateName,
            language: langCandidates[li],
            componentsVariant: variant,
            waMessageId: sendResp && sendResp.messageId ? sendResp.messageId : '',
            sentTo: waPhone,
          };
          if (normalizeTemplateName(templateName) === 'campanha_corretor_msg' ||
              variant === 'single' || variant === 'rich_single_var') {
            tplResult.media = await sendBrokerCampaignFollowUpAfterTemplate(
              waPhone, config, broker, now, waSendOpts, hasSession
            );
          }
          return tplResult;
        } catch (err) {
          lastErr = err;
          const errMsg = err.message || extractMetaError(err);
          if (!isTemplateNameOrLanguageError(errMsg) && ci === componentSets.length - 1) {
            throw new Error(errMsg);
          }
        }
      }
    }
    var probed = await bruteForceBrokerTemplateSend(
      waPhone, templateName, langCandidates, waSendOpts, config, broker, now
    );
    if (probed) {
      probed.media = await sendBrokerCampaignFollowUpAfterTemplate(
        waPhone, config, broker, now, waSendOpts, hasSession
      );
      return probed;
    }

    const detail = lastErr ? (lastErr.message || String(lastErr)) : 'erro desconhecido';
    throw new Error(
      'Template "' + templateName + '" não foi enviado pela Meta: ' + detail +
      ' O template precisa de {{1}} no corpo para conteúdo personalizado (site, destaque, MCMV). Veja TEMPLATE-CAMPANHA-CORRETORES-META.md.'
    );
  }
  try {
    await sendTextMessage(waPhone, message, waSendOpts);
    return { mode: 'text' };
  } catch (err) {
    const errMsg = extractMetaError(err);
    const needsTemplate = /template|24.?hour|re-engagement|janela|131047|131026/i.test(errMsg);
    if (needsTemplate) {
      throw new Error(
        errMsg + ' — Para corretor que não falou com o número Business nas últimas 24h, cadastre um template aprovado na Meta e preencha o campo Template Meta na campanha.'
      );
    }
    throw new Error(errMsg);
  }
}

function buildBrokerCampaignMessage(config, broker, now) {
  const week = getWeekOfYearNumber(now);
  const tips = Array.isArray(config.usefulTips) ? config.usefulTips : [];
  const tip = tips.length ? tips[(week - 1) % tips.length] : '';
  const firstName = String((broker && broker.name) || '').trim().split(' ')[0] || 'Corretor(a)';
  return (
    '🏡 *' + (config.weeklyTitle || 'Atualização semanal B F Marques') + '*\n\n' +
    'Olá, ' + firstName + '! Boa semana de vendas. 🚀\n\n' +
    '📢 Site atualizado: ' + (config.siteUrl || 'https://bfmarquesempreendimentos.github.io/bfm/') + '\n' +
    '🔥 Ofertas e imóveis disponíveis já estão no ar.\n' +
    (tip ? ('💡 ' + tip + '\n') : '') +
    '✅ ' + (config.ctaText || 'Fale com seus leads hoje e acelere os agendamentos.') + '\n\n' +
    'Suporte comercial: Bruno Marques ' + (config.whatsappContato || '(21) 99555-7010')
  );
}

async function verifyCampaignMessageDelivery(sendMeta) {
  var msgId = (sendMeta && sendMeta.waMessageId) ||
    (sendMeta && sendMeta.media && sendMeta.media.waMessageId) || '';
  if (!msgId) {
    return {
      deliveryStatus: 'unknown',
      deliveryHint: 'Meta não retornou ID da mensagem — entrega incerta.',
      deliveryFailed: false,
    };
  }
  var delivery = await waitForWhatsAppDeliveryStatus(msgId, 18000);
  if (delivery.status === 'failed') {
    return {
      deliveryStatus: 'failed',
      deliveryHint: delivery.errorHint || explainMetaDeliveryError(delivery.errors) ||
        'A Meta reportou falha na entrega ao celular.',
      deliveryFailed: true,
      deliveryErrors: delivery.errors || [],
    };
  }
  if (delivery.status === 'delivered' || delivery.status === 'read') {
    return { deliveryStatus: delivery.status, deliveryHint: '', deliveryFailed: false };
  }
  if (delivery.status === 'sent') {
    return {
      deliveryStatus: 'sent',
      deliveryHint: delivery.pendingDelivery
        ? 'Enviado ao servidor WhatsApp; confirmação de entrega no aparelho ainda pendente.'
        : '',
      deliveryFailed: false,
    };
  }
  if (delivery.timedOut) {
    return {
      deliveryStatus: 'pending',
      deliveryHint:
        'API aceitou (wamid OK), mas não houve confirmação de entrega em 10s. ' +
        'Causas comuns: conta WhatsApp de TESTE (cadastre o celular em API Setup → números de teste), ' +
        'número sem WhatsApp, ou webhook de status não configurado na Meta.',
      deliveryFailed: false,
      deliveryUncertain: true,
    };
  }
  return {
    deliveryStatus: delivery.status || 'unknown',
    deliveryHint: delivery.errorHint || '',
    deliveryFailed: false,
  };
}

async function findIncompleteWeeklyCampaignRun(db, weekKey) {
  try {
    var stateSnap = await db.collection('broker_campaign').doc('weekly_state').get();
    if (!stateSnap.exists) return null;
    var state = stateSnap.data() || {};
    if (state.weekKey !== weekKey) return null;
    if (state.status !== 'running' && state.status !== 'partial') return null;
    if (!state.runId) return null;
    var runSnap = await db.collection('broker_campaign_logs').doc(String(state.runId)).get();
    if (!runSnap.exists) return null;
    var data = runSnap.data() || {};
    if (!data.sendableBrokerIds || !data.sendableBrokerIds.length) return null;
    if (data.lastProcessedIndex == null || data.lastProcessedIndex < 0) return null;
    if (data.lastProcessedIndex >= data.sendableBrokerIds.length - 1) return null;
    return { runId: runSnap.id, data: data };
  } catch (e) {
    return null;
  }
}

async function updateWeeklyCampaignState(db, weekKey, runId, status) {
  if (!db || !weekKey || !runId) return;
  try {
    await db.collection('broker_campaign').doc('weekly_state').set({
      weekKey: weekKey,
      runId: runId,
      status: status || 'running',
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (e) { /* ignore */ }
}

async function sendWeeklyBrokerCampaignInternal(payload) {
  payload = payload || {};
  const db = admin.firestore();
  const now = new Date();
  const weekKey = getCampaignRunWeekKey(now);
  let config = await getBrokerCampaignConfig(db);
  const wabaSync = await getOrResolveWabaId(db);
  const templateStatus = await getBrokerCampaignTemplateStatus(config, db);
  if (templateStatus.templateName) {
    config = Object.assign({}, config, {
      templateName: templateStatus.templateName,
      templateLanguageResolved: templateStatus.templateLanguageResolved,
      templateLanguages: templateStatus.templateLanguages || [],
      templateBodyVariableCount: templateStatus.templateBodyVariableCount != null
        ? templateStatus.templateBodyVariableCount
        : config.templateBodyVariableCount,
      templateTotalVariableCount: templateStatus.templateTotalVariableCount != null
        ? templateStatus.templateTotalVariableCount
        : config.templateTotalVariableCount,
      campaignPhoneNumberId: wabaSync.campaignPhoneNumberId || templateStatus.biaPhoneNumberId || '',
    });
    if (!templateStatus.templateValid && !templateStatus.templateValidationSoft) {
      return {
        ok: false,
        sent: 0,
        errors: 0,
        skipped: 0,
        eligible: 0,
        issues: [{ status: 'error', error: templateStatus.templateHint }],
        templateName: templateStatus.templateName,
        templateValid: false,
      };
    }
  }
  if (!config.enabled && !payload.force) {
    return { ok: true, skipped: true, reason: 'Campanha desativada no painel/configuração.' };
  }

  var isBulkCampaign = !payload.brokerId && !payload.phone;
  var isBulkWeekly = payload.type === 'weekly' && isBulkCampaign;
  var isBulkSend = isBulkCampaign && (payload.type === 'weekly' || payload.force);
  if (isBulkSend) {
    config = Object.assign({}, config, {
      forceMetaTemplate: true,
      skipDeliveryVerify: true,
      preferMultiVarTemplate: true,
    });
  }

  const targetList = await listBrokerCampaignTargets(db, payload);
  var resumeRun = null;
  if (payload.resumeRunId) {
    var rrSnap = await db.collection('broker_campaign_logs').doc(String(payload.resumeRunId)).get();
    if (rrSnap.exists) {
      var rrData = rrSnap.data() || {};
      if ((rrData.status === 'partial' || rrData.status === 'running') &&
          rrData.sendableBrokerIds && rrData.sendableBrokerIds.length &&
          rrData.lastProcessedIndex != null && rrData.lastProcessedIndex >= 0 &&
          rrData.lastProcessedIndex < rrData.sendableBrokerIds.length - 1) {
        resumeRun = { runId: rrSnap.id, data: rrData };
      }
    }
  } else if (isBulkWeekly && payload.resume !== false) {
    resumeRun = await findIncompleteWeeklyCampaignRun(db, weekKey);
  }

  const runRef = payload.runId
    ? db.collection('broker_campaign_logs').doc(payload.runId)
    : (resumeRun && resumeRun.runId
      ? db.collection('broker_campaign_logs').doc(resumeRun.runId)
      : db.collection('broker_campaign_logs').doc());

  // Trava anti-duplicação: impede que duas execuções (cron de resume + envio manual,
  // ou crons sobrepostos) processem o MESMO run ao mesmo tempo e reenviem WhatsApp.
  // A trava é liberada ao concluir/parar; se a função morrer, expira pelo TTL.
  var CAMPAIGN_LOCK_TTL_MS = 570000; // ~9,5 min (acima do timeout máx. da função)
  var campaignLockToken = 'lk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  try {
    var lockAcquired = await db.runTransaction(async function(tx) {
      var lockSnap = await tx.get(runRef);
      var ld = lockSnap.exists ? (lockSnap.data() || {}) : {};
      var prevLockAt = ld.lockedAt ? new Date(ld.lockedAt).getTime() : 0;
      var lockFresh = prevLockAt && (Date.now() - prevLockAt) < CAMPAIGN_LOCK_TTL_MS;
      if (lockFresh) return false;
      tx.set(runRef, {
        lockedAt: new Date().toISOString(),
        lockToken: campaignLockToken,
      }, { merge: true });
      return true;
    });
    if (!lockAcquired) {
      return {
        ok: true,
        skipped: true,
        reason: 'already_running',
        runId: runRef.id,
        message: 'Outro disparo desta campanha já está em execução. Aguarde concluir.',
      };
    }
  } catch (lockErr) {
    console.warn('Trava de campanha falhou (segue sem trava):', lockErr.message);
  }

  const results = [];
  const sendable = [];
  const sentPhones = {};
  var resumeFromIndex = -1;

  if (resumeRun && resumeRun.data) {
    var savedIds = resumeRun.data.sendableBrokerIds || [];
    var idMap = {};
    targetList.forEach(function(b) { idMap[String(b.id)] = b; });
    var si;
    for (si = 0; si < savedIds.length; si++) {
      var rid = String(savedIds[si]);
      if (!idMap[rid]) continue;
      var rb = idMap[rid];
      var rw = normalizeBrazilWhatsApp(rb.phone);
      if (!rw || sentPhones[rw]) continue;
      sentPhones[rw] = true;
      sendable.push({ broker: rb, waPhone: rw });
    }
    resumeFromIndex = Number(resumeRun.data.lastProcessedIndex);
    if (Array.isArray(resumeRun.data.partialResults)) {
      results.push.apply(results, resumeRun.data.partialResults);
    }
  }

  targetList.forEach(function(broker) {
    const waPhone = normalizeBrazilWhatsApp(broker.phone);
    if (!waPhone) {
      results.push({
        brokerId: broker.id,
        name: broker.name || '',
        status: 'skipped',
        reason: 'Telefone inválido ou incompleto (use DDD + número, ex: 21987654321)',
      });
      return;
    }
    if (sentPhones[waPhone]) {
      if (!resumeRun) {
        results.push({
          brokerId: broker.id,
          name: broker.name || '',
          status: 'skipped',
          reason: 'Telefone duplicado no cadastro',
        });
      }
      return;
    }
    sentPhones[waPhone] = true;
    sendable.push({ broker: broker, waPhone: waPhone });
  });

  if (!resumeRun) {
    await runRef.set({
      type: payload.type || 'weekly',
      forced: !!payload.force,
      weekKey: weekKey,
      startedAt: new Date().toISOString(),
      totalTargets: targetList.length,
      eligible: sendable.length,
      sendableBrokerIds: sendable.map(function(s) { return s.broker.id; }),
      status: 'running',
      lastProcessedIndex: -1,
    }, { merge: true });
    if (isBulkWeekly) {
      await updateWeeklyCampaignState(db, weekKey, runRef.id, 'running');
    }
  } else {
    await runRef.set({
      status: 'running',
      resumedAt: new Date().toISOString(),
      eligible: sendable.length,
    }, { merge: true });
  }

  const waAccount = await getWhatsAppAccountInfo();
  const loopStartedAt = Date.now();
  const maxLoopMs = isBulkSend ? 528000 : 280000;
  var loopStartIndex = resumeFromIndex + 1;
  if (loopStartIndex < 0) loopStartIndex = 0;

  for (let i = loopStartIndex; i < sendable.length; i++) {
    if (isBulkSend && Date.now() - loopStartedAt > maxLoopMs) {
      await runRef.set({
        status: 'partial',
        lockedAt: null,
        lastProcessedIndex: i - 1,
        partialResults: results,
        partialAt: new Date().toISOString(),
        sent: results.filter(function(r) { return r.status === 'sent' || r.status === 'accepted'; }).length,
        errors: results.filter(function(r) { return r.status === 'error'; }).length,
        skipped: results.filter(function(r) { return r.status === 'skipped'; }).length,
      }, { merge: true });
      if (isBulkWeekly) {
        await updateWeeklyCampaignState(db, weekKey, runRef.id, 'partial');
      }
      return {
        ok: true,
        status: 'partial',
        sent: results.filter(function(r) { return r.status === 'sent' || r.status === 'accepted'; }).length,
        errors: results.filter(function(r) { return r.status === 'error'; }).length,
        skipped: results.filter(function(r) { return r.status === 'skipped'; }).length,
        totalTargets: targetList.length,
        eligible: sendable.length,
        processed: i,
        remaining: sendable.length - i,
        runId: runRef.id,
        weekKey: weekKey,
        resumeHint: 'Execucao parcial — continuacao automatica agendada ou dispare manualmente.',
      };
    }
    const item = sendable[i];
    try {
      const sendMeta = await sendBrokerCampaignWhatsApp(config, item.broker, item.waPhone, now, db);
      if (sendMeta.mode === 'text' || sendMeta.templateFallback) {
        results.push({
          brokerId: item.broker.id,
          name: item.broker.name || '',
          status: 'error',
          phone: item.waPhone,
          phoneCadastro: item.broker.phone || '',
          error: 'Envio caiu em texto livre (não entrega fora da janela 24h). Erro template: ' +
            (sendMeta.templateError || 'configure WABA e campanha_corretor_msg'),
        });
      } else {
        var rowStatus = 'sent';
        var rowNote = '';
        if (waAccount.ok && waAccount.isLikelyTestAccount) {
          rowStatus = 'accepted';
          rowNote = 'API aceitou, mas conta de TESTE da Meta só entrega para números cadastrados em API Setup → números de teste.';
        }
        var msgId = sendMeta.waMessageId || (sendMeta.media && sendMeta.media.waMessageId) || '';
        var deliveryCheck = config.skipDeliveryVerify
          ? { deliveryStatus: 'skipped', deliveryHint: '', deliveryFailed: false }
          : await verifyCampaignMessageDelivery(sendMeta);
        if (deliveryCheck.deliveryFailed && sendMeta.mode === 'template' &&
            sendMeta.media && sendMeta.media.skipped) {
          var err131047 = false;
          if (deliveryCheck.deliveryErrors && deliveryCheck.deliveryErrors.length) {
            var dei;
            for (dei = 0; dei < deliveryCheck.deliveryErrors.length; dei++) {
              if (String(deliveryCheck.deliveryErrors[dei].code || '') === '131047') {
                err131047 = true;
                break;
              }
            }
          }
          if (err131047 || (deliveryCheck.deliveryHint || '').indexOf('131047') >= 0) {
            deliveryCheck = {
              deliveryStatus: 'sent',
              deliveryHint: 'Template Marketing enviado. Fotos/vídeo omitidos (corretor fora da janela 24h).',
              deliveryFailed: false,
            };
          }
        }
        if (deliveryCheck.deliveryFailed) {
          results.push({
            brokerId: item.broker.id,
            name: item.broker.name || '',
            status: 'error',
            phone: item.waPhone,
            phoneCadastro: item.broker.phone || '',
            waMessageId: msgId,
            mode: sendMeta.mode,
            deliveryStatus: deliveryCheck.deliveryStatus,
            error: deliveryCheck.deliveryHint || 'Falha na entrega confirmada pela Meta.',
          });
        } else {
          if (deliveryCheck.deliveryUncertain || deliveryCheck.deliveryHint) {
            rowStatus = rowStatus === 'sent' ? 'accepted' : rowStatus;
            rowNote = (rowNote ? rowNote + ' ' : '') + (deliveryCheck.deliveryHint || '');
          }
          if (deliveryCheck.deliveryStatus === 'delivered' || deliveryCheck.deliveryStatus === 'read') {
            rowStatus = 'sent';
            rowNote = '';
          }
          if (sendMeta.media && sendMeta.media.skipped && sendMeta.media.reason) {
            rowStatus = rowStatus === 'sent' ? 'accepted' : rowStatus;
            rowNote = (rowNote ? rowNote + ' ' : '') + sendMeta.media.reason;
          }
          if (sendMeta.media && sendMeta.media.errors && sendMeta.media.errors.length) {
            rowNote = (rowNote ? rowNote + ' ' : '') + sendMeta.media.errors.join(' ');
          }
          results.push({
            brokerId: item.broker.id,
            name: item.broker.name || '',
            status: rowStatus,
            phone: item.waPhone,
            phoneCadastro: item.broker.phone || '',
            mode: sendMeta.mode,
            templateName: sendMeta.templateName || '',
            waMessageId: msgId,
            componentsVariant: sendMeta.componentsVariant || '',
            mediaSent: sendMeta.media && sendMeta.media.sent ? sendMeta.media.sent : 0,
            photosSent: sendMeta.media && sendMeta.media.photosSent != null ? sendMeta.media.photosSent : 0,
            videosSent: sendMeta.media && sendMeta.media.videosSent != null ? sendMeta.media.videosSent : 0,
            mediaMode: sendMeta.media && sendMeta.media.mode ? sendMeta.media.mode : '',
            mediaErrors: sendMeta.media && sendMeta.media.errors ? sendMeta.media.errors : [],
            mediaVariants: sendMeta.media && sendMeta.media.mediaVariants ? sendMeta.media.mediaVariants : [],
            mediaSkipped: !!(sendMeta.media && sendMeta.media.skipped),
            mediaSkipReason: sendMeta.media && sendMeta.media.reason ? sendMeta.media.reason : '',
            featuredTitle: sendMeta.media && sendMeta.media.featuredTitle ? sendMeta.media.featuredTitle : '',
            deliveryStatus: deliveryCheck.deliveryStatus,
            deliveryNote: rowNote,
            deliveryUncertain: !!deliveryCheck.deliveryUncertain,
          });
        }
      }
    } catch (err) {
      results.push({
        brokerId: item.broker.id,
        name: item.broker.name || '',
        status: 'error',
        phone: item.waPhone,
        error: err.message || 'Falha ao enviar',
      });
    }
    if (isBulkSend && (i % 3 === 2 || i === sendable.length - 1)) {
      await runRef.set({
        lastProcessedIndex: i,
        partialResults: results,
        sent: results.filter(function(r) { return r.status === 'sent' || r.status === 'accepted'; }).length,
        errors: results.filter(function(r) { return r.status === 'error'; }).length,
        skipped: results.filter(function(r) { return r.status === 'skipped'; }).length,
      }, { merge: true });
    }
    if (i < sendable.length - 1) {
      await new Promise(function(resolve) { setTimeout(resolve, isBulkSend ? 200 : 350); });
    }
  }

  const sent = results.filter(function(r) { return r.status === 'sent' || r.status === 'accepted'; }).length;
  const errors = results.filter(function(r) { return r.status === 'error'; }).length;
  const skipped = results.filter(function(r) { return r.status === 'skipped'; }).length;
  const issues = results.filter(function(r) { return r.status !== 'sent' && r.status !== 'accepted'; }).slice(0, 80);
  const sentDetails = results.filter(function(r) { return r.status === 'sent' || r.status === 'accepted'; }).slice(0, 5);
  var deliveryWarning = '';
  var anyUncertain = results.some(function(r) {
    return r.deliveryUncertain || r.deliveryStatus === 'pending' || r.deliveryStatus === 'sent';
  });
  if (waAccount.ok && waAccount.isLikelyTestAccount && sent > 0) {
    deliveryWarning =
      'A Meta aceitou o envio (API OK), mas esta é uma conta WhatsApp de TESTE ("' +
      (waAccount.wabaName || 'Test') +
      '"). Só entrega para números cadastrados em API Setup → números de teste. ' +
      'Por isso o painel Meta mostra 0 entregues e o corretor não recebe. ' +
      'Cadastre o celular do corretor lá ou migre para conta Business de produção.';
  } else if (errors === 0 && sent > 0 && anyUncertain) {
    deliveryWarning =
      'A API aceitou o envio, mas a entrega no celular não foi confirmada. ' +
      'Peça ao corretor confirmar o WhatsApp (21) 98509-3217, enviar "oi" para a Bia, ou cadastre o número em números de teste na Meta.';
  }

  await runRef.set({
    finishedAt: new Date().toISOString(),
    status: 'done',
    lockedAt: null,
    sent: sent,
    errors: errors,
    skipped: skipped,
    eligible: sendable.length,
    issues: issues,
    issuesTruncated: results.length - sent > issues.length,
    lastProcessedIndex: sendable.length ? sendable.length - 1 : -1,
  }, { merge: true });
  if (isBulkWeekly) {
    await updateWeeklyCampaignState(db, weekKey, runRef.id, 'done');
  }

  return {
    ok: true,
    sent: sent,
    errors: errors,
    skipped: skipped,
    totalTargets: targetList.length,
    eligible: sendable.length,
    runId: runRef.id,
    status: 'done',
    issues: issues,
    sentDetails: sentDetails,
    templateName: config.templateName || '',
    whatsappTestAccount: !!(waAccount.ok && waAccount.isLikelyTestAccount),
    whatsappAccountName: waAccount.ok ? (waAccount.wabaName || '') : '',
    deliveryWarning: deliveryWarning,
    deliveryLikely: sent > 0 && !deliveryWarning,
    campaignWeek: brokerCampaignContent.getCampaignWeekPreview(now, config),
  };
}

exports.sendQueuedEmail = functions
  .runWith({ secrets: ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'] })
  .firestore.document('emailQueue/{docId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const transporter = getTransporter();
    if (transporter) {
      try {
        await transporter.sendMail({
          from: data.from || 'bfmarquesempreendimentos@gmail.com',
          to: data.to,
          subject: data.subject,
          html: data.body
        });
        await snap.ref.set({ status: 'sent', sentAt: new Date().toISOString() }, { merge: true });
      } catch (error) {
        await snap.ref.set({ status: 'error', error: error.message }, { merge: true });
      }
    }
    if (data.whatsappPhone && data.whatsappMessage) {
      try {
        const waPhone = normalizePhoneForWhatsApp(data.whatsappPhone);
        if (waPhone) {
          await sendTextMessage(waPhone, data.whatsappMessage);
          await snap.ref.set({ whatsappStatus: 'sent', whatsappSentAt: new Date().toISOString() }, { merge: true });
        }
      } catch (err) {
        console.error('Erro ao enviar WhatsApp:', err);
        await snap.ref.set({ whatsappStatus: 'error', whatsappError: err.message }, { merge: true });
      }
    }
  });

// ─── WhatsApp Chatbot Webhook ─────────────────────────────────────
exports.chatbotWebhook = functions
  .runWith({
    secrets: ['WHATSAPP_TOKEN', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY'],
    timeoutSeconds: 120,
    memory: '512MB',
  })
  .https.onRequest(async (req, res) => {
    if (req.method === 'GET') {
      const q = req.query;
      if (q.diagnostic === '1' || q.health === '1') {
        const hasToken = !!process.env.WHATSAPP_TOKEN;
        const hasVerify = !!process.env.WHATSAPP_VERIFY_TOKEN;
        const hasPhoneId = !!process.env.WHATSAPP_PHONE_NUMBER_ID;
        const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
        const hasOpenAI = !!process.env.OPENAI_API_KEY;
        return res.status(200).json({
          ok: hasToken && hasVerify && hasPhoneId && hasAnthropic,
          secrets: {
            WHATSAPP_TOKEN: hasToken ? 'definido' : 'FALTANDO',
            WHATSAPP_VERIFY_TOKEN: hasVerify ? 'definido' : 'FALTANDO',
            WHATSAPP_PHONE_NUMBER_ID: hasPhoneId ? 'definido' : 'FALTANDO (use o do payload ou Embedded Signup)',
            ANTHROPIC_API_KEY: hasAnthropic ? 'definido' : 'FALTANDO',
            OPENAI_API_KEY: hasOpenAI ? 'definido' : 'opcional (transcrição de áudio da Bia)',
          },
          webhook: 'Para Meta verificar, use hub.mode=subscribe e hub.verify_token igual ao secret',
        });
      }
      return verifyWebhook(req, res);
    }
    if (req.method === 'POST') {
      // Valida assinatura da Meta quando WHATSAPP_APP_SECRET estiver configurado.
      if (!validateSignature(req, process.env.WHATSAPP_APP_SECRET)) {
        console.warn('[Webhook] POST rejeitado: assinatura x-hub-signature-256 inválida');
        return res.sendStatus(403);
      }
      return processWebhook(req, res);
    }
    return res.sendStatus(405);
  });

// ─── API de Corretores (leitura server-side, bypassa regras cliente) ──
exports.getBrokers = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });

  try {
    var activeOnlyQuery = req.query.activeOnly === '1' || req.query.activeOnly === 'true';
    if (!activeOnlyQuery && !(await verifyAdminAuth(req)).ok) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const db = admin.firestore();
    const snapshot = await db.collection('brokers').get();
    const brokers = snapshot.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        name: d.name || '',
        cpf: d.cpf || '',
        email: d.email || '',
        phone: d.phone || '',
        creci: d.creci || '',
        isActive: brokerAuth.brokerIsActive(d),
        whatsappCampaignOptOut: !!d.whatsappCampaignOptOut,
        isAdmin: d.isAdmin || false,
        createdAt: d.createdAt ? d.createdAt : new Date().toISOString()
      };
    });
    brokers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const deduped = dedupeBrokersByEmail(brokers);
    const activeOnly = req.query.activeOnly === '1' || req.query.activeOnly === 'true';
    if (activeOnly) {
      return res.json(deduped.filter(function(b) { return b.isActive; }));
    }
    return res.json(deduped);
  } catch (err) {
    console.error('Erro ao buscar corretores:', err);
    return res.status(500).json({ error: err.message });
  }
});

/** Login de corretor (validação server-side com hash; legado ainda aceito e migra no login). */
exports.brokerLogin = functions.https.onRequest(async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    var body = req.body || {};
    var email = String(body.email || '').trim().toLowerCase();
    var password = String(body.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatórios' });
    var db = admin.firestore();
    var authResult = await brokerAuth.verifyBrokerCredentials(db, email, password);
    if (!authResult.ok) {
      if (authResult.inactive) return res.status(403).json({ error: 'Cadastro aguardando aprovação.' });
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }
    await brokerAuth.upgradeBrokerPasswordHash(authResult.ref, authResult.data, password);
    return res.json({ ok: true, broker: authResult.broker });
  } catch (err) {
    console.error('brokerLogin:', err);
    return res.status(500).json({ error: err.message });
  }
});

/** Perfil do corretor autenticado (Firebase idToken). */
exports.brokerMe = functions.https.onRequest(async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    var token = extractIdToken(req);
    if (!token) return res.status(401).json({ error: 'Token necessário' });
    var broker = await brokerAuth.getBrokerFromIdToken(token);
    if (!broker) return res.status(403).json({ error: 'Corretor não encontrado ou inativo' });
    return res.json({ ok: true, broker: broker });
  } catch (err) {
    console.error('brokerMe:', err);
    return res.status(403).json({ error: 'Token inválido ou expirado' });
  }
});

/** Provisiona conta Firebase Auth do corretor (1º login; valida senha no Firestore). */
exports.brokerProvisionAuth = functions.https.onRequest(async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    var body = req.body || {};
    var email = String(body.email || '').trim().toLowerCase();
    var password = String(body.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatórios' });
    var db = admin.firestore();
    var authResult = await brokerAuth.verifyBrokerCredentials(db, email, password);
    if (!authResult.ok) {
      if (authResult.inactive) return res.status(403).json({ error: 'Cadastro aguardando aprovação.', inactive: true });
      return res.status(403).json({ error: 'Email ou senha incorretos.' });
    }
    await brokerAuth.upgradeBrokerPasswordHash(authResult.ref, authResult.data, password);
    await brokerAuth.ensureBrokerFirebaseUser(email, password);
    return res.json({ ok: true, email: email });
  } catch (err) {
    console.error('brokerProvisionAuth:', err);
    return res.status(500).json({ error: err.message });
  }
});

/** CRUD de corretores pelo painel admin (senhas sempre hasheadas). */
exports.adminBrokerMutate = functions.https.onRequest(async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  if (!(await verifyAdminAuth(req)).ok) return res.status(403).json({ error: 'Acesso negado' });
  try {
    var body = req.body || {};
    var action = String(body.action || 'update').trim().toLowerCase();
    var db = admin.firestore();
    var brokerId = String(body.brokerId || body.id || '').trim();

    if (action === 'delete') {
      if (!brokerId) return res.status(400).json({ error: 'brokerId obrigatório' });
      await db.collection('brokers').doc(brokerId).delete();
      return res.json({ ok: true, deleted: brokerId });
    }

    if (action === 'restore_legacy') {
      var snapLegacy = await db.collection('brokers').get();
      var restored = 0;
      var batchLegacy = db.batch();
      var batchCount = 0;
      snapLegacy.forEach(function(doc) {
        var d = doc.data() || {};
        if (d.isActive === true) return;
        if (d.isActive === false) return;
        var st = String(d.registrationStatus || '').toLowerCase();
        if (st === 'pending' || st === 'rejected') return;
        batchLegacy.set(doc.ref, {
          isActive: true,
          registrationStatus: d.registrationStatus || 'legacy_restored',
          legacyRestoredAt: new Date().toISOString(),
        }, { merge: true });
        restored += 1;
        batchCount += 1;
      });
      if (batchCount > 0) await batchLegacy.commit();
      return res.json({ ok: true, restored: restored, total: snapLegacy.size });
    }

    if (action === 'create') {
      var emailNorm = String(body.email || '').trim().toLowerCase();
      if (!body.name || !emailNorm) return res.status(400).json({ error: 'nome e email obrigatórios' });
      var exists = await db.collection('brokers').where('email', '==', emailNorm).limit(1).get();
      if (!exists.empty) return res.status(409).json({ error: 'Email já cadastrado' });
      var createPwd = passwordFieldsForStorage(body.password || '');
      var createRef = await db.collection('brokers').add({
        name: String(body.name || '').trim(),
        cpf: String(body.cpf || '').replace(/\D/g, ''),
        email: emailNorm,
        phone: String(body.phone || '').trim(),
        creci: String(body.creci || '').trim(),
        passwordHash: createPwd.passwordHash,
        password: '',
        isActive: body.isActive === true,
        whatsappCampaignOptOut: body.whatsappCampaignOptOut === true,
        isAdmin: body.isAdmin === true,
        createdAt: new Date().toISOString(),
        registrationStatus: 'admin_created',
      });
      return res.json({ ok: true, id: createRef.id });
    }

    if (!brokerId) return res.status(400).json({ error: 'brokerId obrigatório' });
    var ref = db.collection('brokers').doc(brokerId);
    var snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Corretor não encontrado' });
    var updates = { updatedAt: new Date().toISOString() };
    if (body.name != null) updates.name = String(body.name || '').trim();
    if (body.cpf != null) updates.cpf = String(body.cpf || '').replace(/\D/g, '');
    if (body.email != null) updates.email = String(body.email || '').trim().toLowerCase();
    if (body.phone != null) updates.phone = String(body.phone || '').trim();
    if (body.creci != null) updates.creci = String(body.creci || '').trim();
    if (body.isActive != null) updates.isActive = body.isActive === true;
    if (body.isAdmin != null) updates.isAdmin = body.isAdmin === true;
    if (body.whatsappCampaignOptOut != null) updates.whatsappCampaignOptOut = body.whatsappCampaignOptOut === true;
    if (body.password) {
      var updPwd = passwordFieldsForStorage(body.password);
      updates.passwordHash = updPwd.passwordHash;
      updates.password = '';
      var brokerEmail = String((body.email != null ? body.email : snap.data().email) || '').trim().toLowerCase();
      if (brokerEmail) {
        try {
          var fbUser = await admin.auth().getUserByEmail(brokerEmail);
          await admin.auth().updateUser(fbUser.uid, { password: String(body.password) });
        } catch (fbErr) {
          if (fbErr.code === 'auth/user-not-found') {
            try { await brokerAuth.ensureBrokerFirebaseUser(brokerEmail, String(body.password)); } catch (e2) { /* ignore */ }
          }
        }
      }
    }
    await ref.set(updates, { merge: true });
    return res.json({ ok: true, id: brokerId });
  } catch (err) {
    console.error('adminBrokerMutate:', err);
    return res.status(500).json({ error: err.message });
  }
});

/** Migra senhas plaintext de corretores para hash scrypt (admin). */
exports.adminMigrateBrokerPasswords = functions.https.onRequest(async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  if (!(await verifyAdminAuth(req)).ok) return res.status(403).json({ error: 'Acesso negado' });
  try {
    var db = admin.firestore();
    var snap = await db.collection('brokers').get();
    var migrated = 0;
    var skipped = 0;
    var pending = [];
    snap.docs.forEach(function(doc) {
      var d = doc.data() || {};
      if (d.passwordHash && isPasswordHashed(d.passwordHash)) { skipped += 1; return; }
      var plain = String(d.password || '').trim();
      if (!plain) { skipped += 1; return; }
      var fields = passwordFieldsForStorage(plain);
      pending.push({
        ref: doc.ref,
        data: {
          passwordHash: fields.passwordHash,
          password: '',
          passwordMigratedAt: new Date().toISOString(),
        },
      });
      migrated += 1;
    });
    var chunk;
    for (chunk = 0; chunk < pending.length; chunk += 400) {
      var batch = db.batch();
      var slice = pending.slice(chunk, chunk + 400);
      var ci;
      for (ci = 0; ci < slice.length; ci++) {
        batch.set(slice[ci].ref, slice[ci].data, { merge: true });
      }
      await batch.commit();
    }
    return res.json({ ok: true, migrated: migrated, skipped: skipped, total: snap.size });
  } catch (err) {
    console.error('adminMigrateBrokerPasswords:', err);
    return res.status(500).json({ error: err.message });
  }
});

/** Corretor autenticado atualiza próprio perfil (sem senha). */
exports.brokerUpdateMe = functions.https.onRequest(async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    var token = extractIdToken(req);
    if (!token) return res.status(401).json({ error: 'Token necessário' });
    var decoded = await admin.auth().verifyIdToken(token);
    var email = String(decoded.email || '').trim().toLowerCase();
    var db = admin.firestore();
    var row = await brokerAuth.findBrokerByEmail(db, email);
    if (!row || !brokerAuth.brokerIsActive(row.data)) return res.status(403).json({ error: 'Corretor não encontrado ou inativo' });
    var body = req.body || {};
    var updates = { updatedAt: new Date().toISOString() };
    if (body.name != null) updates.name = String(body.name || '').trim();
    if (body.phone != null) updates.phone = String(body.phone || '').trim();
    if (body.creci != null) updates.creci = String(body.creci || '').trim();
    await row.ref.set(updates, { merge: true });
    var merged = Object.assign({}, row.data, updates);
    return res.json({ ok: true, broker: brokerAuth.brokerPublicProfile(row.id, merged) });
  } catch (err) {
    console.error('brokerUpdateMe:', err);
    return res.status(403).json({ error: 'Token inválido ou expirado' });
  }
});

/** Cria conta Firebase Auth para admin (primeiro login; exige credencial legada válida). */
exports.adminProvisionAuth = functions.https.onRequest(async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    var body = req.body || {};
    if (!verifyAdminFromBody(body)) {
      return res.status(403).json({ error: 'Credenciais inválidas' });
    }
    var email = String(body.adminEmail || '').trim().toLowerCase();
    var password = String(body.adminPassword || '');
    var created = false;
    var synced = false;
    try {
      await admin.auth().createUser({ email: email, password: password, emailVerified: true });
      created = true;
    } catch (createErr) {
      if (createErr.code !== 'auth/email-already-exists') throw createErr;
      var existing = await admin.auth().getUserByEmail(email);
      await admin.auth().updateUser(existing.uid, { password: password, emailVerified: true });
      synced = true;
    }
    return res.json({ ok: true, email: email, created: created, synced: synced });
  } catch (err) {
    console.error('adminProvisionAuth:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Cadastro de corretor: e-mail com aprovar/rejeitar ───────────────
const FUNCTIONS_PUBLIC_BASE = CLOUD_FUNCTIONS_BASE;
const BROKER_ACTION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BROKER_ALERT_EMAIL = 'bfmarquesempreendimentos@gmail.com';
const BROKER_SITE_URL = 'https://bfmarquesempreendimentos.github.io/bfm/';

function getBrokerActionSecret() {
  var cfg = functions.config();
  if (cfg.broker && cfg.broker.action_secret) return cfg.broker.action_secret;
  if (cfg.smtp && cfg.smtp.pass) return cfg.smtp.pass;
  return 'bfm-broker-action-fallback';
}

function signBrokerAction(brokerId, action, expMs) {
  return crypto.createHmac('sha256', getBrokerActionSecret())
    .update(String(brokerId) + '|' + action + '|' + String(expMs))
    .digest('hex');
}

function verifyBrokerAction(brokerId, action, expMs, sig) {
  if (!brokerId || !action || !sig || !expMs) return false;
  if (Date.now() > Number(expMs)) return false;
  var expected = signBrokerAction(brokerId, action, expMs);
  try {
    var a = Buffer.from(String(sig));
    var b = Buffer.from(String(expected));
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

function buildBrokerActionUrl(brokerId, action) {
  var exp = Date.now() + BROKER_ACTION_TTL_MS;
  var sig = signBrokerAction(brokerId, action, exp);
  return FUNCTIONS_PUBLIC_BASE + '/brokerRegistrationAction?id=' + encodeURIComponent(brokerId) +
    '&action=' + encodeURIComponent(action) + '&exp=' + exp + '&sig=' + sig;
}

function brokerRegistrationComplete(body) {
  var name = String((body && body.name) || '').trim();
  var cpf = String((body && body.cpf) || '').replace(/\D/g, '');
  var email = String((body && body.email) || '').trim().toLowerCase();
  var phone = String((body && body.phone) || '').trim();
  var creci = String((body && body.creci) || '').trim();
  var password = String((body && body.password) || '').trim();
  return !!(name && cpf.length === 11 && email && phone && creci && password);
}

function escapeBrokerEmailHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildBrokerRegistrationAlertHtml(broker, opts) {
  opts = opts || {};
  var autoApproved = !!opts.autoApproved;
  var approveUrl = buildBrokerActionUrl(broker.id, 'approve');
  var rejectUrl = buildBrokerActionUrl(broker.id, 'reject');
  var title = autoApproved
    ? 'Novo Corretor Cadastrado (Aprovacao Automatica)'
    : 'Novo Corretor Solicitou Acesso';
  var statusHtml = autoApproved
    ? '<p style="color:#27ae60;">Este corretor foi <strong>aprovado automaticamente</strong> (todos os campos preenchidos).</p>'
    : '<p style="color:#e67e22;">Este corretor aguarda <strong>aprovacao manual</strong>.</p>';
  var buttonsHtml = autoApproved
    ? ('<p style="margin-top:20px;"><a href="' + rejectUrl + '" style="display:inline-block;background:#e74c3c;color:#fff;padding:12px 22px;text-decoration:none;border-radius:8px;font-weight:bold;">Rejeitar cadastro</a></p>')
    : ('<p style="margin-top:20px;">' +
      '<a href="' + approveUrl + '" style="display:inline-block;background:#27ae60;color:#fff;padding:12px 22px;text-decoration:none;border-radius:8px;font-weight:bold;margin-right:10px;">Aprovar corretor</a>' +
      '<a href="' + rejectUrl + '" style="display:inline-block;background:#e74c3c;color:#fff;padding:12px 22px;text-decoration:none;border-radius:8px;font-weight:bold;">Rejeitar cadastro</a>' +
      '</p>');
  return (
    '<div style="font-family:Arial,sans-serif;max-width:640px;">' +
    '<h2>' + title + '</h2>' +
    '<p><strong>Nome:</strong> ' + escapeBrokerEmailHtml(broker.name) + '</p>' +
    '<p><strong>CPF:</strong> ' + escapeBrokerEmailHtml(broker.cpf) + '</p>' +
    '<p><strong>Email:</strong> ' + escapeBrokerEmailHtml(broker.email) + '</p>' +
    '<p><strong>Telefone:</strong> ' + escapeBrokerEmailHtml(broker.phone) + '</p>' +
    '<p><strong>CRECI:</strong> ' + escapeBrokerEmailHtml(broker.creci || 'Nao informado') + '</p>' +
    '<p><strong>Data:</strong> ' + escapeBrokerEmailHtml(new Date().toLocaleString('pt-BR')) + '</p>' +
    '<hr>' + statusHtml + buttonsHtml +
    '<p style="font-size:12px;color:#777;margin-top:24px;">Links validos por 7 dias. Tambem pode gerenciar em <a href="' + BROKER_SITE_URL + 'admin.html">admin.html</a>.</p>' +
    '</div>'
  );
}

async function queueBrokerRegistrationAlertEmail(db, brokerId, broker, autoApproved) {
  if (!db || !brokerId) return;
  var payload = {
    name: broker.name,
    cpf: broker.cpf,
    email: broker.email,
    phone: broker.phone,
    creci: broker.creci,
    id: brokerId,
  };
  var subject = autoApproved
    ? 'Novo Corretor Aprovado Automaticamente - ' + broker.name
    : 'Novo Corretor Solicita Acesso - ' + broker.name;
  await db.collection('emailQueue').add({
    to: BROKER_ALERT_EMAIL,
    subject: subject,
    body: buildBrokerRegistrationAlertHtml(payload, { autoApproved: autoApproved }),
    createdAt: new Date().toISOString(),
    type: 'broker_registration',
    brokerId: brokerId,
  });
}

async function sendBrokerWelcomeEmail(db, broker) {
  if (!db || !broker || !broker.email) return;
  var siteUrl = BROKER_SITE_URL;
  await db.collection('emailQueue').add({
    to: broker.email,
    subject: 'Acesso Aprovado - B F Marques Empreendimentos',
    body: (
      '<h2>Ola, ' + escapeBrokerEmailHtml(broker.name) + '!</h2>' +
      '<p>Seu cadastro como corretor foi <strong>aprovado</strong>.</p>' +
      '<p>Voce ja pode acessar o sistema e realizar reservas.</p>' +
      '<p><a href="' + siteUrl + '">' + siteUrl + '</a></p>' +
      '<p>Atenciosamente,<br><strong>B F Marques Empreendimentos</strong></p>'
    ),
    createdAt: new Date().toISOString(),
    type: 'broker_welcome',
    brokerId: broker.id || '',
  });
}

function renderBrokerActionResultPage(title, message, ok) {
  var color = ok ? '#27ae60' : '#e74c3c';
  return (
    '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + title + '</title></head><body style="font-family:Arial,sans-serif;padding:24px;max-width:560px;margin:0 auto;">' +
    '<h1 style="color:' + color + ';">' + title + '</h1><p>' + message + '</p>' +
    '<p><a href="' + BROKER_SITE_URL + 'admin.html">Abrir painel admin</a></p></body></html>'
  );
}

// ─── API de Cadastro de Corretor (server-side, garantido) ─────────────
exports.registerBroker = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  try {
    const body = req.body || {};
    const { name, cpf, email, phone, creci, password } = body;
    const emailNorm = (email || '').trim().toLowerCase();
    if (!name || !emailNorm || !password) {
      return res.status(400).json({ error: 'nome, email e senha obrigatórios' });
    }
    const autoApproved = brokerRegistrationComplete(body);
    const db = admin.firestore();
    const existing = await db.collection('brokers').where('email', '==', emailNorm).get();
    if (!existing.empty) {
      return res.status(409).json({ error: 'Email já cadastrado' });
    }
    var pwdFields = passwordFieldsForStorage(password || '');
    const docRef = await db.collection('brokers').add({
      name: name || '',
      cpf: (cpf || '').replace(/\D/g, ''),
      email: emailNorm,
      phone: phone || '',
      creci: creci || '',
      passwordHash: pwdFields.passwordHash,
      password: '',
      isActive: autoApproved,
      whatsappCampaignOptOut: false,
      createdAt: new Date().toISOString(),
      registrationStatus: autoApproved ? 'auto_approved' : 'pending',
    });
    try {
      await queueBrokerRegistrationAlertEmail(db, docRef.id, {
        name: name || '',
        cpf: (cpf || '').replace(/\D/g, ''),
        email: emailNorm,
        phone: phone || '',
        creci: creci || '',
      }, autoApproved);
    } catch (mailErr) {
      console.error('Erro ao enfileirar e-mail de cadastro:', mailErr);
    }
    return res.json({ success: true, id: docRef.id, isActive: autoApproved, autoApproved: autoApproved });
  } catch (err) {
    console.error('Erro ao cadastrar corretor:', err);
    return res.status(500).json({ error: err.message });
  }
});

exports.brokerRegistrationAction = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') {
    return res.status(405).send(renderBrokerActionResultPage('Metodo nao permitido', 'Use o link do e-mail.', false));
  }
  try {
    var brokerId = String(req.query.id || '').trim();
    var action = String(req.query.action || '').trim().toLowerCase();
    var exp = req.query.exp;
    var sig = req.query.sig;
    if (!brokerId || (action !== 'approve' && action !== 'reject')) {
      return res.status(400).send(renderBrokerActionResultPage('Link invalido', 'Parametros incompletos.', false));
    }
    if (!verifyBrokerAction(brokerId, action, exp, sig)) {
      return res.status(403).send(renderBrokerActionResultPage('Link expirado', 'Solicite novo cadastro ou use o painel admin.', false));
    }
    var db = admin.firestore();
    var ref = db.collection('brokers').doc(brokerId);
    var snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).send(renderBrokerActionResultPage('Corretor nao encontrado', 'Cadastro removido ou invalido.', false));
    }
    var data = snap.data() || {};
    if (action === 'approve') {
      await ref.set({
        isActive: true,
        whatsappCampaignOptOut: false,
        registrationStatus: 'approved',
        approvedAt: new Date().toISOString(),
        approvedVia: 'email_link',
      }, { merge: true });
      await sendBrokerWelcomeEmail(db, {
        id: brokerId,
        name: data.name || '',
        email: data.email || '',
      });
      return res.status(200).send(renderBrokerActionResultPage(
        'Corretor aprovado',
        escapeBrokerEmailHtml(data.name || 'Corretor') + ' foi aprovado com sucesso.',
        true
      ));
    }
    await ref.set({
      isActive: false,
      registrationStatus: 'rejected',
      rejectedAt: new Date().toISOString(),
      rejectedVia: 'email_link',
    }, { merge: true });
    return res.status(200).send(renderBrokerActionResultPage(
      'Cadastro rejeitado',
      'O cadastro de ' + escapeBrokerEmailHtml(data.name || 'corretor') + ' foi marcado como rejeitado.',
      true
    ));
  } catch (err) {
    console.error('brokerRegistrationAction:', err);
    return res.status(500).send(renderBrokerActionResultPage('Erro', 'Tente novamente pelo painel admin.', false));
  }
});

// ─── API de Vendas: listagem pública removida (privacidade). Use clientPropertySalesMe ou clientSaleEligibility. ────
exports.getPropertySales = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
  return res.status(410).json({
    error: 'deprecated',
    message: 'Use POST clientSaleEligibility ou clientPropertySalesMe com token.',
    sales: [],
  });
});

exports.adminPropertySalesList = functions.https.onRequest((req, res) =>
  propertySalesHandlers.adminPropertySalesList(req, res)
);
exports.adminPropertySaleMutate = functions.https.onRequest((req, res) =>
  propertySalesHandlers.adminPropertySaleMutate(req, res)
);
exports.adminMergeClientProperty = functions.https.onRequest((req, res) =>
  propertySalesHandlers.adminMergeClientProperty(req, res)
);
exports.clientPropertySalesMe = functions.https.onRequest((req, res) =>
  propertySalesHandlers.clientPropertySalesMe(req, res)
);
exports.clientSaleEligibility = functions.https.onRequest((req, res) =>
  propertySalesHandlers.clientSaleEligibility(req, res)
);
exports.getPublicUnitOverrides = functions.https.onRequest((req, res) =>
  propertySalesHandlers.getPublicUnitOverrides(req, res)
);
exports.adminMigrateLegacySaleSlots = functions.https.onRequest((req, res) =>
  propertySalesHandlers.adminMigrateLegacySaleSlots(req, res)
);
exports.adminSetUnitStatusOverrides = functions.https.onRequest((req, res) =>
  propertySalesHandlers.adminSetUnitStatusOverrides(req, res)
);
exports.adminSyncCatalogUnitStatuses = functions.https.onRequest((req, res) =>
  propertySalesHandlers.adminSyncCatalogUnitStatuses(req, res)
);

exports.brokerCreateReservation = functions.https.onRequest((req, res) =>
  reservationsHandlers.brokerCreateReservation(req, res)
);
exports.brokerMyReservations = functions.https.onRequest((req, res) =>
  reservationsHandlers.brokerMyReservations(req, res)
);
exports.adminReservationsMutate = functions.https.onRequest((req, res) =>
  reservationsHandlers.adminReservationsMutate(req, res)
);
exports.registerFcmToken = functions.https.onRequest((req, res) =>
  fcmPush.registerFcmToken(req, res)
);

// ─── API de Reparos: CRIAR (garante sync Mac/Windows - não depende do Firestore client) ──
exports.createRepair = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    const body = req.body;
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Payload inválido' });
    var repairToken = null;
    var repairAuthHeader = req.headers.authorization;
    if (repairAuthHeader && repairAuthHeader.indexOf('Bearer ') === 0) {
      repairToken = repairAuthHeader.split('Bearer ')[1];
    }
    if (!repairToken && body.idToken) repairToken = String(body.idToken);
    var repairDecoded = null;
    if (repairToken) {
      try {
        repairDecoded = await admin.auth().verifyIdToken(repairToken);
      } catch (eRepairTok) {
        return res.status(403).json({ error: 'Token inválido ou expirado' });
      }
    } else if (!(await verifyAdminAuth(req)).ok) {
      return res.status(401).json({ error: 'Autenticação necessária' });
    }
    var repairClientEmail = repairDecoded
      ? String(repairDecoded.email || '').trim().toLowerCase()
      : String(body.clientEmail || '').trim().toLowerCase();
    var repairClientUid = repairDecoded ? String(repairDecoded.uid || '') : (body.clientUid || null);
    const repair = {
      id: body.id || Date.now(),
      clientId: body.clientId || null,
      clientUid: repairClientUid || null,
      clientName: body.clientName || '',
      clientEmail: repairClientEmail || '',
      clientPhone: body.clientPhone || '',
      clientCpf: body.clientCpf || '',
      propertyId: body.propertyId || '',
      propertyTitle: body.propertyTitle || '',
      unitCode: body.unitCode || null,
      description: body.description || '',
      location: body.location || '',
      priority: body.priority || 'normal',
      attachments: Array.isArray(body.attachments) ? body.attachments : [],
      attachmentsCount: body.attachmentsCount || 0,
      attachmentsTotalSize: body.attachmentsTotalSize || 0,
      status: body.status || 'pendente',
      tipo: body.tipo || 'geral',
      responsavelId: body.responsavelId || '',
      responsavelNome: body.responsavelNome || '',
      custoEstimado: body.custoEstimado != null ? Number(body.custoEstimado) : null,
      custoTotal: body.custoTotal != null ? Number(body.custoTotal) : null,
      slaDueAt: body.slaDueAt || null,
      comentarios: Array.isArray(body.comentarios) ? body.comentarios : [],
      createdAt: body.createdAt || new Date().toISOString(),
      updatedAt: body.updatedAt || new Date().toISOString(),
      responses: Array.isArray(body.responses) ? body.responses : []
    };
    const db = admin.firestore();
    const docRef = await db.collection('repairRequests').add(repair);
    fcmPush.notifyAdmins(
      db,
      'Novo chamado de reparo',
      (repair.clientName || 'Cliente') + ' — ' + (repair.propertyTitle || repair.description || '').slice(0, 80),
      { type: 'repair', firestoreId: docRef.id },
      'https://bfmarquesempreendimentos.github.io/bfm/admin.html#repairs'
    ).catch(function() {});
    return res.status(201).json({ success: true, id: repair.id, firestoreId: docRef.id });
  } catch (err) {
    console.error('Erro ao criar reparo:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── API de Reparos: LISTAR (fallback quando cliente Firestore retorna vazio) ──
exports.getRepairs = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');

  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
  if (!(await verifyAdminAuth(req)).ok) return res.status(403).json({ error: 'Acesso negado' });

  try {
    const db = admin.firestore();
    const snapshot = await db.collection('repairRequests').get();
    const repairs = snapshot.docs.map(doc => {
      const d = doc.data();
      return { firestoreId: doc.id, ...d };
    });
    repairs.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return res.json(repairs);
  } catch (err) {
    console.error('Erro ao buscar reparos:', err);
    return res.status(500).json({ error: err.message });
  }
});

/** Painel admin: um GET com leads WhatsApp, reparos, vendas e corretores (evita várias chamadas no browser). */
exports.adminDashboardBundle = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
  if (!(await verifyAdminAuth(req)).ok) return res.status(403).json({ error: 'Acesso negado' });

  try {
    const wa = await getLeadStats();
    const db = admin.firestore();
    const [repSnap, salesSnap, brokerSnap, resSnap] = await Promise.all([
      db.collection('repairRequests').get(),
      db.collection('propertySales').get(),
      db.collection('brokers').get(),
      db.collection('reservations').get(),
    ]);
    let repairsOpen = 0;
    var repairsByStatus = { pendente: 0, em_andamento: 0, concluido: 0, cancelado: 0, outro: 0 };
    repSnap.forEach((doc) => {
      const st = String(doc.data().status || '').toLowerCase();
      if (st !== 'concluido' && st !== 'cancelado') repairsOpen++;
      if (repairsByStatus[st] != null) repairsByStatus[st]++;
      else repairsByStatus.outro++;
    });
    var reservationsPending = 0;
    var reservationsActive = 0;
    var recentReservations = [];
    resSnap.forEach(function(doc) {
      var d = doc.data() || {};
      var st = String(d.status || '');
      if (st === 'pending') reservationsPending++;
      if (st === 'active') reservationsActive++;
      recentReservations.push({
        id: doc.id,
        propertyTitle: d.propertyTitle || '',
        unitCode: d.unitCode || '',
        brokerName: d.brokerName || '',
        clientName: (d.client && d.client.name) || '',
        status: st,
        requestedAt: d.requestedAt || d.createdAt || '',
      });
    });
    recentReservations.sort(function(a, b) {
      return new Date(b.requestedAt || 0) - new Date(a.requestedAt || 0);
    });
    recentReservations = recentReservations.slice(0, 8);
    let brokersActive = 0;
    brokerSnap.forEach((doc) => {
      if (doc.data().isActive === true) brokersActive++;
    });
    var unitsDisponivel = 0;
    var unitsReservado = 0;
    var unitsAssinado = 0;
    var ovSnap = await db.collection('unit_status_overrides').get();
    ovSnap.forEach(function(doc) {
      var map = (doc.data() && doc.data().map) || {};
      var code;
      for (code in map) {
        if (!Object.prototype.hasOwnProperty.call(map, code)) continue;
        var st = String(map[code] || '').toLowerCase();
        if (st === 'disponivel') unitsDisponivel++;
        else if (st === 'reservado') unitsReservado++;
        else if (st === 'assinado' || st === 'vendido' || st === 'entregue') unitsAssinado++;
      }
    });
    var visitas = 0;
    var reservas = 0;
    var salesByMonth = {};
    var now = new Date();
    var mi;
    for (mi = 0; mi < 6; mi++) {
      var dt = new Date(now.getFullYear(), now.getMonth() - (5 - mi), 1);
      var key = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
      salesByMonth[key] = 0;
    }
    salesSnap.forEach(function(doc) {
      var d = doc.data() || {};
      if (d.visitScheduled || d.status === 'visita') visitas++;
      if (d.status === 'reservado' || d.reservationAt) reservas++;
      var saleDate = d.saleDate || d.createdAt;
      if (saleDate) {
        var sd = new Date(saleDate);
        if (!isNaN(sd.getTime())) {
          var mk = sd.getFullYear() + '-' + String(sd.getMonth() + 1).padStart(2, '0');
          if (salesByMonth[mk] != null) salesByMonth[mk]++;
        }
      }
    });
    var financeSummary = await financeHandlers.getFinanceSummaryForDashboard(db);
    var leadFunnel = {
      leadsTotal: wa.total || 0,
      leadsNovos: wa.novo || 0,
      leadsQualificados: wa.qualificado || 0,
      leadsConvertidos: wa.convertido || 0,
      visitas: visitas,
      reservas: reservas,
      vendas: salesSnap.size,
    };
    return res.json({
      wa: wa,
      repairsOpen: repairsOpen,
      repairsByStatus: repairsByStatus,
      salesCount: salesSnap.size,
      salesByMonth: salesByMonth,
      brokersActive: brokersActive,
      brokersTotal: brokerSnap.size,
      unitsDisponivel: unitsDisponivel,
      unitsReservado: unitsReservado,
      unitsAssinado: unitsAssinado,
      funnelVisitas: visitas,
      funnelReservas: reservas,
      leadFunnel: leadFunnel,
      financeSummary: financeSummary,
      reservationsPending: reservationsPending,
      reservationsActive: reservationsActive,
      recentReservations: recentReservations,
      followUpExcluded: wa.followUpExcluded || 0,
      followUpElegivel: wa.followUpElegivel || 0,
    });
  } catch (err) {
    console.error('adminDashboardBundle:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── API de Leads para o painel admin ─────────────────────────────
exports.chatbotLeads = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.sendStatus(204);

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token necessário' });
  }

  try {
    const token = authHeader.split('Bearer ')[1];
    await admin.auth().verifyIdToken(token);
  } catch (err) {
    return res.status(403).json({ error: 'Token inválido' });
  }

  try {
    const action = req.query.action || 'list';

    if (action === 'stats') {
      const stats = await getLeadStats();
      return res.json(stats);
    }

    const filters = {};
    if (req.query.status) filters.status = req.query.status;
    filters.limit = parseInt(req.query.limit) || 100;

    const leads = await getAllLeads(filters);
    return res.json({ leads, total: leads.length });
  } catch (err) {
    console.error('Erro ao buscar leads:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Inbox de Atendimento WhatsApp ──────────────────────────────
function allowCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Key');
}

exports.chatbotInbox = functions.https.onRequest(async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
  if (!(await verifyAdminAuth(req)).ok) return res.status(403).json({ error: 'Acesso negado' });

  try {
    const action = req.query.action || 'list';
    const db = admin.firestore();

    if (action === 'stats') {
      const stats = await getLeadStats();
      const brokerIndex = await buildBrokerPhoneIndex(db);
      const snapAll = await db.collection('chatbot_leads').limit(400).get();
      var brokersInWa = 0;
      var leadsOnlyInWa = 0;
      snapAll.forEach(function(doc) {
        const data = doc.data() || {};
        const phone = normalizeWhatsAppPhone(data.phone || doc.id) || doc.id;
        if (lookupBrokerInIndex(brokerIndex, phone)) brokersInWa += 1;
        else leadsOnlyInWa += 1;
      });
      return res.json(Object.assign({}, stats, {
        brokersInWa: brokersInWa,
        leadsOnlyInWa: leadsOnlyInWa,
      }));
    }

    if (action === 'conversation' && req.query.phone) {
      const raw = String(req.query.phone).trim();
      const norm = normalizeWhatsAppPhone(raw) || raw;
      let lead = await getLeadByPhone(norm);
      if (!lead && raw !== norm) {
        lead = await getLeadByPhone(raw);
      }
      if (!lead) return res.status(404).json({ error: 'Conversa não encontrada' });
      const brokerIndexConvo = await buildBrokerPhoneIndex(db);
      const brokerMatch = lookupBrokerInIndex(brokerIndexConvo, norm) || lookupBrokerInIndex(brokerIndexConvo, raw);
      if (brokerMatch) {
        lead = Object.assign({}, lead, {
          isBroker: true,
          brokerId: brokerMatch.id,
          brokerName: brokerMatch.name,
          contactType: 'corretor',
        });
      } else {
        lead = Object.assign({}, lead, { isBroker: false, contactType: 'lead' });
      }
      /** Mensagens ficam em chatbot_conversations/{telefone normalizado} */
      const convoPhone = norm;
      let messages = await getConversationHistory(convoPhone, 500);
      if (messages.length === 0 && raw !== norm) {
        messages = await getConversationHistory(raw, 500);
      }
      return res.json({ lead, messages });
    }

    const statusFilter = req.query.status;
    const categoriaFilter = req.query.categoria;
    const modoHumanoFilter = req.query.modo_humano;
    const contactType = String(req.query.contact_type || '').trim().toLowerCase();
    const unreadOnly = req.query.unread === '1' || req.query.unread === 'true';
    const revisarBotOnly = req.query.revisar_bot === '1' || req.query.revisar_bot === 'true';
    const search = (req.query.search || '').trim().toLowerCase();
    const limit = Math.min(parseInt(req.query.limit) || 100, 200);
    const brokerIndex = await buildBrokerPhoneIndex(db);

    let query = db.collection('chatbot_leads').orderBy('updatedAt', 'desc').limit(Math.min(limit * 2, 300));
    const snapshot = await query.get();
    let leads = [];
    snapshot.forEach(function(doc) {
      const data = doc.data() || {};
      const phone = normalizeWhatsAppPhone(data.phone || doc.id) || doc.id;
      const broker = lookupBrokerInIndex(brokerIndex, phone);
      leads.push({
        id: doc.id,
        phone: phone,
        isBroker: !!broker,
        brokerId: broker ? broker.id : null,
        brokerName: broker ? broker.name : null,
        contactType: broker ? 'corretor' : 'lead',
        ...data,
      });
    });

    if (statusFilter) leads = leads.filter(l => (l.status || 'novo') === statusFilter);
    if (categoriaFilter) leads = leads.filter(l => (l.categoria || 'geral') === categoriaFilter);
    if (modoHumanoFilter === 'true') leads = leads.filter(l => !!l.modo_humano);
    else if (modoHumanoFilter === 'false') leads = leads.filter(l => !l.modo_humano);
    if (unreadOnly) leads = leads.filter(l => (l.adminUnreadCount || 0) > 0);
    if (revisarBotOnly) leads = leads.filter(l => !!l.revisarBot);
    if (contactType === 'brokers' || contactType === 'corretores') {
      leads = leads.filter(function(l) { return !!l.isBroker; });
    } else if (contactType === 'leads') {
      leads = leads.filter(function(l) { return !l.isBroker; });
    }
    if (search) {
      leads = leads.filter(function(l) {
        return (l.name || '').toLowerCase().indexOf(search) >= 0 ||
          (l.phone || '').indexOf(search) >= 0 ||
          (l.lastActivityPreview || '').toLowerCase().indexOf(search) >= 0 ||
          (l.encaminhadoMotivo || '').toLowerCase().indexOf(search) >= 0 ||
          (l.notes || '').toLowerCase().indexOf(search) >= 0;
      });
    }

    leads = leads.slice(0, limit);
    leads.sort(function(a, b) {
      var da = a.lastMessageAt || a.updatedAt || a.createdAt || '';
      var db_ = b.lastMessageAt || b.updatedAt || b.createdAt || '';
      return db_.localeCompare(da);
    });

    return res.json({ leads: leads, total: leads.length });
  } catch (err) {
    console.error('Erro chatbotInbox:', err);
    return res.status(500).json({ error: err.message });
  }
});

exports.chatbotInboxAssume = functions
  .runWith({ secrets: ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'] })
  .https.onRequest(async (req, res) => {
    allowCors(res);
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
    if (!(await verifyAdminAuth(req)).ok) return res.status(403).json({ error: 'Acesso negado' });

    try {
      const body = req.body || {};
      const raw = (body.phone || '').trim();
      const phone = normalizeWhatsAppPhone(raw) || raw;
      const adminEmail = (body.adminEmail || body.admin || 'admin').trim();
      if (!phone) return res.status(400).json({ error: 'phone obrigatório' });

      await setModoHumano(phone, adminEmail);
      const guidance = String(body.guidance || body.notaParaBia || body.initialMessage || '').trim();
      if (guidance.length >= 3) {
        await recordAdminBiaTraining(phone, guidance, adminEmail);
      }
      return res.json({ success: true, message: 'Conversa assumida' });
    } catch (err) {
      console.error('Erro ao assumir conversa:', err);
      return res.status(500).json({ error: err.message });
    }
  });

exports.chatbotInboxReturnToBot = functions.https.onRequest(async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  if (!(await verifyAdminAuth(req)).ok) return res.status(403).json({ error: 'Acesso negado' });

  try {
    const body = req.body || {};
    const raw = (body.phone || '').trim();
    const phone = normalizeWhatsAppPhone(raw) || raw;
    if (!phone) return res.status(400).json({ error: 'phone obrigatório' });

    await returnToBot(phone);
    return res.json({ success: true, message: 'Bot reassumiu a conversa' });
  } catch (err) {
    console.error('Erro ao devolver para bot:', err);
    return res.status(500).json({ error: err.message });
  }
});

exports.chatbotInboxSend = functions
  .runWith({ secrets: ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'] })
  .https.onRequest(async (req, res) => {
    allowCors(res);
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
    if (!(await verifyAdminAuth(req)).ok) return res.status(403).json({ error: 'Acesso negado' });

    try {
      const body = req.body || {};
      const raw = (body.phone || '').trim();
      const phone = normalizeWhatsAppPhone(raw) || raw;
      const text = (body.text || body.message || '').trim();
      const caption = text;
      const mediaB64 = body.mediaBase64 || body.fileBase64;
      const mediaMime = (body.mediaMimeType || body.mimeType || '').trim();
      const mediaName = (body.mediaFileName || body.fileName || 'arquivo').trim();

      if (!phone) return res.status(400).json({ error: 'phone obrigatório' });

      if (mediaB64 && mediaMime) {
        const buf = Buffer.from(String(mediaB64), 'base64');
        if (buf.length > 14 * 1024 * 1024) {
          return res.status(400).json({ error: 'Arquivo muito grande (máx. 14 MB)' });
        }
        const up = await uploadMediaBuffer(buf, mediaMime, mediaName, {});
        await sendMediaById(phone, up.waType, up.id, {
          caption: caption,
          filename: mediaName,
        });
        const tipoLabel = up.waType === 'image' ? 'Imagem' : up.waType === 'video' ? 'Vídeo' : up.waType === 'audio' ? 'Áudio' : 'Documento';
        const line = caption || ('[' + tipoLabel + ': ' + mediaName + ']');
        await saveMessage(phone, 'assistant', line, 'admin', {
          attachmentType: up.waType,
          fileName: mediaName,
          whatsappMediaId: up.id,
          mimeType: mediaMime,
          adminEmail: (body.adminEmail || body.admin || 'admin').trim(),
        });
        await recordInboundActivity(phone, line);
        return res.json({ success: true, message: 'Mídia enviada' });
      }

      if (!text) return res.status(400).json({ error: 'Digite uma mensagem ou anexe um arquivo' });

      await sendTextMessage(phone, text);
      await saveMessage(phone, 'assistant', text, 'admin', {
        adminEmail: (body.adminEmail || body.admin || 'admin').trim(),
      });
      await recordInboundActivity(phone, text);
      return res.json({ success: true, message: 'Mensagem enviada' });
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err);
      return res.status(500).json({ error: err.message });
    }
  });

/** Proxy de mídia recebida do WhatsApp (áudio/vídeo/imagem) para o painel reproduzir — URLs Meta exigem token. */
exports.chatbotInboxWhatsAppMedia = functions
  .runWith({ secrets: ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'] })
  .https.onRequest(async (req, res) => {
    allowCors(res);
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    if (req.method !== 'GET') return res.status(405).send('Method not allowed');

    try {
      const mediaId = String(req.query.mediaId || '').trim();
      if (!mediaId || !/^[0-9A-Za-z_.-]+$/.test(mediaId)) {
        return res.status(400).send('mediaId inválido');
      }
      const { buffer, mimeType } = await getWhatsAppMediaBuffer(mediaId, {});
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Content-Type', mimeType || 'application/octet-stream');
      res.set('Cache-Control', 'private, max-age=120');
      return res.status(200).send(buffer);
    } catch (err) {
      console.error('chatbotInboxWhatsAppMedia:', err.response?.data || err.message);
      return res.status(502).send('Falha ao buscar mídia');
    }
  });

exports.chatbotInboxDeleteMessage = functions.https.onRequest(async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  if (!(await verifyAdminAuth(req)).ok) return res.status(403).json({ error: 'Acesso negado' });

  try {
    const body = req.body || {};
    const raw = (body.phone || '').trim();
    const phone = normalizeWhatsAppPhone(raw) || raw;
    const messageId = (body.messageId || body.id || '').trim();
    if (!phone || !messageId) return res.status(400).json({ error: 'phone e messageId obrigatórios' });

    await deleteConversationMessage(phone, messageId);
    return res.json({ success: true, message: 'Mensagem removida do histórico' });
  } catch (err) {
    console.error('Erro ao apagar mensagem:', err);
    return res.status(400).json({ error: err.message });
  }
});

exports.chatbotInboxMarkRead = functions.https.onRequest(async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  if (!(await verifyAdminAuth(req)).ok) return res.status(403).json({ error: 'Acesso negado' });

  try {
    const body = req.body || {};
    const raw = (body.phone || '').trim();
    const phone = normalizeWhatsAppPhone(raw) || raw;
    if (!phone) return res.status(400).json({ error: 'phone obrigatório' });

    await markAdminRead(phone);
    return res.json({ success: true });
  } catch (err) {
    console.error('Erro ao marcar como lido:', err);
    return res.status(500).json({ error: err.message });
  }
});

exports.chatbotInboxUpdateStatus = functions.https.onRequest(async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  if (!(await verifyAdminAuth(req)).ok) return res.status(403).json({ error: 'Acesso negado' });

  try {
    const body = req.body || {};
    const raw = (body.phone || '').trim();
    const phone = normalizeWhatsAppPhone(raw) || raw;
    const status = (body.status || 'novo').trim();
    if (!phone) return res.status(400).json({ error: 'phone obrigatório' });

    const validStatuses = ['novo', 'qualificado', 'agendado', 'convertido', 'encaminhado'];
    const newStatus = validStatuses.indexOf(status) >= 0 ? status : 'novo';

    const db = admin.firestore();
    await db.collection('chatbot_leads').doc(phone).update({
      status: newStatus,
      updatedAt: new Date().toISOString(),
    });
    return res.json({ success: true });
  } catch (err) {
    console.error('Erro ao atualizar status:', err);
    return res.status(500).json({ error: err.message });
  }
});

exports.chatbotInboxFollowUp = functions.https.onRequest(async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  if (!(await verifyAdminAuth(req)).ok) return res.status(403).json({ error: 'Acesso negado' });
  try {
    const body = req.body || {};
    const raw = (body.phone || '').trim();
    const phone = normalizeWhatsAppPhone(raw) || raw;
    if (!phone) return res.status(400).json({ error: 'phone obrigatório' });
    const excluded = body.excluded !== false && body.excluded !== 'false';
    const reason = String(body.reason || (excluded ? 'manual_admin' : '')).trim();
    const by = String(body.by || body.adminEmail || 'admin').trim();
    await leadSetFollowUpExclusion(phone, excluded, reason, by);
    return res.json({ success: true, phone: phone, followUpExcluded: excluded });
  } catch (err) {
    console.error('chatbotInboxFollowUp:', err);
    return res.status(500).json({ error: err.message });
  }
});

exports.chatbotInboxUpdateCategory = functions.https.onRequest(async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  if (!(await verifyAdminAuth(req)).ok) return res.status(403).json({ error: 'Acesso negado' });

  try {
    const body = req.body || {};
    const raw = (body.phone || '').trim();
    const phone = normalizeWhatsAppPhone(raw) || raw;
    const categoria = (body.categoria || body.category || 'geral').trim();
    if (!phone) return res.status(400).json({ error: 'phone obrigatório' });

    const db = admin.firestore();
    await db.collection('chatbot_leads').doc(phone).update({
      categoria: ['vendas', 'duvidas', 'sugestoes', 'geral'].indexOf(categoria) >= 0 ? categoria : 'geral',
      updatedAt: new Date().toISOString(),
    });
    return res.json({ success: true });
  } catch (err) {
    console.error('Erro ao atualizar categoria:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Follow-up automático sequencial (opção B — a cada 2 horas) ───
exports.chatbotFollowUp = functions
  .runWith({
    secrets: ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'],
    timeoutSeconds: 300,
    memory: '512MB',
  })
  .pubsub.schedule('every 2 hours')
  .timeZone('America/Sao_Paulo')
  .onRun(async () => {
    const db = admin.firestore();
    const result = await processAllFollowUps(db);
    console.log('chatbotFollowUp:', JSON.stringify(result));
    return null;
  });

// ─── Campanha semanal WhatsApp para corretores ───────────────────
exports.brokerWeeklyCampaign = functions
  .runWith({
    secrets: ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'],
    timeoutSeconds: 540,
    memory: '512MB',
  })
  .pubsub.schedule('every monday 08:00')
  .timeZone('America/Sao_Paulo')
  .onRun(async () => {
    const result = await sendWeeklyBrokerCampaignInternal({ type: 'weekly', force: false });
    console.log('brokerWeeklyCampaign:', JSON.stringify(result));
    return null;
  });

async function runWeeklyCampaignResumeIfPending(label) {
  const db = admin.firestore();
  const weekKey = getCampaignRunWeekKey(new Date());
  const incomplete = await findIncompleteWeeklyCampaignRun(db, weekKey);
  if (!incomplete) {
    console.log(label + ': nenhuma campanha parcial pendente para ' + weekKey);
    return null;
  }
  const result = await sendWeeklyBrokerCampaignInternal({ type: 'weekly', force: false, resume: true });
  console.log(label + ':', JSON.stringify(result));
  return null;
}

exports.brokerWeeklyCampaignResume = functions
  .runWith({
    secrets: ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'],
    timeoutSeconds: 540,
    memory: '512MB',
  })
  .pubsub.schedule('every monday 08:15')
  .timeZone('America/Sao_Paulo')
  .onRun(function() {
    return runWeeklyCampaignResumeIfPending('brokerWeeklyCampaignResume');
  });

exports.brokerWeeklyCampaignResume2 = functions
  .runWith({
    secrets: ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'],
    timeoutSeconds: 540,
    memory: '512MB',
  })
  .pubsub.schedule('every monday 08:30')
  .timeZone('America/Sao_Paulo')
  .onRun(function() {
    return runWeeklyCampaignResumeIfPending('brokerWeeklyCampaignResume2');
  });

exports.brokerCampaignConfig = functions.https.onRequest(async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);

  try {
    const db = admin.firestore();
    const ref = db.collection('broker_campaign').doc('config');
    if (req.method === 'GET') {
      const config = await getBrokerCampaignConfig(db);
      return res.json(config);
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
    if (!(await verifyAdminAuth(req)).ok) return res.status(403).json({ error: 'Acesso negado' });

    const body = req.body || {};
    const allowed = {
      enabled: body.enabled === true || body.enabled === false ? body.enabled : undefined,
      siteUrl: body.siteUrl ? String(body.siteUrl).trim() : undefined,
      whatsappContato: body.whatsappContato ? String(body.whatsappContato).trim() : undefined,
      weeklyTitle: body.weeklyTitle ? String(body.weeklyTitle).trim() : undefined,
      templateName: body.templateName !== undefined ? String(body.templateName || '').trim() : undefined,
      templateNameMulti: body.templateNameMulti !== undefined ? String(body.templateNameMulti || '').trim() : undefined,
      preferMultiVarTemplate: body.preferMultiVarTemplate === true || body.preferMultiVarTemplate === false
        ? body.preferMultiVarTemplate : undefined,
      templateMediaImageName: body.templateMediaImageName !== undefined
        ? String(body.templateMediaImageName || '').trim() : undefined,
      templateMediaVideoName: body.templateMediaVideoName !== undefined
        ? String(body.templateMediaVideoName || '').trim() : undefined,
      templateLanguage: body.templateLanguage ? String(body.templateLanguage).trim() : undefined,
      ctaText: body.ctaText ? String(body.ctaText).trim() : undefined,
      usefulTips: Array.isArray(body.usefulTips) ? body.usefulTips.map(function(t) { return String(t || '').trim(); }).filter(Boolean) : undefined,
      featuredPropertyId: body.featuredPropertyId !== undefined
        ? (body.featuredPropertyId === '' || body.featuredPropertyId === null ? null : Number(body.featuredPropertyId))
        : undefined,
      marketNewsTitle: body.marketNewsTitle !== undefined ? String(body.marketNewsTitle || '').trim() : undefined,
      marketNewsText: body.marketNewsText !== undefined ? String(body.marketNewsText || '').trim() : undefined,
      updatedAt: new Date().toISOString(),
    };
    const payload = {};
    Object.keys(allowed).forEach(function(k) {
      if (allowed[k] !== undefined) payload[k] = allowed[k];
    });
    await ref.set(payload, { merge: true });
    const config = await getBrokerCampaignConfig(db);
    return res.json({ success: true, config: config });
  } catch (err) {
    console.error('brokerCampaignConfig:', err);
    return res.status(500).json({ error: err.message });
  }
});

exports.brokerCampaignDiscoverWaba = functions
  .runWith({ secrets: ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'] })
  .https.onRequest(async (req, res) => {
    allowCors(res);
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
    try {
      const body = req.body || {};
      if (!(await verifyAdminAuth(req)).ok) return res.status(403).json({ error: 'Acesso negado' });
      const db = admin.firestore();
      const resolved = await getOrResolveWabaId(db);
      const listed = resolved.wabaId
        ? await listApprovedMessageTemplates({ wabaId: resolved.wabaId })
        : { ok: false, templates: [], error: resolved.error || 'WABA não encontrado' };
      return res.json({
        ok: !!resolved.wabaId,
        wabaId: resolved.wabaId || '',
        source: resolved.source || '',
        templates: listed.ok ? listed.templates : [],
        templateError: listed.ok ? '' : (listed.error || ''),
      });
    } catch (err) {
      console.error('brokerCampaignDiscoverWaba:', err);
      return res.status(500).json({ error: err.message });
    }
  });

exports.brokerCampaignSaveWaba = functions
  .runWith({ secrets: ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'] })
  .https.onRequest(async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    const body = req.body || {};
    if (!(await verifyAdminAuth(req)).ok) return res.status(403).json({ error: 'Acesso negado' });
    const wabaId = String(body.wabaId || '').replace(/\D/g, '');
    if (!wabaId || wabaId.length < 8) {
      return res.status(400).json({ error: 'Informe o ID da conta WhatsApp (WABA), só números.' });
    }
    const db = admin.firestore();
    await saveWhatsappWabaId(db, wabaId, 'admin_manual');
    const sync = await syncWhatsAppCloudSettings(db, {
      wabaId: wabaId,
      supportPhone: (await getBrokerCampaignConfig(db)).whatsappContato,
    });
    const listed = await listApprovedMessageTemplates({ wabaId: wabaId });
    var campTpl = findApprovedTemplatesByName(
      listed.ok ? listed.templates : [],
      'campanha_corretor_msg'
    );
    return res.json({
      success: true,
      wabaId: wabaId,
      templatesOk: !!listed.ok,
      templates: listed.ok ? listed.templates.slice(0, 20) : [],
      error: listed.ok ? '' : (listed.error || ''),
      phoneMatch: !!sync.phoneMatch,
      biaPhoneNumberId: sync.phoneNumberId || '',
      biaPhoneDisplay: sync.phoneDisplay || '',
      cloudPhoneNumberId: sync.phoneNumberId || '',
      envMisconfiguredAsWaba: !!sync.envMisconfiguredAsWaba,
      syncHint: sync.envMisconfiguredAsWaba
        ? 'Corrigido: o Firebase tinha o ID da conta no lugar do número. Campanha usará o número da Bia automaticamente.'
        : (sync.syncSource === 'bia_webhook' ? 'Número da Bia capturado do atendimento (webhook).' : ''),
      phoneLinkWarning: sync.phoneMatch ? '' : (sync.phoneLinkError || ''),
      phonesOnWaba: sync.phonesOnWaba || [],
      campanhaCorretorLanguages: campTpl.map(function(t) { return t.language; }),
    });
  } catch (err) {
    console.error('brokerCampaignSaveWaba:', err);
    return res.status(500).json({ error: err.message });
  }
});

exports.brokerCampaignWhatsAppDiag = functions
  .runWith({ secrets: ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'] })
  .https.onRequest(async (req, res) => {
    allowCors(res);
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
    if (!(await verifyAdminAuth(req)).ok) return res.status(403).json({ error: 'Acesso negado' });
    try {
      const db = admin.firestore();
      const settings = await loadWhatsappSettings(db);
      const config = await getBrokerCampaignConfig(db);
      const sync = await syncWhatsAppCloudSettings(db, {
        wabaId: settings.wabaId,
        supportPhone: config.whatsappContato,
      });
      const token = process.env.WHATSAPP_TOKEN;
      const debugWabas = token ? await resolveAllWabaIdsFromDebugToken(token) : [];
      var wabaScan = [];
      var wi;
      for (wi = 0; wi < debugWabas.length; wi++) {
        var plist = await listWabaPhoneNumbers(token, debugWabas[wi]);
        wabaScan.push({
          wabaId: debugWabas[wi],
          phones: (plist || []).map(function(p) {
            return { id: p.id, display: p.display_phone_number || '' };
          }),
        });
      }
      const savedAsPhone = settings.wabaId
        ? await resolvePhoneNodeToWaba(token, settings.wabaId)
        : null;
      const meAssets = token ? await discoverWhatsAppAssetsFromMe(token) : { wabas: [], phones: [] };
      const phoneForTpl = settings.phoneNumberId || settings.lastWebhookPhoneNumberId || '';
      const tplRow = phoneForTpl
        ? await findApprovedTemplateRow({ phoneNumberId: phoneForTpl }, 'campanha_corretor_msg', 'pt_BR')
        : null;
      const tplListed = phoneForTpl
        ? await listApprovedMessageTemplates({ phoneNumberId: phoneForTpl })
        : { ok: false, templates: [] };
      return res.json({
        firestore: {
          wabaId: settings.wabaId || '',
          phoneNumberId: settings.phoneNumberId || '',
          lastWebhookPhoneNumberId: settings.lastWebhookPhoneNumberId || '',
          lastWebhookPhoneAt: settings.lastWebhookPhoneAt || '',
          syncSource: settings.syncSource || '',
        },
        envPhoneNumberId: String(process.env.WHATSAPP_PHONE_NUMBER_ID || ''),
        envMisconfiguredAsWaba: !!(process.env.WHATSAPP_PHONE_NUMBER_ID &&
          settings.wabaId &&
          String(process.env.WHATSAPP_PHONE_NUMBER_ID) === String(settings.wabaId)),
        sync: sync,
        savedIdAsPhoneNode: savedAsPhone,
        debugWabaIds: debugWabas,
        wabaScan: wabaScan,
        meAssets: meAssets,
        campanhaCorretorTemplate: tplRow,
        templatesListOk: tplListed.ok,
        templatesListError: tplListed.error || '',
        approvedTemplateNames: (tplListed.templates || []).map(function(t) {
          return t.name + ' (' + t.language + ') bodyVars=' + t.bodyVariableCount;
        }).slice(0, 15),
      });
    } catch (err) {
      console.error('brokerCampaignWhatsAppDiag:', err);
      return res.status(500).json({ error: err.message });
    }
  });

exports.brokerCampaignPreview = functions
  .runWith({ secrets: ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'] })
  .https.onRequest(async (req, res) => {
    allowCors(res);
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
    if (!(await verifyAdminAuth(req)).ok) return res.status(403).json({ error: 'Acesso negado' });
    try {
      var fp = req.query.featuredPropertyId;
      var previewOpts = {};
      if (fp !== undefined) previewOpts.featuredPropertyId = fp;
      const preview = await getBrokerCampaignPreview(admin.firestore(), previewOpts);
      return res.json(preview);
    } catch (err) {
      console.error('brokerCampaignPreview:', err);
      return res.status(500).json({ error: err.message });
    }
  });

exports.brokerCampaignTemplates = functions
  .runWith({ secrets: ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'] })
  .https.onRequest(async (req, res) => {
    allowCors(res);
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
    if (!(await verifyAdminAuth(req)).ok) return res.status(403).json({ error: 'Acesso negado' });
    try {
      const listed = await listApprovedMessageTemplates();
      return res.json(listed);
    } catch (err) {
      console.error('brokerCampaignTemplates:', err);
      return res.status(500).json({ error: err.message });
    }
  });

exports.brokerCampaignRunStatus = functions.https.onRequest(async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
  if (!(await verifyAdminAuth(req)).ok) return res.status(403).json({ error: 'Acesso negado' });
  try {
    const runId = String((req.query && req.query.runId) || '').trim();
    if (!runId) return res.status(400).json({ error: 'runId obrigatório' });
    const snap = await admin.firestore().collection('broker_campaign_logs').doc(runId).get();
    if (!snap.exists) return res.status(404).json({ error: 'Disparo não encontrado' });
    const data = snap.data() || {};
    return res.json({
      ok: true,
      runId: runId,
      status: data.status || 'unknown',
      sent: data.sent || 0,
      errors: data.errors || 0,
      skipped: data.skipped || 0,
      totalTargets: data.totalTargets || 0,
      eligible: data.eligible,
      issues: data.issues || [],
      startedAt: data.startedAt,
      finishedAt: data.finishedAt,
      error: data.error || null,
    });
  } catch (err) {
    console.error('brokerCampaignRunStatus:', err);
    return res.status(500).json({ error: err.message });
  }
});

exports.brokerCampaignSendNow = functions
  .runWith({
    secrets: ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'],
    timeoutSeconds: 540,
    memory: '512MB',
  })
  .https.onRequest(async (req, res) => {
    allowCors(res);
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
    try {
      const body = req.body || {};
      if (!(await verifyAdminAuth(req)).ok) {
        return res.status(403).json({ error: 'Acesso negado. Faça login no painel admin.' });
      }
      const brokerId = String(body.brokerId || '').trim();
      const internalPayload = {
        type: body.type || 'manual',
        force: true,
        brokerId: brokerId,
        phone: body.phone || '',
        resumeRunId: body.resumeRunId ? String(body.resumeRunId).trim() : '',
      };

      const result = await sendWeeklyBrokerCampaignInternal(internalPayload);
      return res.json(result);
    } catch (err) {
      console.error('brokerCampaignSendNow:', err);
      return res.status(500).json({ error: err.message });
    }
  });

/** Reprocessa chatbot_leads e marca os que são corretores (corrige detecção antiga). */
exports.brokerSyncLeads = functions.https.onRequest(async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    const body = req.body || {};
    if (!(await verifyAdminAuth(req)).ok) return res.status(403).json({ error: 'Acesso negado' });
    const db = admin.firestore();
    const brokerIndex = await buildBrokerPhoneIndex(db);
    const snap = await db.collection('chatbot_leads').get();
    var updated = 0;
    var alreadyOk = 0;
    var samples = [];
    var batch = db.batch();
    var ops = 0;
    var i;
    for (i = 0; i < snap.docs.length; i++) {
      var doc = snap.docs[i];
      var data = doc.data() || {};
      var phone = normalizeWhatsAppPhone(data.phone || doc.id) || doc.id;
      var broker = lookupBrokerInIndex(brokerIndex, phone);
      if (!broker) continue;
      if (data.isBroker && data.followUpExcluded) { alreadyOk += 1; continue; }
      batch.set(doc.ref, {
        isBroker: true,
        brokerId: broker.id,
        brokerName: broker.name || '',
        contactType: 'corretor',
        categoria: 'corretor',
        followUpExcluded: true,
        followUpExcludeReason: 'corretor_cadastrado',
        followUpPaused: true,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      ops += 1;
      updated += 1;
      if (samples.length < 20) samples.push({ phone: phone, name: broker.name || '' });
      if (ops >= 400) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();
    return res.json({
      ok: true,
      totalLeads: snap.size,
      brokersMarcados: updated,
      jaEstavamOk: alreadyOk,
      exemplos: samples,
    });
  } catch (err) {
    console.error('brokerSyncLeads:', err);
    return res.status(500).json({ error: err.message });
  }
});

/** Métricas simples da campanha de corretores (resposta e visitas). */
exports.brokerCampaignMetrics = functions.https.onRequest(async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
  try {
    const body = req.method === 'POST' ? (req.body || {}) : (req.query || {});
    if (!(await verifyAdminAuth(req)).ok) return res.status(403).json({ error: 'Acesso negado' });
    const db = admin.firestore();

    // Início da última campanha (segunda 08:00 BRT = 11:00 UTC).
    var now = new Date();
    var since = new Date(now.getTime());
    var dow = since.getUTCDay();
    var diff = (dow + 6) % 7; // dias desde segunda
    since.setUTCDate(since.getUTCDate() - diff);
    since.setUTCHours(11, 0, 0, 0);
    if (since.getTime() > now.getTime()) since.setUTCDate(since.getUTCDate() - 7);
    var sinceIso = since.toISOString();

    const brokerIndex = await buildBrokerPhoneIndex(db);
    var brokersAtivos = 0;
    const brokerSnap = await db.collection('brokers').get();
    brokerSnap.forEach(function(d) {
      var data = d.data() || {};
      if (!brokerAuth.brokerIsActive(data)) return;
      if (brokerPhoneMatchKeys(data.phone).length) brokersAtivos += 1;
    });

    const leadSnap = await db.collection('chatbot_leads').get();
    var corretoresResponderam = 0;
    var visitasAgendadas = 0;
    var biaSlips = 0;
    var respostasDetalhe = [];
    leadSnap.forEach(function(doc) {
      var data = doc.data() || {};
      var phone = normalizeWhatsAppPhone(data.phone || doc.id) || doc.id;
      var broker = lookupBrokerInIndex(brokerIndex, phone);
      if (data.biaSlip) biaSlips += 1;
      if (!broker) return;
      var lastUser = data.lastUserMessageAt || '';
      if (lastUser && lastUser >= sinceIso) {
        corretoresResponderam += 1;
        if (respostasDetalhe.length < 30) {
          respostasDetalhe.push({ phone: phone, name: broker.name || data.name || '', at: lastUser });
        }
      }
      var motivo = String(data.encaminhadoMotivo || data.notes || '').toLowerCase();
      var temVisita = (data.scheduledVisit && data.scheduledVisit.date) || motivo.indexOf('visita') >= 0;
      if (temVisita) visitasAgendadas += 1;
    });

    var taxaResposta = brokersAtivos > 0
      ? Math.round((corretoresResponderam / brokersAtivos) * 1000) / 10
      : 0;

    return res.json({
      ok: true,
      desde: sinceIso,
      brokersAtivos: brokersAtivos,
      corretoresResponderam: corretoresResponderam,
      taxaRespostaPct: taxaResposta,
      visitasAgendadasCorretores: visitasAgendadas,
      biaSlips: biaSlips,
      respostas: respostasDetalhe,
    });
  } catch (err) {
    console.error('brokerCampaignMetrics:', err);
    return res.status(500).json({ error: err.message });
  }
});

/** Painel de aprendizado da Bia: lições automáticas, orientações do atendente e regras do gestor. */
exports.biaLearning = functions.https.onRequest(async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    const body = req.body || {};
    if (!(await verifyAdminAuth(req)).ok) return res.status(403).json({ error: 'Acesso negado' });
    const db = admin.firestore();
    const autoRef = db.collection('bia_training').doc('auto');
    const globalRef = db.collection('bia_training').doc('global');
    const action = String(body.action || 'list').trim();

    if (action === 'list') {
      const autoSnap = await autoRef.get();
      const globalSnap = await globalRef.get();
      const autoData = autoSnap.exists ? (autoSnap.data() || {}) : {};
      const globalData = globalSnap.exists ? (globalSnap.data() || {}) : {};
      return res.json({
        ok: true,
        lessons: autoData.lessons || [],
        manual: autoData.manual || [],
        snippets: (globalData.snippets || []).slice(-25).reverse(),
      });
    }

    if (action === 'addGuideline') {
      const text = String(body.text || '').trim();
      if (text.length < 3) return res.status(400).json({ error: 'Texto muito curto' });
      const snap = await autoRef.get();
      const data = snap.exists ? (snap.data() || {}) : {};
      let manual = Array.isArray(data.manual) ? data.manual.slice() : [];
      manual.push({ text: text.substring(0, 400), by: String(body.adminEmail || 'admin'), at: new Date().toISOString() });
      if (manual.length > 40) manual = manual.slice(-40);
      await autoRef.set({ manual: manual, updatedAt: new Date().toISOString() }, { merge: true });
      return res.json({ ok: true, manual: manual });
    }

    if (action === 'deleteGuideline') {
      const at = String(body.at || '');
      const snap = await autoRef.get();
      const data = snap.exists ? (snap.data() || {}) : {};
      let manual = Array.isArray(data.manual) ? data.manual.slice() : [];
      manual = manual.filter(function(m) { return (typeof m === 'string' ? m : m.at) !== at; });
      await autoRef.set({ manual: manual, updatedAt: new Date().toISOString() }, { merge: true });
      return res.json({ ok: true, manual: manual });
    }

    if (action === 'deleteLesson') {
      const key = String(body.key || '');
      const snap = await autoRef.get();
      const data = snap.exists ? (snap.data() || {}) : {};
      let lessons = Array.isArray(data.lessons) ? data.lessons.slice() : [];
      lessons = lessons.filter(function(l) { return l.key !== key; });
      await autoRef.set({ lessons: lessons, updatedAt: new Date().toISOString() }, { merge: true });
      return res.json({ ok: true, lessons: lessons });
    }

    if (action === 'clearLessons') {
      await autoRef.set({ lessons: [], updatedAt: new Date().toISOString() }, { merge: true });
      return res.json({ ok: true, lessons: [] });
    }

    if (action === 'deleteSnippet') {
      const at = String(body.at || '');
      const snap = await globalRef.get();
      const data = snap.exists ? (snap.data() || {}) : {};
      let snippets = Array.isArray(data.snippets) ? data.snippets.slice() : [];
      snippets = snippets.filter(function(s) { return s.at !== at; });
      await globalRef.set({ snippets: snippets, updatedAt: new Date().toISOString() }, { merge: true });
      return res.json({ ok: true });
    }

    if (action === 'clearSnippets') {
      await globalRef.set({ snippets: [], updatedAt: new Date().toISOString() }, { merge: true });
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: 'Ação inválida' });
  } catch (err) {
    console.error('biaLearning:', err);
    return res.status(500).json({ error: err.message });
  }
});

/** Prepara base (limpa duplicatas/arquivados) e devolve preview pronto para disparo */
exports.brokerCampaignPrepare = functions.https.onRequest(async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    const body = req.body || {};
    if (!(await verifyAdminAuth(req)).ok) return res.status(403).json({ error: 'Acesso negado' });
    const db = admin.firestore();
    const result = await prepareBrokersCampaignBase(db, {
      forceCleanup: !!body.forceCleanup,
      purgeArchived: body.purgeArchived !== false,
      runCleanup: true,
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('brokerCampaignPrepare:', err);
    return res.status(500).json({ error: err.message });
  }
});

exports.adminCleanupBrokerDuplicates = functions.https.onRequest(async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    const body = req.body || {};
    if (!(await verifyAdminAuth(req)).ok) return res.status(403).json({ error: 'Acesso negado' });
    const purgeArchived = !!(body.purgeArchived);
    const result = await cleanupBrokerDuplicatesInternal(admin.firestore(), { purgeArchived: purgeArchived });
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('adminCleanupBrokerDuplicates:', err);
    return res.status(500).json({ error: err.message });
  }
});

/** Atualiza reparo (comentários, responsável, custos, status) */
exports.patchRepair = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    var body = req.body || {};
    var isAdmin = (await verifyAdminAuth(req)).ok;
    var clientEmail = '';
    if (!isAdmin) {
      var patchToken = extractIdToken(req);
      if (!patchToken) return res.status(401).json({ error: 'Autenticação necessária' });
      try {
        var patchDecoded = await admin.auth().verifyIdToken(patchToken);
        clientEmail = String(patchDecoded.email || '').trim().toLowerCase();
      } catch (ePatchTok) {
        return res.status(403).json({ error: 'Token inválido ou expirado' });
      }
    }
    var repairId = body.id != null ? Number(body.id) : null;
    var firestoreId = String(body.firestoreId || '').trim();
    if (!repairId && !firestoreId) return res.status(400).json({ error: 'id ou firestoreId obrigatório' });
    var db = admin.firestore();
    var ref = null;
    if (firestoreId) {
      ref = db.collection('repairRequests').doc(firestoreId);
        } else {
      var snap = await db.collection('repairRequests').where('id', '==', repairId).limit(1).get();
      if (snap.empty) return res.status(404).json({ error: 'Reparo não encontrado' });
      ref = snap.docs[0].ref;
    }
    var existing = (await ref.get()).data() || {};
    if (!isAdmin) {
      var ownerEmail = String(existing.clientEmail || '').trim().toLowerCase();
      if (!ownerEmail || ownerEmail !== clientEmail) {
        return res.status(403).json({ error: 'Acesso negado a este reparo' });
      }
    }
    var patch = { updatedAt: new Date().toISOString() };
    if (isAdmin && body.status) patch.status = body.status;
    if (isAdmin && body.tipo) patch.tipo = body.tipo;
    if (isAdmin && body.responsavelId != null) patch.responsavelId = body.responsavelId;
    if (isAdmin && body.responsavelNome != null) patch.responsavelNome = body.responsavelNome;
    if (isAdmin && body.custoEstimado != null) patch.custoEstimado = Number(body.custoEstimado);
    if (isAdmin && body.custoTotal != null) patch.custoTotal = Number(body.custoTotal);
    if (isAdmin && body.slaDueAt != null) patch.slaDueAt = body.slaDueAt;
    if (isAdmin && body.visitDate != null) patch.visitDate = body.visitDate;
    if (Array.isArray(body.responses)) patch.responses = body.responses;
    if (Array.isArray(body.attachments)) patch.attachments = body.attachments;
    if (body.comentario && body.comentario.texto) {
      var doc = await ref.get();
      var data = doc.data() || {};
      var list = Array.isArray(data.comentarios) ? data.comentarios.slice() : [];
      list.push({
        id: 'c_' + Date.now(),
        texto: String(body.comentario.texto),
        autorId: body.comentario.autorId || '',
        autorNome: body.comentario.autorNome || 'Equipe',
        dataCriacao: new Date().toISOString(),
      });
      patch.comentarios = list;
    }
    await ref.set(patch, { merge: true });
    if (isAdmin && body.status && existing.clientEmail) {
      var stLabel = String(body.status);
      fcmPush.notifyUserEmail(
        db,
        existing.clientEmail,
        'Atualização do seu reparo',
        'Status: ' + stLabel + (existing.propertyTitle ? ' — ' + existing.propertyTitle : ''),
        { type: 'repair_status', firestoreId: firestoreId || ref.id, status: stLabel },
        'https://bfmarquesempreendimentos.github.io/bfm/client-area.html'
      ).catch(function() {});
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('patchRepair:', err);
    return res.status(500).json({ error: err.message });
  }
});

/** Calcula status efetivo do boleto (vencido se passou do vencimento). */
function effectiveBoletoStatus(data) {
  var d = data || {};
  if (String(d.status || '').toLowerCase() === 'pago') return 'pago';
  var venc = d.vencimento ? new Date(d.vencimento) : null;
  if (venc && !isNaN(venc.getTime()) && venc.getTime() < Date.now()) return 'vencido';
  return String(d.status || 'pendente').toLowerCase();
}

/** Admin: CRUD de boletos de clientes. */
exports.adminBoletosMutate = functions.https.onRequest(async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  if (!(await verifyAdminAuth(req)).ok) return res.status(403).json({ error: 'Acesso negado' });
  try {
    var body = req.body || {};
    var action = String(body.action || 'list').trim().toLowerCase();
    var db = admin.firestore();
    var col = db.collection('boletos');

    if (action === 'list') {
      var filterEmail = String(body.clientEmail || '').trim().toLowerCase();
      var snap;
      if (filterEmail) {
        snap = await col.where('clientEmail', '==', filterEmail).get();
      } else {
        snap = await col.limit(500).get();
      }
      var rows = [];
      snap.forEach(function(doc) {
        var d = doc.data() || {};
        rows.push({
          id: doc.id,
          clientEmail: d.clientEmail || '',
          clientUid: d.clientUid || '',
          valor: d.valor != null ? Number(d.valor) : 0,
          vencimento: d.vencimento || '',
          parcela: d.parcela || '',
          propertyTitle: d.propertyTitle || '',
          status: effectiveBoletoStatus(d),
          statusRaw: d.status || 'pendente',
          comprovanteUrl: d.comprovanteUrl || '',
          pagamentoEm: d.pagamentoEm || '',
          createdAt: d.createdAt || '',
        });
      });
      rows.sort(function(a, b) {
        return new Date(a.vencimento || 0) - new Date(b.vencimento || 0);
      });
      return res.json({ ok: true, boletos: rows });
    }

    if (action === 'delete') {
      var delId = String(body.boletoId || body.id || '').trim();
      if (!delId) return res.status(400).json({ error: 'boletoId obrigatório' });
      await col.doc(delId).delete();
      return res.json({ ok: true, deleted: delId });
    }

    if (action === 'markPaid') {
      var paidId = String(body.boletoId || body.id || '').trim();
      if (!paidId) return res.status(400).json({ error: 'boletoId obrigatório' });
      var paidRef = col.doc(paidId);
      var paidSnap = await paidRef.get();
      if (!paidSnap.exists) return res.status(404).json({ error: 'Boleto não encontrado' });
      var paidData = paidSnap.data() || {};
      var paidAt = body.pagamentoEm || new Date().toISOString();
      await paidRef.set({
        status: 'pago',
        pagamentoEm: paidAt,
        comprovanteUrl: body.comprovanteUrl != null ? String(body.comprovanteUrl) : (paidData.comprovanteUrl || ''),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      if (paidData.clientEmail) {
        await db.collection('client_timeline').add({
          clientEmail: String(paidData.clientEmail).trim().toLowerCase(),
          type: 'payment',
          title: 'Parcela paga',
          description: (paidData.parcela ? 'Parcela ' + paidData.parcela + ' — ' : '') +
            (paidData.propertyTitle || 'Financiamento'),
          date: paidAt,
          createdAt: new Date().toISOString(),
        });
      }
      return res.json({ ok: true, id: paidId, status: 'pago' });
    }

    if (action === 'create') {
      var emailC = String(body.clientEmail || '').trim().toLowerCase();
      if (!emailC) return res.status(400).json({ error: 'clientEmail obrigatório' });
      var valorC = Number(body.valor);
      if (!valorC || isNaN(valorC) || valorC <= 0) return res.status(400).json({ error: 'valor inválido' });
      if (!body.vencimento) return res.status(400).json({ error: 'vencimento obrigatório' });
      var createRef = await col.add({
        clientEmail: emailC,
        clientUid: String(body.clientUid || '').trim(),
        valor: valorC,
        vencimento: String(body.vencimento),
        parcela: String(body.parcela || '').trim(),
        propertyTitle: String(body.propertyTitle || '').trim(),
        saleId: String(body.saleId || '').trim(),
        status: String(body.status || 'pendente').toLowerCase(),
        comprovanteUrl: String(body.comprovanteUrl || '').trim(),
        pagamentoEm: body.pagamentoEm || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return res.json({ ok: true, id: createRef.id });
    }

    if (action === 'update') {
      var updId = String(body.boletoId || body.id || '').trim();
      if (!updId) return res.status(400).json({ error: 'boletoId obrigatório' });
      var upd = { updatedAt: new Date().toISOString() };
      if (body.valor != null) upd.valor = Number(body.valor);
      if (body.vencimento != null) upd.vencimento = String(body.vencimento);
      if (body.parcela != null) upd.parcela = String(body.parcela || '');
      if (body.propertyTitle != null) upd.propertyTitle = String(body.propertyTitle || '');
      if (body.status != null) upd.status = String(body.status).toLowerCase();
      if (body.comprovanteUrl != null) upd.comprovanteUrl = String(body.comprovanteUrl || '');
      if (body.clientEmail != null) upd.clientEmail = String(body.clientEmail).trim().toLowerCase();
      await col.doc(updId).set(upd, { merge: true });
      return res.json({ ok: true, id: updId });
    }

    return res.status(400).json({ error: 'Ação inválida' });
  } catch (err) {
    console.error('adminBoletosMutate:', err);
    return res.status(500).json({ error: err.message });
  }
});

/** Admin: adiciona evento manual na timeline do cliente. */
exports.adminTimelineEvent = functions.https.onRequest(async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  if (!(await verifyAdminAuth(req)).ok) return res.status(403).json({ error: 'Acesso negado' });
  try {
    var body = req.body || {};
    var email = String(body.clientEmail || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'clientEmail obrigatório' });
    var docRef = await admin.firestore().collection('client_timeline').add({
      clientEmail: email,
      type: String(body.type || 'evento').trim(),
      title: String(body.title || 'Atualização').trim(),
      description: String(body.description || '').trim(),
      date: body.date || new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    return res.json({ ok: true, id: docRef.id });
  } catch (err) {
    console.error('adminTimelineEvent:', err);
    return res.status(500).json({ error: err.message });
  }
});

/** Boletos do cliente (email ou uid) */
exports.clientBoletosMe = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
  try {
    var email = '';
    var uid = '';
    var tokenB = null;
    var authHeaderB = req.headers.authorization;
    if (authHeaderB && authHeaderB.indexOf('Bearer ') === 0) tokenB = authHeaderB.split('Bearer ')[1];
    if (!tokenB && req.query.idToken) tokenB = String(req.query.idToken);
    if (!tokenB) return res.status(401).json({ error: 'Token necessário' });
    try {
      var decodedB = await admin.auth().verifyIdToken(tokenB);
      email = String(decodedB.email || '').trim().toLowerCase();
      uid = String(decodedB.uid || '').trim();
    } catch (eTok) {
      return res.status(403).json({ error: 'Token inválido ou expirado' });
    }
    if (!email && !uid) return res.status(400).json({ error: 'email ou uid obrigatório' });
    var db = admin.firestore();
    var q = db.collection('boletos');
    var snap;
    if (uid) {
      snap = await q.where('clientUid', '==', uid).get();
    } else {
      snap = await q.where('clientEmail', '==', email).get();
    }
    var list = [];
    snap.forEach(function(doc) {
      var d = doc.data() || {};
      list.push({
        id: doc.id,
        clientEmail: d.clientEmail || '',
        valor: d.valor != null ? Number(d.valor) : 0,
        vencimento: d.vencimento || '',
        parcela: d.parcela || '',
        propertyTitle: d.propertyTitle || '',
        status: effectiveBoletoStatus(d),
        comprovanteUrl: d.comprovanteUrl || '',
        pagamentoEm: d.pagamentoEm || '',
      });
    });
    list.sort(function(a, b) {
      return new Date(a.vencimento || 0) - new Date(b.vencimento || 0);
    });
    return res.json(list);
  } catch (err) {
    console.error('clientBoletosMe:', err);
    return res.status(500).json({ error: err.message });
  }
});

/** Timeline do imóvel (venda + reparos + eventos manuais) */
exports.clientTimelineMe = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
  try {
    var email = '';
    var tokenT = null;
    var authHeaderT = req.headers.authorization;
    if (authHeaderT && authHeaderT.indexOf('Bearer ') === 0) tokenT = authHeaderT.split('Bearer ')[1];
    if (!tokenT && req.query.idToken) tokenT = String(req.query.idToken);
    if (!tokenT) return res.status(401).json({ error: 'Token necessário' });
    try {
      var decodedT = await admin.auth().verifyIdToken(tokenT);
      email = String(decodedT.email || '').trim().toLowerCase();
    } catch (eTokT) {
      return res.status(403).json({ error: 'Token inválido ou expirado' });
    }
    if (!email) return res.status(400).json({ error: 'email obrigatório' });
    var db = admin.firestore();
    var events = [];
    var sales = await db.collection('propertySales').where('clientEmail', '==', email).get();
    sales.forEach(function(doc) {
      var d = doc.data() || {};
      events.push({
        type: 'venda',
        title: 'Compra registrada',
        description: (d.propertyTitle || 'Imóvel') + (d.unitCode ? ' — ' + d.unitCode : ''),
        date: d.saleDate || d.createdAt || '',
      });
      if (d.reservationAt) {
        events.push({
          type: 'reserva',
          title: 'Reserva',
          description: d.propertyTitle || '',
          date: d.reservationAt,
        });
      }
    });
    var repairs = await db.collection('repairRequests').where('clientEmail', '==', email).get();
    repairs.forEach(function(doc) {
      var r = doc.data() || {};
      events.push({
        type: 'reparo',
        title: 'Reparo: ' + (r.status || 'aberto'),
        description: (r.description || '').slice(0, 120),
        date: r.createdAt || '',
      });
      if (r.status === 'concluido' && r.updatedAt) {
        events.push({
          type: 'reparo_concluido',
          title: 'Reparo concluído',
          description: r.propertyTitle || '',
          date: r.updatedAt,
        });
      }
    });
    var manual = await db.collection('client_timeline').where('clientEmail', '==', email).get();
    manual.forEach(function(doc) {
      var m = doc.data() || {};
      events.push({
        type: m.type || 'evento',
        title: m.title || 'Atualização',
        description: m.description || '',
        date: m.date || m.createdAt || '',
      });
    });
    events.sort(function(a, b) {
      return new Date(b.date || 0) - new Date(a.date || 0);
    });
    return res.json(events);
      } catch (err) {
    console.error('clientTimelineMe:', err);
    return res.status(500).json({ error: err.message });
  }
});

/** Reparos do cliente autenticado — escopo seguro pelo token Firebase (sem expor reparos de outros). */
exports.clientRepairsMe = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
  try {
    var token = null;
    var authHeader = req.headers.authorization;
    if (authHeader && authHeader.indexOf('Bearer ') === 0) token = authHeader.split('Bearer ')[1];
    if (!token && req.query.idToken) token = String(req.query.idToken);
    if (!token) return res.status(401).json({ error: 'Token necessário' });
    var decoded;
    try {
      decoded = await admin.auth().verifyIdToken(token);
    } catch (eTok) {
      return res.status(403).json({ error: 'Token inválido ou expirado' });
    }
    var email = String(decoded.email || '').trim().toLowerCase();
    var uid = String(decoded.uid || '').trim();
    var db = admin.firestore();
    var byId = {};
    if (email) {
      var snapE = await db.collection('repairRequests').where('clientEmail', '==', email).get();
      snapE.forEach(function(doc) { byId[doc.id] = Object.assign({ firestoreId: doc.id }, doc.data()); });
    }
    if (uid) {
      var snapU = await db.collection('repairRequests').where('clientUid', '==', uid).get();
      snapU.forEach(function(doc) { byId[doc.id] = Object.assign({ firestoreId: doc.id }, doc.data()); });
    }
    var repairs = Object.keys(byId).map(function(k) { return byId[k]; });
    repairs.sort(function(a, b) { return new Date(b.createdAt || 0) - new Date(a.createdAt || 0); });
    return res.json(repairs);
  } catch (err) {
    console.error('clientRepairsMe:', err);
    return res.status(500).json({ error: err.message });
  }
});

/** Salva token de redefinição de senha (corretor/cliente) — só servidor grava no Firestore. */
exports.savePasswordResetToken = functions.https.onRequest(async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    var body = req.body || {};
    var email = String(body.email || '').trim().toLowerCase();
    var token = String(body.token || '').trim();
    var entityId = String(body.brokerId || body.clientId || '').trim();
    var type = String(body.type || 'broker').trim();
    if (!email || !token) return res.status(400).json({ error: 'email e token obrigatórios' });
    var db = admin.firestore();
    var expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    var record = {
      type: type,
      email: email,
      token: token,
      expiresAt: expiresAt,
      used: false,
      createdAt: new Date().toISOString(),
    };
    if (type === 'client') record.clientId = entityId;
    else record.brokerId = entityId;
    var docRef = await db.collection('passwordResetTokens').add(record);
    return res.json({ ok: true, id: docRef.id });
  } catch (err) {
    console.error('savePasswordResetToken:', err);
    return res.status(500).json({ error: err.message });
  }
});

/** Valida token de redefinição de senha (sem expor o token no Firestore client). */
exports.verifyPasswordResetToken = functions.https.onRequest(async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    var token = String((req.query && req.query.token) || (req.body && req.body.token) || '').trim();
    if (!token) return res.status(400).json({ error: 'token obrigatório' });
    var db = admin.firestore();
    var snap = await db.collection('passwordResetTokens').where('token', '==', token).where('used', '==', false).limit(1).get();
    if (snap.empty) return res.status(404).json({ error: 'Token inválido ou expirado' });
    var doc = snap.docs[0];
    var data = doc.data() || {};
    if (new Date(data.expiresAt) < new Date()) return res.status(410).json({ error: 'Token expirado' });
    return res.json({
      ok: true,
      id: doc.id,
      type: data.type || 'broker',
      email: data.email || '',
      brokerId: data.brokerId || '',
      clientId: data.clientId || '',
    });
  } catch (err) {
    console.error('verifyPasswordResetToken:', err);
    return res.status(500).json({ error: err.message });
  }
});

/** Conclui redefinição de senha (corretor: hash + Firebase Auth; cliente: Firebase Auth). */
exports.completePasswordReset = functions.https.onRequest(async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    var body = req.body || {};
    var token = String(body.token || '').trim();
    var newPassword = String(body.newPassword || '');
    if (!token || !newPassword) return res.status(400).json({ error: 'token e newPassword obrigatórios' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
    var db = admin.firestore();
    var snap = await db.collection('passwordResetTokens').where('token', '==', token).where('used', '==', false).limit(1).get();
    if (snap.empty) return res.status(404).json({ error: 'Token inválido ou já utilizado' });
    var doc = snap.docs[0];
    var data = doc.data() || {};
    if (new Date(data.expiresAt) < new Date()) return res.status(410).json({ error: 'Token expirado' });
    var email = String(data.email || '').trim().toLowerCase();
    var type = data.type || 'broker';

    if (type === 'broker') {
      var brokerId = String(data.brokerId || '').trim();
      if (!brokerId) return res.status(400).json({ error: 'Corretor inválido' });
      var pwdFields = passwordFieldsForStorage(newPassword);
      await db.collection('brokers').doc(brokerId).set({
        passwordHash: pwdFields.passwordHash,
        password: '',
        passwordResetAt: new Date().toISOString(),
      }, { merge: true });
      if (email) {
        try {
          var fbUser = await admin.auth().getUserByEmail(email);
          await admin.auth().updateUser(fbUser.uid, { password: newPassword });
        } catch (fbErr) {
          if (fbErr.code === 'auth/user-not-found') {
            await brokerAuth.ensureBrokerFirebaseUser(email, newPassword);
          } else {
            throw fbErr;
          }
        }
      }
    } else if (email) {
      try {
        var clientUser = await admin.auth().getUserByEmail(email);
        await admin.auth().updateUser(clientUser.uid, { password: newPassword });
      } catch (clientErr) {
        if (clientErr.code !== 'auth/user-not-found') throw clientErr;
      }
    }

    await doc.ref.update({ used: true, usedAt: new Date().toISOString() });
    return res.json({ ok: true, type: type });
  } catch (err) {
    console.error('completePasswordReset:', err);
    return res.status(500).json({ error: err.message });
  }
});

/** Lead do simulador do site (vínculo empreendimento + renda + telefone) */
exports.saveSimulatorLead = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    var body = req.body || {};
    var phone = normalizePhoneForWhatsApp(body.phone || body.telefone || '');
    var record = {
      name: String(body.name || body.nome || '').trim(),
      phone: phone || String(body.phone || '').trim(),
      email: String(body.email || '').trim().toLowerCase(),
      income: body.renda != null ? Number(body.renda) : (body.income != null ? Number(body.income) : null),
      propertyId: body.propertyId != null ? Number(body.propertyId) : null,
      propertyTitle: String(body.propertyTitle || '').trim(),
      valorImovel: body.valorImovel != null ? Number(body.valorImovel) : null,
      source: 'simulador_site',
      createdAt: new Date().toISOString(),
    };
    var db = admin.firestore();
    await db.collection('simulator_leads').add(record);
    if (phone) {
      var { getOrCreateLead, qualifyLead, addInterestedProperty } = require('./chatbot/lead-manager');
      await getOrCreateLead(phone, record.name);
      await qualifyLead(phone, { name: record.name, income: record.income, email: record.email });
      if (record.propertyId) await addInterestedProperty(phone, record.propertyId);
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('saveSimulatorLead:', err);
    return res.status(500).json({ error: err.message });
  }
});

exports.brokerCampaignOptOut = functions.https.onRequest(async (req, res) => {
  allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    const body = req.body || {};
    const brokerId = String(body.brokerId || '').trim();
    if (!brokerId) return res.status(400).json({ error: 'brokerId obrigatório' });
    const optOut = !!body.optOut;
    await admin.firestore().collection('brokers').doc(brokerId).set({
      whatsappCampaignOptOut: optOut,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    return res.json({ success: true, brokerId: brokerId, whatsappCampaignOptOut: optOut });
  } catch (err) {
    console.error('brokerCampaignOptOut:', err);
    return res.status(500).json({ error: err.message });
  }
});

/** Admin: financeiro estilo Procfy — transações e conciliação (sem faturas). */
exports.adminFinanceMutate = functions.https.onRequest(async (req, res) => {
  financeHandlers.allowCors(res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  var auth = await verifyAdminAuth(req);
  if (!auth.ok) return res.status(403).json({ error: 'Acesso negado' });
  var action = String((req.body && req.body.action) || 'summary').toLowerCase();
  var writeActions = ['create', 'update', 'delete', 'reconcile', 'unreconcile', 'reconcile_batch'];
  if (writeActions.indexOf(action) >= 0 && !financeHandlers.canWriteFinance(auth.role)) {
    return res.status(403).json({ error: 'Sem permissão financeira de escrita' });
  }
  if (!financeHandlers.canReadFinance(auth.role)) {
    return res.status(403).json({ error: 'Sem permissão financeira' });
  }
  try {
    return await financeHandlers.handleFinanceMutate(req, res, auth);
  } catch (err) {
    console.error('adminFinanceMutate:', err);
    return res.status(500).json({ error: err.message });
  }
});
