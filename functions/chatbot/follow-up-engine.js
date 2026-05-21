/**
 * Follow-up sequencial (opção B) para leads que iniciaram conversa e pararam de responder.
 * Não envia para: modo humano, exclusão manual, idade/financiamento bloqueado, visita agendada, etc.
 */
const { sendFollowUp } = require('./templates');
const { getLastConversationMessage } = require('./lead-manager');
const { getPropertyById } = require('./property-data');

const HOUR = 1000 * 60 * 60;

const STAGE_SEQUENCE = [
  { key: 'h2', hours: 2, templateType: '2h' },
  { key: 'h24', hours: 24, templateType: '24h' },
  { key: 'h72', hours: 72, templateType: '72h' },
  { key: 'd7', hours: 24 * 7, templateType: '7d' },
  { key: 'd14', hours: 24 * 14, templateType: '14d' },
  { key: 'd30', hours: 24 * 30, templateType: '30d' },
];

const AGE_BLOCK_PATTERNS = [
  /\b(7[0-9]|[8-9][0-9])\s*anos?\b/i,
  /\bidade\s*avan[cç]ada\b/i,
  /\bidoso(s)?\b/i,
  /\bterceira\s*idade\b/i,
  /\baposentad[oa]?\b/i,
  /\bnao\s+passa\s+na\s+idade\b/i,
  /\bn[aã]o\s+passa\s+na\s+idade\b/i,
  /\bbanco\s+n[aã]o\s+(libera|aprova|financia|aceita)\b/i,
  /\bn[aã]o\s+(libera|aprova|financia|aceita)\s+.*\idade\b/i,
  /\blimite\s+de\s+idade\b/i,
  /\bmuito\s+velh[oa]\b/i,
  /\bidade\s+.*\s+(financiamento|banco|cr[eé]dito)\b/i,
  /\b(financiamento|banco|cr[eé]dito)\s+.*\s+idade\b/i,
  /\bpela\s+idade\b/i,
  /\bpela\s+minha\s+idade\b/i,
];

function detectAgeFinancingBlock(text) {
  const t = String(text || '').trim();
  if (t.length < 8) return null;
  var i;
  for (i = 0; i < AGE_BLOCK_PATTERNS.length; i++) {
    if (AGE_BLOCK_PATTERNS[i].test(t)) {
      return 'idade_financiamento';
    }
  }
  return null;
}

function stageIndex(key) {
  var k = key || '';
  var i;
  for (i = 0; i < STAGE_SEQUENCE.length; i++) {
    if (STAGE_SEQUENCE[i].key === k) return i;
  }
  if (k === 'completed') return STAGE_SEQUENCE.length;
  return -1;
}

function getPropertyTitle(lead) {
  if (!lead.interestedProperties || !lead.interestedProperties.length) return null;
  var prop = getPropertyById(lead.interestedProperties[0]);
  return prop ? prop.title : null;
}

function isFollowUpEligible(lead, lastMsg) {
  if (!lead) return { ok: false, reason: 'sem_lead' };
  if (lead.followUpExcluded) {
    return { ok: false, reason: lead.followUpExcludeReason || 'excluido' };
  }
  if (lead.followUpPaused) return { ok: false, reason: 'pausado' };
  if (lead.modo_humano) return { ok: false, reason: 'modo_humano' };
  if (!lead.firstUserMessageAt && !lead.lastUserMessageAt) {
    return { ok: false, reason: 'sem_mensagem_cliente' };
  }
  if (lead.followUpStage === 'completed') return { ok: false, reason: 'sequencia_concluida' };
  if (lead.status === 'convertido' || lead.status === 'perdido') {
    return { ok: false, reason: 'status_final' };
  }
  if (lead.scheduledVisit && lead.scheduledVisit.date) {
    var visitDate = new Date(lead.scheduledVisit.date);
    if (!isNaN(visitDate.getTime()) && visitDate.getTime() > Date.now()) {
      return { ok: false, reason: 'visita_agendada' };
    }
  }
  if (lastMsg && lastMsg.role === 'user') {
    return { ok: false, reason: 'cliente_respondeu_por_ultimo' };
  }
  var lastUser = lead.lastUserMessageAt;
  if (!lastUser) return { ok: false, reason: 'sem_last_user' };
  return { ok: true, reason: '' };
}

function getHoursSinceUserMessage(lead, now) {
  var t = new Date(lead.lastUserMessageAt).getTime();
  if (isNaN(t)) return 0;
  return (now.getTime() - t) / HOUR;
}

function pickNextStage(lead, hoursInactive) {
  var current = stageIndex(lead.followUpStage || '');
  var i;
  for (i = 0; i < STAGE_SEQUENCE.length; i++) {
    if (i <= current) continue;
    if (hoursInactive >= STAGE_SEQUENCE[i].hours) {
      return STAGE_SEQUENCE[i];
    }
  }
  return null;
}

async function scanConversationForAgeBlock(db, phone) {
  try {
    var snap = await db.collection('chatbot_conversations')
      .doc(phone)
      .collection('messages')
      .orderBy('timestamp', 'desc')
      .limit(40)
      .get();
    var i;
    for (i = 0; i < snap.docs.length; i++) {
      var d = snap.docs[i].data();
      var reason = detectAgeFinancingBlock(d.content || '');
      if (reason) return reason;
    }
  } catch (_) {}
  return null;
}

async function backfillLeadUserTimestamps(db, phone, lead) {
  if (lead.lastUserMessageAt && lead.firstUserMessageAt) return lead;
  try {
    var snap = await db.collection('chatbot_conversations')
      .doc(phone)
      .collection('messages')
      .orderBy('timestamp', 'desc')
      .limit(30)
      .get();
    var ts = null;
    var j;
    for (j = 0; j < snap.docs.length; j++) {
      var md = snap.docs[j].data();
      if (md.role === 'user' && md.timestamp) {
        ts = md.timestamp;
        break;
      }
    }
    if (!ts) return lead;
    if (!ts) return lead;
    var patch = { lastUserMessageAt: ts, updatedAt: new Date().toISOString() };
    if (!lead.firstUserMessageAt) patch.firstUserMessageAt = ts;
    await db.collection('chatbot_leads').doc(phone).set(patch, { merge: true });
    return Object.assign({}, lead, patch);
  } catch (_) {
    return lead;
  }
}

async function runFollowUpForLead(docRef, lead, now, db) {
  if (db) {
    lead = await backfillLeadUserTimestamps(db, lead.phone, lead);
    if (!lead.followUpExcluded) {
      var ageInConvo = await scanConversationForAgeBlock(db, lead.phone);
      if (ageInConvo) {
        await setFollowUpExclusion(db, lead.phone, true, ageInConvo, 'sistema');
        return { skipped: true, reason: ageInConvo };
      }
    }
  }
  const lastMsg = await getLastConversationMessage(lead.phone);
  const check = isFollowUpEligible(lead, lastMsg);
  if (!check.ok) return { skipped: true, reason: check.reason };

  const hoursInactive = getHoursSinceUserMessage(lead, now);
  const next = pickNextStage(lead, hoursInactive);
  if (!next) return { skipped: true, reason: 'aguardando_proximo_estagio' };

  var minGapHours = 1;
  if (lead.lastFollowUpAt) {
    var sinceLastFu = (now.getTime() - new Date(lead.lastFollowUpAt).getTime()) / HOUR;
    if (sinceLastFu < minGapHours) return { skipped: true, reason: 'intervalo_minimo' };
  }

  const propertyTitle = getPropertyTitle(lead);
  try {
    await sendFollowUp(lead.phone, lead.name, propertyTitle, next.templateType);
    var log = Array.isArray(lead.followUpLog) ? lead.followUpLog.slice() : [];
    log.push({
      stage: next.key,
      at: now.toISOString(),
      templateType: next.templateType,
    });
    if (log.length > 12) log = log.slice(-12);

    var updates = {
      followUpStage: next.key,
      lastFollowUpAt: now.toISOString(),
      followUpLog: log,
      updatedAt: now.toISOString(),
    };
    if (next.key === 'd30') {
      updates.followUpStage = 'completed';
    }
    await docRef.update(updates);
    return { sent: true, stage: next.key, templateType: next.templateType };
  } catch (err) {
    return { error: err.message || String(err) };
  }
}

async function processAllFollowUps(db) {
  const now = new Date();
  const snap = await db.collection('chatbot_leads').get();
  var sent = 0;
  var skipped = 0;
  var errors = 0;

  for (const doc of snap.docs) {
    const lead = { phone: doc.id, ...doc.data() };
    const result = await runFollowUpForLead(doc.ref, lead, now, db);
    if (result.sent) sent++;
    else if (result.error) errors++;
    else skipped++;
  }

  return { sent: sent, skipped: skipped, errors: errors, total: snap.size };
}

async function setFollowUpExclusion(db, phone, excluded, reason, by) {
  await db.collection('chatbot_leads').doc(phone).set({
    followUpExcluded: !!excluded,
    followUpExcludeReason: excluded ? (reason || 'manual') : '',
    followUpExcludedAt: excluded ? new Date().toISOString() : null,
    followUpExcludedBy: excluded ? (by || 'admin') : null,
    followUpPaused: excluded,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

module.exports = {
  STAGE_SEQUENCE,
  detectAgeFinancingBlock,
  isFollowUpEligible,
  runFollowUpForLead,
  processAllFollowUps,
  setFollowUpExclusion,
};
