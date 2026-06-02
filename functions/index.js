const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const { verifyWebhook, processWebhook } = require('./chatbot/webhook');
const { getAllLeads, getLeadStats, getLeadByPhone, getConversationHistory, saveMessage, deleteConversationMessage, setModoHumano, returnToBot, markAdminRead, getLastConversationMessage, normalizeWhatsAppPhone, recordInboundActivity, recordAdminBiaTraining } = require('./chatbot/lead-manager');
const { processAllFollowUps } = require('./chatbot/follow-up-engine');
const { setFollowUpExclusion: leadSetFollowUpExclusion } = require('./chatbot/lead-manager');
const { getPropertyById } = require('./chatbot/property-data');
const {
  sendTextMessage,
  sendTemplateMessage,
  extractMetaError,
  isTemplateNameOrLanguageError,
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
  uploadMediaBuffer,
  sendMediaById,
  getWhatsAppMediaBuffer,
} = require('./chatbot/whatsapp-api');
const propertySalesHandlers = require('./property-sales-handlers');
const { verifyAdminFromBody } = require('./admin-accounts');

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

function isBrokerActiveFlag(value) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'sim' || s === 'ativo';
  }
  return false;
}

function normalizeBrazilWhatsApp(phone) {
  let digits = normalizePhoneDigits(phone);
  if (!digits) return null;
  while (digits.charAt(0) === '0') digits = digits.substring(1);
  if (digits.indexOf('5555') === 0) digits = digits.substring(2);
  if (digits.length >= 12 && digits.indexOf('55') === 0) {
    if (digits.length === 12 || digits.length === 13) return digits;
    if (digits.length > 13) return digits.substring(0, 13);
  }
  if (digits.length === 11 || digits.length === 10) return '55' + digits;
  return null;
}

function pickBetterBrokerRow(a, b) {
  const activeA = isBrokerActiveFlag(a.isActive) ? 1 : 0;
  const activeB = isBrokerActiveFlag(b.isActive) ? 1 : 0;
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
  const active = brokers.filter(function(b) { return isBrokerActiveFlag(b.isActive); });
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
    return isBrokerActiveFlag(b.isActive) && !b.whatsappCampaignOptOut;
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
    if (!isBrokerActiveFlag(d.isActive)) return;
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
    const phone = normalizeWhatsAppPhone(data.phone) || normalizeBrazilWhatsApp(data.phone);
    if (!phone) return;
    const entry = { id: doc.id, name: data.name || '', isActive: isBrokerActiveFlag(data.isActive) };
    if (!index[phone] || entry.isActive) index[phone] = entry;
  });
  return index;
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
  const wabaId = String(options.wabaId || settings.wabaId || '').trim();
  const envPhoneId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const lastWebhookPhone = String(settings.lastWebhookPhoneNumberId || '').trim();
  const token = process.env.WHATSAPP_TOKEN;
  const hintDigits = normalizePhoneDigitsForMatch(
    options.supportPhone || settings.supportPhoneHint || '21995557010'
  );

  if (!token) {
    return { ok: false, error: 'WHATSAPP_TOKEN não configurado no Firebase.' };
  }
  if (!wabaId) {
    return { ok: false, error: 'Informe o ID da conta (WABA) no painel e clique Salvar WABA.' };
  }

  var phones = await listWabaPhoneNumbers(token, wabaId);
  var resolvedPhoneId = '';
  var syncSource = '';
  var envMisconfiguredAsWaba = envPhoneId && envPhoneId === wabaId;

  if (!phones.length && wabaId) {
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
      wabaId: wabaId,
      phoneNumberId: resolvedPhoneId,
      phoneDisplay: phoneDisplay,
      syncSource: syncSource,
      envPhoneNumberId: envPhoneId,
      envMisconfiguredAsWaba: envMisconfiguredAsWaba,
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
      : (sync.envMisconfiguredAsWaba
        ? 'Ajuste WHATSAPP_PHONE_NUMBER_ID no Firebase para o Phone number ID da Meta (API Setup).'
        : ''),
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
    if (wabaResolved.syncHint) hint += ' ' + wabaResolved.syncHint;
    if (wabaResolved.phoneDisplay) {
      hint += ' Número da Bia: ' + wabaResolved.phoneDisplay + ' (ID ' + wabaResolved.campaignPhoneNumberId + ').';
    }
    if (match.language && db) {
      await db.collection('broker_campaign').doc('config').set({
        templateLanguageResolved: match.language,
        templateBodyVariableCount: match.bodyVariableCount != null ? match.bodyVariableCount : undefined,
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

async function getBrokerCampaignPreview(db) {
  const config = await getBrokerCampaignConfig(db);
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
    if (b.whatsappCampaignOptOut && isBrokerActiveFlag(b.isActive)) optOutCount += 1;
  });
  const activeDuplicateRecords = countActiveBrokerDuplicates(allBrokers);
  const archivedInactiveRecords = allBrokers.filter(function(b) {
    return !isBrokerActiveFlag(b.isActive);
  }).length;
  const readyToSend = eligible;
  const hasTpl = !!(templateStatus.templateName);
  const isReady = readyToSend > 0 && activeDuplicateRecords === 0 &&
    (!hasTpl || templateStatus.templateValid);
  const waAccount = await getWhatsAppAccountInfo();
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

function getDefaultBrokerCampaignConfig() {
  return {
    enabled: true,
    siteUrl: 'https://bfmarquesempreendimentos.github.io/bfm/',
    whatsappContato: '(21) 99759-0814',
    templateName: 'campanha_corretor_msg',
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

async function getBrokerCampaignConfig(db) {
  const ref = db.collection('broker_campaign').doc('config');
  const snap = await ref.get();
  if (!snap.exists) {
    const defaults = getDefaultBrokerCampaignConfig();
    await ref.set(defaults, { merge: true });
    return defaults;
  }
  const current = snap.data() || {};
  return { ...getDefaultBrokerCampaignConfig(), ...current };
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
    config.whatsappContato || '(21) 99759-0814',
  ];
  return [{
    type: 'body',
    parameters: params.map(function(p) {
      return { type: 'text', text: String(p).substring(0, 900) };
    }),
  }];
}

/** Template campanha_corretor_msg na Meta: 1 variável {{1}} com o texto completo (ver TEMPLATE-CAMPANHA-CORRETORES-META.md). */
function buildCampanhaCorretorSingleVarBody(config, broker, now) {
  const week = getWeekOfYearNumber(now);
  const tips = Array.isArray(config.usefulTips) ? config.usefulTips : [];
  const tip = tips.length ? tips[(week - 1) % tips.length] : '';
  const firstName = String((broker && broker.name) || '').trim().split(' ')[0] || 'Corretor(a)';
  const text = (
    'Olá, ' + firstName + '! Boa semana de vendas.\n\n' +
    '📢 Site atualizado: ' + (config.siteUrl || 'https://bfmarquesempreendimentos.github.io/bfm/') + '\n' +
    '🔥 Ofertas e imóveis disponíveis já estão no ar.\n' +
    (tip ? ('💡 ' + tip + '\n') : '') +
    '✅ ' + (config.ctaText || 'Divulgue as ofertas da semana para seus leads.') + '\n\n' +
    'Suporte: ' + (config.whatsappContato || '(21) 99759-0814')
  );
  return [{
    type: 'body',
    parameters: [{ type: 'text', text: text.substring(0, 1024) }],
  }];
}

function buildBrokerCampaignTemplateComponentSets(config, broker, now, message) {
  var singleVar = buildCampanhaCorretorSingleVarBody(config, broker, now);
  var fiveVar = buildBrokerCampaignTemplateComponents(config, broker, now);
  var none = [];
  var tplName = normalizeTemplateName(config.templateName);
  var count = config.templateBodyVariableCount;
  if (count === 0) return [none, singleVar, fiveVar];
  if (count === 1) return [singleVar, fiveVar, none];
  if (count === 5) return [fiveVar, singleVar, none];
  if (tplName === 'atualizacao_semanal_corretor') return [fiveVar, singleVar, none];
  if (tplName === 'campanha_corretor_msg') return [singleVar, fiveVar, none];
  return [singleVar, fiveVar, none];
}

async function sendBrokerCampaignWhatsApp(config, broker, waPhone, now) {
  const message = buildBrokerCampaignMessage(config, broker, now);
  const templateName = normalizeTemplateName(config.templateName);
  const waSendOpts = config.campaignPhoneNumberId
    ? { phoneNumberId: config.campaignPhoneNumberId }
    : {};
  if (templateName && !config.campaignPhoneNumberId) {
    throw new Error('Número da Bia (phone_number_id) não configurado. Abra Corretores → Salvar WABA ou envie uma mensagem para a Bia e tente de novo.');
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
    var componentSets = buildBrokerCampaignTemplateComponentSets(config, broker, now, message);
    let lastErr = null;
    let li;
    let ci;
    for (li = 0; li < langCandidates.length; li++) {
      for (ci = 0; ci < componentSets.length; ci++) {
        try {
          const sendResp = await sendTemplateMessage(waPhone, templateName, langCandidates[li], componentSets[ci], waSendOpts);
          var variant = 'auto';
          if (componentSets[ci].length === 0) variant = 'none';
          else if (componentSets[ci][0].parameters && componentSets[ci][0].parameters.length === 1) variant = 'single';
          else if (componentSets[ci][0].parameters && componentSets[ci][0].parameters.length >= 5) variant = 'full';
          return {
            mode: 'template',
            templateName: templateName,
            language: langCandidates[li],
            componentsVariant: variant,
            waMessageId: sendResp && sendResp.messageId ? sendResp.messageId : '',
            sentTo: waPhone,
          };
        } catch (err) {
          lastErr = err;
          const errMsg = err.message || extractMetaError(err);
          if (!isTemplateNameOrLanguageError(errMsg) && ci === componentSets.length - 1) {
            throw new Error(errMsg);
          }
        }
      }
    }
    const detail = lastErr ? (lastErr.message || String(lastErr)) : 'erro desconhecido';
    throw new Error(
      'Template "' + templateName + '" não foi enviado pela Meta: ' + detail +
      ' Erro 132000 = quantidade de variáveis no painel diferente do template na Meta. ' +
      'Use campanha_corretor_msg com 1 variável {{1}} (corpo em TEMPLATE-CAMPANHA-CORRETORES-META.md) ou atualizacao_semanal_corretor com 5 variáveis.'
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
    'Suporte comercial: ' + (config.whatsappContato || '(21) 99759-0814')
  );
}

async function sendWeeklyBrokerCampaignInternal(payload) {
  const db = admin.firestore();
  const now = new Date();
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

  const targetList = await listBrokerCampaignTargets(db, payload);
  const runRef = payload.runId
    ? db.collection('broker_campaign_logs').doc(payload.runId)
    : db.collection('broker_campaign_logs').doc();

  await runRef.set({
    type: payload.type || 'weekly',
    forced: !!payload.force,
    startedAt: new Date().toISOString(),
    totalTargets: targetList.length,
    status: 'running',
  }, { merge: true });

  const results = [];
  const sendable = [];
  const sentPhones = {};
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
      results.push({
        brokerId: broker.id,
        name: broker.name || '',
        status: 'skipped',
        reason: 'Telefone duplicado no cadastro',
      });
      return;
    }
    sentPhones[waPhone] = true;
    sendable.push({ broker: broker, waPhone: waPhone });
  });

  for (let i = 0; i < sendable.length; i++) {
    const item = sendable[i];
    try {
      const sendMeta = await sendBrokerCampaignWhatsApp(config, item.broker, item.waPhone, now);
      if (sendMeta.mode === 'text' || sendMeta.templateFallback) {
        results.push({
          brokerId: item.broker.id,
          name: item.broker.name || '',
          status: 'error',
          phone: item.waPhone,
          error: 'Envio caiu em texto livre (não entrega fora da janela 24h). Erro template: ' +
            (sendMeta.templateError || 'configure WABA e campanha_corretor_msg'),
        });
      } else {
        results.push({
          brokerId: item.broker.id,
          name: item.broker.name || '',
          status: 'sent',
          phone: item.waPhone,
          mode: sendMeta.mode,
          templateName: sendMeta.templateName || '',
          waMessageId: sendMeta.waMessageId || '',
          componentsVariant: sendMeta.componentsVariant || '',
        });
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
    if (i < sendable.length - 1) {
      await new Promise(function(resolve) { setTimeout(resolve, 350); });
    }
  }

  const sent = results.filter(function(r) { return r.status === 'sent'; }).length;
  const errors = results.filter(function(r) { return r.status === 'error'; }).length;
  const skipped = results.filter(function(r) { return r.status === 'skipped'; }).length;
  const issues = results.filter(function(r) { return r.status !== 'sent'; }).slice(0, 80);
  const sentDetails = results.filter(function(r) { return r.status === 'sent'; }).slice(0, 5);
  const waAccount = await getWhatsAppAccountInfo();
  var deliveryWarning = '';
  if (waAccount.ok && waAccount.isLikelyTestAccount && sent > 0) {
    deliveryWarning =
      'A Meta aceitou o envio (API OK), mas esta é uma conta WhatsApp de TESTE ("' +
      (waAccount.wabaName || 'Test') +
      '"). Só entrega para números cadastrados em API Setup → números de teste. ' +
      'Por isso o painel Meta mostra 0 entregues e o corretor não recebe. ' +
      'Cadastre o celular do corretor lá ou migre para conta Business de produção.';
  }

  await runRef.set({
    finishedAt: new Date().toISOString(),
    status: 'done',
    sent: sent,
    errors: errors,
    skipped: skipped,
    eligible: sendable.length,
    issues: issues,
    issuesTruncated: results.length - sent > issues.length,
  }, { merge: true });

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
        password: d.password || '',
        isActive: d.isActive !== undefined ? d.isActive : false,
        whatsappCampaignOptOut: !!d.whatsappCampaignOptOut,
        isAdmin: d.isAdmin || false,
        createdAt: d.createdAt ? d.createdAt : new Date().toISOString()
      };
    });
    brokers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const deduped = dedupeBrokersByEmail(brokers);
    const activeOnly = req.query.activeOnly === '1' || req.query.activeOnly === 'true';
    if (activeOnly) {
      return res.json(deduped.filter(function(b) { return isBrokerActiveFlag(b.isActive); }));
    }
    return res.json(deduped);
  } catch (err) {
    console.error('Erro ao buscar corretores:', err);
    return res.status(500).json({ error: err.message });
  }
});

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
    const db = admin.firestore();
    const existing = await db.collection('brokers').where('email', '==', emailNorm).get();
    if (!existing.empty) {
      return res.status(409).json({ error: 'Email já cadastrado' });
    }
    const docRef = await db.collection('brokers').add({
      name: name || '',
      cpf: (cpf || '').replace(/\D/g, ''),
      email: emailNorm,
      phone: phone || '',
      creci: creci || '',
      password: password || '',
      isActive: false,
      whatsappCampaignOptOut: false,
      createdAt: new Date().toISOString()
    });
    return res.json({ success: true, id: docRef.id });
  } catch (err) {
    console.error('Erro ao cadastrar corretor:', err);
    return res.status(500).json({ error: err.message });
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

// ─── API de Reparos: CRIAR (garante sync Mac/Windows - não depende do Firestore client) ──
exports.createRepair = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    const body = req.body;
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Payload inválido' });
    const repair = {
      id: body.id || Date.now(),
      clientId: body.clientId || null,
      clientUid: body.clientUid || null,
      clientName: body.clientName || '',
      clientEmail: body.clientEmail || '',
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
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');

  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });

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
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });

  try {
    const wa = await getLeadStats();
    const db = admin.firestore();
    const [repSnap, salesSnap, brokerSnap] = await Promise.all([
      db.collection('repairRequests').get(),
      db.collection('propertySales').get(),
      db.collection('brokers').get(),
    ]);
    let repairsOpen = 0;
    repSnap.forEach((doc) => {
      const st = String(doc.data().status || '').toLowerCase();
      if (st !== 'concluido' && st !== 'cancelado') repairsOpen++;
    });
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
    salesSnap.forEach(function(doc) {
      var d = doc.data() || {};
      if (d.visitScheduled || d.status === 'visita') visitas++;
      if (d.status === 'reservado' || d.reservationAt) reservas++;
    });
    return res.json({
      wa: wa,
      repairsOpen: repairsOpen,
      salesCount: salesSnap.size,
      brokersActive: brokersActive,
      brokersTotal: brokerSnap.size,
      unitsDisponivel: unitsDisponivel,
      unitsReservado: unitsReservado,
      unitsAssinado: unitsAssinado,
      funnelVisitas: visitas,
      funnelReservas: reservas,
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
        if (brokerIndex[phone]) brokersInWa += 1;
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
      const brokerMatch = brokerIndexConvo[norm];
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
      const broker = brokerIndex[phone];
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
    timeoutSeconds: 300,
    memory: '512MB',
  })
  .pubsub.schedule('every monday 08:00')
  .timeZone('America/Sao_Paulo')
  .onRun(async () => {
    const result = await sendWeeklyBrokerCampaignInternal({ type: 'weekly', force: false });
    console.log('brokerWeeklyCampaign:', JSON.stringify(result));
    return null;
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

    const body = req.body || {};
    const allowed = {
      enabled: body.enabled === true || body.enabled === false ? body.enabled : undefined,
      siteUrl: body.siteUrl ? String(body.siteUrl).trim() : undefined,
      whatsappContato: body.whatsappContato ? String(body.whatsappContato).trim() : undefined,
      weeklyTitle: body.weeklyTitle ? String(body.weeklyTitle).trim() : undefined,
      templateName: body.templateName !== undefined ? String(body.templateName || '').trim() : undefined,
      templateLanguage: body.templateLanguage ? String(body.templateLanguage).trim() : undefined,
      ctaText: body.ctaText ? String(body.ctaText).trim() : undefined,
      usefulTips: Array.isArray(body.usefulTips) ? body.usefulTips.map(function(t) { return String(t || '').trim(); }).filter(Boolean) : undefined,
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
      if (!verifyAdminFromBody(body)) return res.status(403).json({ error: 'Acesso negado' });
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
    if (!verifyAdminFromBody(body)) return res.status(403).json({ error: 'Acesso negado' });
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
    try {
      const preview = await getBrokerCampaignPreview(admin.firestore());
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
    timeoutSeconds: 300,
    memory: '512MB',
  })
  .https.onRequest(async (req, res) => {
    allowCors(res);
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
    try {
      const body = req.body || {};
      if (!verifyAdminFromBody(body)) {
        return res.status(403).json({ error: 'Acesso negado. Faça login no painel admin.' });
      }
      const brokerId = String(body.brokerId || '').trim();
      const internalPayload = {
        type: body.type || 'manual',
        force: true,
        brokerId: brokerId,
        phone: body.phone || '',
      };

      const result = await sendWeeklyBrokerCampaignInternal(internalPayload);
      return res.json(result);
    } catch (err) {
      console.error('brokerCampaignSendNow:', err);
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
    if (!verifyAdminFromBody(body)) return res.status(403).json({ error: 'Acesso negado' });
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
    if (!verifyAdminFromBody(body)) return res.status(403).json({ error: 'Acesso negado' });
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
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    var body = req.body || {};
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
    var patch = { updatedAt: new Date().toISOString() };
    if (body.status) patch.status = body.status;
    if (body.tipo) patch.tipo = body.tipo;
    if (body.responsavelId != null) patch.responsavelId = body.responsavelId;
    if (body.responsavelNome != null) patch.responsavelNome = body.responsavelNome;
    if (body.custoEstimado != null) patch.custoEstimado = Number(body.custoEstimado);
    if (body.custoTotal != null) patch.custoTotal = Number(body.custoTotal);
    if (body.slaDueAt != null) patch.slaDueAt = body.slaDueAt;
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
    return res.json({ success: true });
  } catch (err) {
    console.error('patchRepair:', err);
    return res.status(500).json({ error: err.message });
  }
});

/** Boletos do cliente (email ou uid) */
exports.clientBoletosMe = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
  try {
    var email = String(req.query.email || '').trim().toLowerCase();
    var uid = String(req.query.uid || '').trim();
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
      list.push({ id: doc.id, ...doc.data() });
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
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
  try {
    var email = String(req.query.email || '').trim().toLowerCase();
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
