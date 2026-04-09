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
  snapshot.forEach(doc => messages.push(doc.data()));
  return messages.reverse();
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
  await db.collection('chatbot_conversations')
    .doc(phone)
    .collection('messages')
    .add(msg);
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
  await db.collection('chatbot_leads').doc(phone).update({
    modo_humano: true,
    assumido_por: adminEmail || 'admin',
    assumido_em: new Date().toISOString(),
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
    updatedAt: new Date().toISOString(),
  });
}

async function incrementAdminUnread(phone) {
  const db = getDb();
  const ref = db.collection('chatbot_leads').doc(phone);
  const doc = await ref.get();
  if (!doc.exists) return;
  const current = doc.data().adminUnreadCount || 0;
  await ref.update({
    adminUnreadCount: current + 1,
    lastMessageAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

async function markAdminRead(phone) {
  const db = getDb();
  await db.collection('chatbot_leads').doc(phone).update({
    adminUnreadCount: 0,
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
  const stats = { total: 0, novo: 0, qualificado: 0, agendado: 0, convertido: 0, encaminhado: 0, emAtendimento: 0, pendentesLeitura: 0, vendas: 0, duvidas: 0, sugestoes: 0 };
  snapshot.forEach(doc => {
    stats.total++;
    const d = doc.data();
    const s = d.status || 'novo';
    if (stats[s] !== undefined) stats[s]++;
    if (d.modo_humano) stats.emAtendimento++;
    if ((d.adminUnreadCount || 0) > 0) stats.pendentesLeitura++;
    const cat = d.categoria || 'geral';
    if (stats[cat] !== undefined) stats[cat]++;
  });
  return stats;
}

module.exports = {
  getOrCreateLead,
  updateLead,
  addInterestedProperty,
  getConversationHistory,
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
};
