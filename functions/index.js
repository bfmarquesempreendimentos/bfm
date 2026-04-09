const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const { verifyWebhook, processWebhook } = require('./chatbot/webhook');
const { getAllLeads, getLeadStats, getLeadByPhone, getConversationHistory, saveMessage, setModoHumano, returnToBot, markAdminRead, getLastConversationMessage, normalizeWhatsAppPhone, recordInboundActivity } = require('./chatbot/lead-manager');
const { sendFollowUp } = require('./chatbot/templates');
const { getPropertyById } = require('./chatbot/property-data');
const { sendTextMessage, uploadMediaBuffer, sendMediaById } = require('./chatbot/whatsapp-api');

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
      return res.json(stats);
    }

    if (action === 'conversation' && req.query.phone) {
      const raw = String(req.query.phone).trim();
      let phone = normalizeWhatsAppPhone(raw) || raw;
      let lead = await getLeadByPhone(phone);
      if (!lead && raw !== phone) {
        lead = await getLeadByPhone(raw);
        if (lead) phone = raw;
      }
      if (!lead) return res.status(404).json({ error: 'Conversa não encontrada' });
      const messages = await getConversationHistory(phone, 500);
      return res.json({ lead, messages });
    }

    const statusFilter = req.query.status;
    const categoriaFilter = req.query.categoria;
    const modoHumanoFilter = req.query.modo_humano;
    const search = (req.query.search || '').trim().toLowerCase();
    const limit = Math.min(parseInt(req.query.limit) || 100, 200);

    let query = db.collection('chatbot_leads').orderBy('updatedAt', 'desc').limit(Math.min(limit * 2, 300));
    const snapshot = await query.get();
    let leads = [];
    snapshot.forEach(doc => leads.push({ id: doc.id, ...doc.data() }));

    if (statusFilter) leads = leads.filter(l => (l.status || 'novo') === statusFilter);
    if (categoriaFilter) leads = leads.filter(l => (l.categoria || 'geral') === categoriaFilter);
    if (modoHumanoFilter === 'true') leads = leads.filter(l => !!l.modo_humano);
    else if (modoHumanoFilter === 'false') leads = leads.filter(l => !l.modo_humano);
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
        const tipoLabel = up.waType === 'image' ? 'Imagem' : up.waType === 'video' ? 'Vídeo' : 'Documento';
        const line = caption || ('[' + tipoLabel + ': ' + mediaName + ']');
        await saveMessage(phone, 'assistant', line, 'admin', {
          attachmentType: up.waType,
          fileName: mediaName,
        });
        await recordInboundActivity(phone, line);
        return res.json({ success: true, message: 'Mídia enviada' });
      }

      if (!text) return res.status(400).json({ error: 'Digite uma mensagem ou anexe um arquivo' });

      await sendTextMessage(phone, text);
      await saveMessage(phone, 'assistant', text, 'admin');
      await recordInboundActivity(phone, text);
      return res.json({ success: true, message: 'Mensagem enviada' });
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err);
      return res.status(500).json({ error: err.message });
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
    const HOUR = 1000 * 60 * 60;
    const DAY = HOUR * 24;

    const leadsSnap = await db.collection('chatbot_leads')
      .where('status', 'in', ['novo', 'qualificado'])
      .get();

    for (const doc of leadsSnap.docs) {
      const lead = doc.data();
      if (lead.modo_humano) continue;

      const created = new Date(lead.createdAt);
      const hoursElapsed = (now - created) / HOUR;
      const lastFollowUp = lead.lastFollowUp ? new Date(lead.lastFollowUp) : null;
      const hoursSinceFollowUp = lastFollowUp ? (now - lastFollowUp) / HOUR : Infinity;

      try {
        let propertyTitle = null;
        if (lead.interestedProperties && lead.interestedProperties.length > 0) {
          const prop = getPropertyById(lead.interestedProperties[0]);
          if (prop) propertyTitle = prop.title;
        }

        if (hoursSinceFollowUp < 20) continue;

        if (hoursElapsed >= 20 && hoursElapsed < 48 && !lead.followUp24hSent) {
          await sendFollowUp(lead.phone, lead.name, propertyTitle, '24h');
          await doc.ref.update({ followUp24hSent: true, lastFollowUp: now.toISOString() });
          console.log(`Follow-up 24h enviado para ${lead.phone}`);
        } else if (hoursElapsed >= 68 && !lead.followUp72hSent) {
          await sendFollowUp(lead.phone, lead.name, propertyTitle, '72h');
          await doc.ref.update({ followUp72hSent: true, lastFollowUp: now.toISOString() });
          console.log(`Follow-up 72h enviado para ${lead.phone}`);
        } else {
          const lastMsg = await getLastConversationMessage(lead.phone);
          if (!lastMsg || lastMsg.role === 'user') continue;
          const lastMsgAt = new Date(lastMsg.timestamp);
          const daysSinceLastBotMsg = (now - lastMsgAt) / DAY;

          if (daysSinceLastBotMsg >= 30 && !lead.followUp30dSent) {
            await sendFollowUp(lead.phone, lead.name, null, '30d');
            await doc.ref.update({ followUp30dSent: true, lastFollowUp: now.toISOString() });
            console.log(`Follow-up 30d enviado para ${lead.phone}`);
          } else if (daysSinceLastBotMsg >= 14 && !lead.followUp14dSent) {
            await sendFollowUp(lead.phone, lead.name, null, '14d');
            await doc.ref.update({ followUp14dSent: true, lastFollowUp: now.toISOString() });
            console.log(`Follow-up 14d enviado para ${lead.phone}`);
          } else if (daysSinceLastBotMsg >= 7 && !lead.followUp7dSent) {
            await sendFollowUp(lead.phone, lead.name, propertyTitle, '7d');
            await doc.ref.update({ followUp7dSent: true, lastFollowUp: now.toISOString() });
            console.log(`Follow-up 7d enviado para ${lead.phone}`);
          }
        }
      } catch (err) {
        console.error(`Erro follow-up para ${lead.phone}:`, err.message);
      }
    }

    return null;
  });
