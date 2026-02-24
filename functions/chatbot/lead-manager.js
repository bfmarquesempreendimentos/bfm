const admin = require('firebase-admin');

function getDb() {
  return admin.firestore();
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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

async function saveMessage(phone, role, content) {
  const db = getDb();
  await db.collection('chatbot_conversations')
    .doc(phone)
    .collection('messages')
    .add({
      role,
      content,
      timestamp: new Date().toISOString(),
    });
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
  const stats = { total: 0, novo: 0, qualificado: 0, agendado: 0, convertido: 0 };
  snapshot.forEach(doc => {
    stats.total++;
    const s = doc.data().status || 'novo';
    if (stats[s] !== undefined) stats[s]++;
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
};
