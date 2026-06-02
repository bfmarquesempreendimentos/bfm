const admin = require('firebase-admin');

function getDb() {
  return admin.firestore();
}

/** ID do documento no Firestore: só dígitos, Brasil com 55 + DDD + número */
function normalizeWhatsAppPhone(raw) {
  if (raw == null) return null;
  var s = String(raw).replace(/\D/g, '');
  if (s.length < 10) return null;
  if (s.length >= 12 && s.indexOf('55') === 0) return s;
  if (s.length === 11) return '55' + s;
  if (s.length === 10) return '55' + s;
  return s;
}

async function recordInboundActivity(phone, previewText) {
  const db = getDb();
  const ref = db.collection('chatbot_leads').doc(phone);
  var preview = (previewText || '').trim();
  if (preview.length > 220) preview = preview.substring(0, 217) + '...';
  var now = new Date().toISOString();
  try {
    await ref.update({
      lastMessageAt: now,
      lastActivityPreview: preview,
      updatedAt: now,
    });
  } catch (e) {
    console.warn('recordInboundActivity: doc missing or update failed', phone, e.message);
  }
}

const BRUNO_CORRETOR_PHONE_DISPLAY = '(21) 99555-7010';

var brokerPhoneCache = { at: 0, map: null };
var BROKER_CACHE_MS = 3 * 60 * 1000;

function isBrokerActiveFlag(value) {
  if (value === undefined || value === null) return true;
  if (value === false || value === 0) return false;
  if (value === true || value === 1) return true;
  var s = String(value).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'sim' || s === 'ativo';
}

async function findRegisteredBrokerByPhone(phone) {
  var norm = normalizeWhatsAppPhone(phone);
  if (!norm) return null;
  var now = Date.now();
  if (!brokerPhoneCache.map || now - brokerPhoneCache.at > BROKER_CACHE_MS) {
    var snap = await getDb().collection('brokers').get();
    var map = {};
    snap.forEach(function(doc) {
      var d = doc.data() || {};
      var p = normalizeWhatsAppPhone(d.phone);
      if (!p) return;
      var entry = {
        id: doc.id,
        name: d.name || '',
        email: d.email || '',
        isActive: isBrokerActiveFlag(d.isActive),
      };
      if (!map[p] || (entry.isActive && !map[p].isActive)) map[p] = entry;
    });
    brokerPhoneCache = { at: now, map: map };
  }
  var hit = brokerPhoneCache.map[norm];
  if (!hit || !hit.isActive) return null;
  return hit;
}

function getBrokerBiaPromptBlock(broker) {
  var first = String((broker && broker.name) || '').trim().split(' ')[0] || 'parceiro(a)';
  return '\n\n## MODO CORRETOR CADASTRADO (PRIORIDADE MÁXIMA)\n' +
    'Quem conversa é um *corretor parceiro* cadastrado: *' + first + '*. Esta conversa NÃO é lead/cliente final.\n\n' +
    '### O que você PODE fazer\n' +
    '- Tirar dúvidas sobre imóveis, empreendimentos, unidades, MCMV e condições gerais, usando listar_imoveis, detalhes_imovel e simular_financiamento quando ajudar o corretor a orientar o cliente dele.\n' +
    '- Tom profissional entre parceiros (sem roteiro de "primeira moradia" de consumidor).\n\n' +
    '### O que você NÃO resolve — encaminhe ao Bruno\n' +
    'Para *reserva de unidade*, *aprovação de financiamento*, *valores fechados*, *aprovação de proposta* ou decisão comercial/contratual: diga que é com o *Bruno Marques (gestão comercial)* no WhatsApp *' + BRUNO_CORRETOR_PHONE_DISPLAY + '*.\n' +
    '- Não invente preço, desconto, aprovação ou reserva.\n\n' +
    '### REGRA CONFIDENCIAL\n' +
    '- O telefone do Bruno (*' + BRUNO_CORRETOR_PHONE_DISPLAY + '*) é *EXCLUSIVO para corretores*. NUNCA mencione Bruno nem esse número para clientes finais/leads — nesta conversa é corretor, pode informar.\n\n' +
    '### Outras regras\n' +
    '- Não insista em "nome limpo do CPF" como para cliente final.\n' +
    '- Para reserva/financiamento aprovado/proposta/valores fechados, não use encaminhar_humano no lugar do Bruno — passe o WhatsApp do Bruno.\n' +
    '- Visitas operacionais com clientes do corretor: pode citar Davi (21) 99759-0814.\n' +
    '- Não pressione follow-up de lead.';
}

async function getOrCreateLead(phone, profileName) {
  const db = getDb();
  const ref = db.collection('chatbot_leads').doc(phone);
  const doc = await ref.get();

  if (doc.exists) {
    const data = doc.data();
    if (profileName && !data.name) {
      await ref.update({ name: profileName, updatedAt: new Date().toISOString() });
    }
    return { id: phone, ...data, name: data.name || profileName };
  }

  const now = new Date().toISOString();
  const newLead = {
    phone,
    name: profileName || '',
    income: null,
    cleanNameStatus: 'nao_informado',
    cpf: null,
    interestedProperties: [],
    status: 'novo',
    source: 'whatsapp_chatbot',
    assignedTo: 'Davi',
    notes: '',
    scheduledVisit: null,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
    lastActivityPreview: '',
    firstUserMessageAt: null,
    lastUserMessageAt: null,
    lastBotMessageAt: null,
    followUpStage: '',
    followUpExcluded: false,
    followUpExcludeReason: '',
    followUpPaused: false,
    followUpLog: [],
    lastFollowUpAt: null,
    welcomeSent: false,
  };

  await ref.set(newLead);
  return { id: phone, ...newLead };
}

async function updateLead(phone, data) {
  const db = getDb();
  await db.collection('chatbot_leads').doc(phone).update({
    ...data,
    updatedAt: new Date().toISOString(),
  });
}

async function addInterestedProperty(phone, propertyId) {
  const db = getDb();
  const ref = db.collection('chatbot_leads').doc(phone);
  const doc = await ref.get();
  if (!doc.exists) return;

  const current = doc.data().interestedProperties || [];
  if (!current.includes(propertyId)) {
    await ref.update({
      interestedProperties: [...current, propertyId],
      updatedAt: new Date().toISOString(),
    });
  }
}

async function getConversationHistory(phone, limit = 20) {
  const db = getDb();
  const snapshot = await db.collection('chatbot_conversations')
    .doc(phone)
    .collection('messages')
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();

  const messages = [];
  snapshot.forEach(doc => messages.push({ ...doc.data(), id: doc.id }));
  return messages.reverse();
}

/** Remove mensagem salva (histórico do painel). Não apaga no WhatsApp do cliente — limitação da API Meta. */
async function deleteConversationMessage(phone, messageDocId) {
  const db = getDb();
  const ref = db.collection('chatbot_conversations').doc(phone).collection('messages').doc(messageDocId);
  const doc = await ref.get();
  if (!doc.exists) {
    throw new Error('Mensagem não encontrada');
  }
  const d = doc.data();
  if (d.role !== 'assistant') {
    throw new Error('Só é possível remover mensagens enviadas pelo bot ou pelo painel');
  }
  await ref.delete();
}

async function saveMessage(phone, role, content, source, meta) {
  const db = getDb();
  const msg = {
    role,
    content: content || '',
    timestamp: new Date().toISOString(),
  };
  if (source) msg.source = source; // 'bot' | 'admin'
  meta = meta || {};
  if (meta.attachmentType) msg.attachmentType = meta.attachmentType;
  if (meta.attachmentUrl) msg.attachmentUrl = meta.attachmentUrl;
  if (meta.fileName) msg.fileName = meta.fileName;
  if (meta.whatsappMediaId) msg.whatsappMediaId = meta.whatsappMediaId;
  if (meta.mimeType) msg.mimeType = meta.mimeType;
  await db.collection('chatbot_conversations')
    .doc(phone)
    .collection('messages')
    .add(msg);

  var leadPatch = { lastMessageAt: msg.timestamp, updatedAt: msg.timestamp };
  if (role === 'user') {
    leadPatch.lastUserMessageAt = msg.timestamp;
    var leadSnap = await db.collection('chatbot_leads').doc(phone).get();
    if (leadSnap.exists && !leadSnap.data().firstUserMessageAt) {
      leadPatch.firstUserMessageAt = msg.timestamp;
    }
  } else if (role === 'assistant') {
    leadPatch.lastBotMessageAt = msg.timestamp;
  }
  try {
    await db.collection('chatbot_leads').doc(phone).set(leadPatch, { merge: true });
  } catch (_) {}

  // Atualiza indicadores operacionais de atendimento humano/SLA
  if (role === 'assistant' && source === 'admin') {
    try {
      await db.collection('chatbot_leads').doc(phone).update({
        lastHumanReplyAt: msg.timestamp,
        adminUnreadCount: 0,
        needsHumanFollowup: false,
        urgencyLevel: null,
        updatedAt: new Date().toISOString(),
      });
      await recordAdminBiaTraining(phone, content, (meta && meta.adminEmail) ? meta.adminEmail : 'admin');
    } catch (_) {}
  } else if (role === 'user') {
    try {
      await db.collection('chatbot_leads').doc(phone).update({
        lastUserMessageAt: msg.timestamp,
        updatedAt: new Date().toISOString(),
      });
    } catch (_) {}
  }
}

function escapeHtmlForEmail(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function recordAdminBiaTraining(phone, text, adminEmail) {
  const line = String(text || '').trim();
  if (line.length < 2) return;
  const db = getDb();
  const snippet = {
    text: line.substring(0, 800),
    phone: phone || '',
    admin: adminEmail || 'admin',
    at: new Date().toISOString(),
  };
  const globalRef = db.collection('bia_training').doc('global');
  const globalSnap = await globalRef.get();
  let snippets = (globalSnap.exists && globalSnap.data().snippets) ? globalSnap.data().snippets.slice() : [];
  snippets.push(snippet);
  if (snippets.length > 40) snippets = snippets.slice(-40);
  await globalRef.set({ snippets: snippets, updatedAt: new Date().toISOString() }, { merge: true });
  if (phone) {
    await db.collection('chatbot_leads').doc(phone).set({
      lastAdminGuidance: snippet.text,
      lastAdminGuidanceAt: snippet.at,
      lastAdminGuidanceBy: snippet.admin,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  }
}

async function getBiaTrainingPromptExtra(phone) {
  const db = getDb();
  const parts = [];
  try {
    const globalSnap = await db.collection('bia_training').doc('global').get();
    if (globalSnap.exists) {
      const snippets = (globalSnap.data().snippets || []).slice(-15);
      if (snippets.length) {
        parts.push('\n\n## ORIENTAÇÕES DO ATENDENTE (aprendizado — priorize ao responder)');
        snippets.forEach(function(s) {
          parts.push('- [' + (s.admin || 'admin') + ']: ' + (s.text || ''));
        });
      }
    }
  } catch (e) {
    console.warn('getBiaTrainingPromptExtra global:', e.message);
  }
  if (!phone) return parts.join('\n');
  try {
    const leadSnap = await db.collection('chatbot_leads').doc(phone).get();
    if (leadSnap.exists) {
      const d = leadSnap.data() || {};
      if (d.lastAdminGuidance) {
        parts.push('\n\n## CONTEXTO DESTE LEAD (atendente humano orientou):');
        parts.push(String(d.lastAdminGuidance));
      }
    }
    const hist = await getConversationHistory(phone, 30);
    const adminLines = [];
    hist.forEach(function(m) {
      if (m.role === 'assistant' && m.source === 'admin' && m.content) {
        adminLines.push(String(m.content).trim());
      }
    });
    if (adminLines.length) {
      parts.push('\n\n## O QUE O ATENDENTE JÁ DISSE NESTA CONVERSA (mantenha o mesmo tom e fatos):');
      adminLines.slice(-10).forEach(function(line) {
        parts.push('- ' + line);
      });
    }
  } catch (e2) {
    console.warn('getBiaTrainingPromptExtra lead:', e2.message);
  }
  return parts.join('\n');
}

async function queueInboundEmailAlert(phone, leadName, incomingText) {
  const db = getDb();
  const leadRef = db.collection('chatbot_leads').doc(phone);
  const leadDoc = await leadRef.get();
  if (!leadDoc.exists) return;
  const lead = leadDoc.data() || {};
  const nowMs = Date.now();
  const lastAlertMs = lead.lastInboundEmailAlertAt ? Date.parse(lead.lastInboundEmailAlertAt) : 0;
  // Evita spam: no máximo 1 alerta por lead a cada 15 min
  if (lastAlertMs && (nowMs - lastAlertMs) < 15 * 60 * 1000) return;

  const history = await getConversationHistory(phone, 6);
  var htmlLines = '';
  var i;
  for (i = 0; i < history.length; i++) {
    var h = history[i];
    var roleLabel = h.role === 'user' ? 'Cliente' : ((h.source === 'admin') ? 'Atendente' : 'Bia');
    var ts = h.timestamp ? new Date(h.timestamp).toLocaleString('pt-BR') : '';
    var text = escapeHtmlForEmail(h.content || '');
    if (text.length > 500) text = text.substring(0, 497) + '...';
    htmlLines += '<li><strong>' + roleLabel + '</strong> [' + escapeHtmlForEmail(ts) + ']: ' + text + '</li>';
  }

  const name = leadName || lead.name || 'Sem nome';
  const previewRaw = (incomingText || '').trim();
  const preview = previewRaw.length > 220 ? previewRaw.substring(0, 217) + '...' : previewRaw;
  const adminUrl = 'https://site-interativo-b-f-marques.web.app/admin.html#whatsapp-leads';

  await db.collection('emailQueue').add({
    to: 'bfmarquesempreendimentos@gmail.com',
    subject: 'Novo contato WhatsApp: ' + name + ' (' + phone + ')',
    body:
      '<h3>Novo contato no WhatsApp do painel</h3>' +
      '<p><strong>Lead:</strong> ' + escapeHtmlForEmail(name) + '</p>' +
      '<p><strong>Telefone:</strong> ' + escapeHtmlForEmail(phone) + '</p>' +
      '<p><strong>Última mensagem recebida:</strong> ' + escapeHtmlForEmail(preview) + '</p>' +
      '<p><a href="' + adminUrl + '">Abrir painel de atendimento</a></p>' +
      '<h4>Últimas mensagens</h4><ul>' + htmlLines + '</ul>',
    createdAt: new Date().toISOString(),
    status: 'pending',
  });

  await leadRef.update({
    lastInboundEmailAlertAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

function inferCategoryFromMotivo(motivo) {
  if (!motivo || typeof motivo !== 'string') return 'geral';
  const m = motivo.toLowerCase();
  if (m.indexOf('venda') >= 0 || m.indexOf('comprar') >= 0 || m.indexOf('imovel') >= 0 || m.indexOf('visita') >= 0) return 'vendas';
  if (m.indexOf('documento') >= 0 || m.indexOf('analise') >= 0 || m.indexOf('análise') >= 0) return 'vendas';
  if (m.indexOf('duvida') >= 0 || m.indexOf('dúvida') >= 0 || m.indexOf('pergunta') >= 0) return 'duvidas';
  if (m.indexOf('sugest') >= 0 || m.indexOf('reclam') >= 0 || m.indexOf('feedback') >= 0) return 'sugestoes';
  return 'geral';
}

async function setModoHumano(phone, adminEmail) {
  const db = getDb();
  var now = new Date();
  var due = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  await db.collection('chatbot_leads').doc(phone).update({
    modo_humano: true,
    humanoJa: true,
    assumido_por: adminEmail || 'admin',
    assumido_em: now.toISOString(),
    humanSlaDueAt: due.toISOString(),
    needsHumanFollowup: false,
    urgencyLevel: null,
    adminUnreadCount: 0,
    updatedAt: new Date().toISOString(),
  });
}

async function returnToBot(phone) {
  const db = getDb();
  await db.collection('chatbot_leads').doc(phone).update({
    modo_humano: false,
    assumido_por: null,
    assumido_em: null,
    adminUnreadCount: 0,
    revisarBot: true,
    updatedAt: new Date().toISOString(),
  });
}

async function incrementAdminUnread(phone) {
  const db = getDb();
  const ref = db.collection('chatbot_leads').doc(phone);
  const doc = await ref.get();
  if (!doc.exists) return;
  const current = doc.data().adminUnreadCount || 0;
  var next = current + 1;
  var updates = {
    adminUnreadCount: next,
    lastMessageAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (next >= 3) {
    updates.needsHumanFollowup = true;
    updates.urgencyLevel = 'alta';
  }
  await ref.update({
    ...updates,
  });
}

async function markAdminRead(phone) {
  const db = getDb();
  await db.collection('chatbot_leads').doc(phone).update({
    adminUnreadCount: 0,
    revisarBot: false,
    updatedAt: new Date().toISOString(),
  });
}

async function getLeadByPhone(phone) {
  const db = getDb();
  const doc = await db.collection('chatbot_leads').doc(phone).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

async function getLastConversationMessage(phone) {
  const db = getDb();
  const snapshot = await db.collection('chatbot_conversations')
    .doc(phone)
    .collection('messages')
    .orderBy('timestamp', 'desc')
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  const data = snapshot.docs[0].data();
  return { role: data.role, timestamp: data.timestamp };
}

async function qualifyLead(phone, data) {
  const updates = {};
  if (data.name) updates.name = data.name;
  if (data.income) updates.income = data.income;
  if (data.cpf) updates.cpf = data.cpf;
  if (data.email) updates.email = data.email;
  if (data.cleanNameStatus) updates.cleanNameStatus = data.cleanNameStatus;

  const hasQualifyingData = data.name && (data.income || data.cpf);
  if (hasQualifyingData) updates.status = 'qualificado';

  if (Object.keys(updates).length > 0) {
    await updateLead(phone, updates);
  }

  return hasQualifyingData;
}

async function scheduleVisit(phone, propertyId, date, notes = '') {
  const db = getDb();
  const visit = {
    leadPhone: phone,
    propertyId,
    date,
    notes,
    status: 'agendada',
    createdAt: new Date().toISOString(),
  };

  await db.collection('chatbot_visits').add(visit);
  await updateLead(phone, {
    scheduledVisit: { propertyId, date },
    status: 'agendado',
  });

  return visit;
}

async function getAllLeads(filters = {}) {
  const db = getDb();
  let query = db.collection('chatbot_leads').orderBy('createdAt', 'desc');

  if (filters.status) query = query.where('status', '==', filters.status);
  if (filters.limit) query = query.limit(filters.limit);

  const snapshot = await query.get();
  const leads = [];
  snapshot.forEach(doc => leads.push({ id: doc.id, ...doc.data() }));
  return leads;
}

async function getLeadStats() {
  const db = getDb();
  const snapshot = await db.collection('chatbot_leads').get();
  const stats = { total: 0, novo: 0, qualificado: 0, agendado: 0, convertido: 0, encaminhado: 0, emAtendimento: 0, pendentesLeitura: 0, vendas: 0, duvidas: 0, sugestoes: 0, urgentes: 0, slaAtrasado: 0, nomeLimpoOk: 0, nomeLimpoPendente: 0, followUpExcluded: 0, followUpElegivel: 0 };
  var nowMs = Date.now();
  snapshot.forEach(doc => {
    stats.total++;
    const d = doc.data();
    const s = d.status || 'novo';
    if (stats[s] !== undefined) stats[s]++;
    if (d.modo_humano) stats.emAtendimento++;
    if ((d.adminUnreadCount || 0) > 0) stats.pendentesLeitura++;
    if (d.needsHumanFollowup || d.urgencyLevel === 'alta') stats.urgentes++;
    if (d.cleanNameStatus === 'sim') stats.nomeLimpoOk++;
    else stats.nomeLimpoPendente++;
    var lastUser = d.lastUserMessageAt || d.lastMessageAt || d.updatedAt;
    if (lastUser) {
      var ms = Date.parse(lastUser);
      if (!isNaN(ms) && (nowMs - ms) > 2 * 60 * 60 * 1000 && (d.adminUnreadCount || 0) > 0) {
        stats.slaAtrasado++;
      }
    }
    const cat = d.categoria || 'geral';
    if (stats[cat] !== undefined) stats[cat]++;
    if (d.followUpExcluded) stats.followUpExcluded++;
    else if (d.firstUserMessageAt && !d.modo_humano && d.followUpStage !== 'completed') {
      stats.followUpElegivel++;
    }
  });
  return stats;
}

module.exports = {
  getOrCreateLead,
  updateLead,
  addInterestedProperty,
  getConversationHistory,
  deleteConversationMessage,
  saveMessage,
  qualifyLead,
  scheduleVisit,
  getAllLeads,
  getLeadStats,
  getLeadByPhone,
  getLastConversationMessage,
  setModoHumano,
  returnToBot,
  incrementAdminUnread,
  markAdminRead,
  inferCategoryFromMotivo,
  normalizeWhatsAppPhone,
  recordInboundActivity,
  queueInboundEmailAlert,
  recordAdminBiaTraining,
  getBiaTrainingPromptExtra,
  setFollowUpExclusion: function(phone, excluded, reason, by) {
    var apply = require('./follow-up-engine').setFollowUpExclusion;
    return apply(getDb(), phone, excluded, reason, by);
  },
  findRegisteredBrokerByPhone,
  getBrokerBiaPromptBlock,
  BRUNO_CORRETOR_PHONE_DISPLAY,
};
