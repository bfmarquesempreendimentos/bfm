const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const { verifyWebhook, processWebhook } = require('./chatbot/webhook');
const { getAllLeads, getLeadStats } = require('./chatbot/lead-manager');
const { sendFollowUp } = require('./chatbot/templates');
const { getPropertyById } = require('./chatbot/property-data');

admin.initializeApp();

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

exports.sendQueuedEmail = functions.firestore
  .document('emailQueue/{docId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const transporter = getTransporter();
    if (!transporter) {
      await snap.ref.set({ status: 'error', error: 'SMTP não configurado' }, { merge: true });
      return;
    }
    
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
  });

// ─── WhatsApp Chatbot Webhook ─────────────────────────────────────
exports.chatbotWebhook = functions
  .runWith({
    secrets: ['WHATSAPP_TOKEN', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'ANTHROPIC_API_KEY'],
    timeoutSeconds: 60,
    memory: '512MB',
  })
  .https.onRequest(async (req, res) => {
    if (req.method === 'GET') {
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
        isAdmin: d.isAdmin || false,
        createdAt: d.createdAt ? d.createdAt : new Date().toISOString()
      };
    });
    brokers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return res.json(brokers);
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
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'nome, email e senha obrigatórios' });
    }
    const db = admin.firestore();
    const existing = await db.collection('brokers').where('email', '==', email).get();
    if (!existing.empty) {
      return res.status(409).json({ error: 'Email já cadastrado' });
    }
    const docRef = await db.collection('brokers').add({
      name: name || '',
      cpf: (cpf || '').replace(/\D/g, ''),
      email: email,
      phone: phone || '',
      creci: creci || '',
      password: password || '',
      isActive: false,
      createdAt: new Date().toISOString()
    });
    return res.json({ success: true, id: docRef.id });
  } catch (err) {
    console.error('Erro ao cadastrar corretor:', err);
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

// ─── Follow-up automático (roda a cada 6 horas) ──────────────────
exports.chatbotFollowUp = functions
  .runWith({
    secrets: ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'],
    timeoutSeconds: 120,
    memory: '256MB',
  })
  .pubsub.schedule('every 6 hours')
  .timeZone('America/Sao_Paulo')
  .onRun(async () => {
    const db = admin.firestore();
    const now = new Date();

    const leadsSnap = await db.collection('chatbot_leads')
      .where('status', 'in', ['novo', 'qualificado'])
      .get();

    for (const doc of leadsSnap.docs) {
      const lead = doc.data();
      const created = new Date(lead.createdAt);
      const hoursElapsed = (now - created) / (1000 * 60 * 60);
      const lastFollowUp = lead.lastFollowUp ? new Date(lead.lastFollowUp) : null;
      const hoursSinceFollowUp = lastFollowUp ? (now - lastFollowUp) / (1000 * 60 * 60) : Infinity;

      if (hoursSinceFollowUp < 20) continue;

      try {
        let propertyTitle = null;
        if (lead.interestedProperties?.length > 0) {
          const prop = getPropertyById(lead.interestedProperties[0]);
          if (prop) propertyTitle = prop.title;
        }

        if (hoursElapsed >= 20 && hoursElapsed < 48 && !lead.followUp24hSent) {
          await sendFollowUp(lead.phone, lead.name, propertyTitle, '24h');
          await doc.ref.update({ followUp24hSent: true, lastFollowUp: now.toISOString() });
          console.log(`Follow-up 24h enviado para ${lead.phone}`);
        } else if (hoursElapsed >= 68 && !lead.followUp72hSent) {
          await sendFollowUp(lead.phone, lead.name, propertyTitle, '72h');
          await doc.ref.update({ followUp72hSent: true, lastFollowUp: now.toISOString() });
          console.log(`Follow-up 72h enviado para ${lead.phone}`);
        }
      } catch (err) {
        console.error(`Erro follow-up para ${lead.phone}:`, err.message);
      }
    }

    return null;
  });
