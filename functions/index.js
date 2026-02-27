const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const { verifyWebhook, processWebhook } = require('./chatbot/webhook');
const { getAllLeads, getLeadStats } = require('./chatbot/lead-manager');
const { sendFollowUp } = require('./chatbot/templates');
const { getPropertyById } = require('./chatbot/property-data');
const { sendTextMessage } = require('./chatbot/whatsapp-api');

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
    secrets: ['WHATSAPP_TOKEN', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'ANTHROPIC_API_KEY'],
    timeoutSeconds: 60,
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
        return res.status(200).json({
          ok: hasToken && hasVerify && hasPhoneId && hasAnthropic,
          secrets: {
            WHATSAPP_TOKEN: hasToken ? 'definido' : 'FALTANDO',
            WHATSAPP_VERIFY_TOKEN: hasVerify ? 'definido' : 'FALTANDO',
            WHATSAPP_PHONE_NUMBER_ID: hasPhoneId ? 'definido' : 'FALTANDO (use o do payload ou Embedded Signup)',
            ANTHROPIC_API_KEY: hasAnthropic ? 'definido' : 'FALTANDO',
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
      createdAt: new Date().toISOString()
    });
    return res.json({ success: true, id: docRef.id });
  } catch (err) {
    console.error('Erro ao cadastrar corretor:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── API de Vendas (fallback quando Firestore client falha no Mac) ────
exports.getPropertySales = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
  try {
    const db = admin.firestore();
    const snapshot = await db.collection('propertySales').get();
    const sales = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return res.json(sales);
  } catch (err) {
    console.error('Erro ao buscar vendas:', err);
    return res.status(500).json({ error: err.message });
  }
});

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
