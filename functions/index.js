const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const { verifyWebhook, processWebhook } = require('./chatbot/webhook');
const { getAllLeads, getLeadStats, getLeadByPhone, getConversationHistory, saveMessage, deleteConversationMessage, setModoHumano, returnToBot, markAdminRead, getLastConversationMessage, normalizeWhatsAppPhone, recordInboundActivity } = require('./chatbot/lead-manager');
const { sendFollowUp } = require('./chatbot/templates');
const { getPropertyById } = require('./chatbot/property-data');
const { sendTextMessage, uploadMediaBuffer, sendMediaById, getWhatsAppMediaBuffer } = require('./chatbot/whatsapp-api');
const propertySalesHandlers = require('./property-sales-handlers');

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

async function listBrokerCampaignTargets(db, payload) {
  const snapshot = await db.collection('brokers').get();
  const brokers = snapshot.docs.map(function(doc) {
    return { id: doc.id, ...doc.data() };
  });
  let targetList = brokers.filter(function(b) {
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

async function getBrokerCampaignPreview(db) {
  const config = await getBrokerCampaignConfig(db);
  const targetList = await listBrokerCampaignTargets(db, {});
  let eligible = 0;
  let invalidPhone = 0;
  targetList.forEach(function(b) {
    if (normalizeBrazilWhatsApp(b.phone)) eligible += 1;
    else invalidPhone += 1;
  });
  let optOutCount = 0;
  const allSnap = await db.collection('brokers').get();
  allSnap.docs.forEach(function(doc) {
    const d = doc.data() || {};
    if (d.whatsappCampaignOptOut && isBrokerActiveFlag(d.isActive)) optOutCount += 1;
  });
  return {
    enabled: !!config.enabled,
    totalActiveNotOptOut: targetList.length,
    eligible: eligible,
    invalidPhone: invalidPhone,
    optOut: optOutCount,
    nextWeeklyNote: config.enabled
      ? 'Próximo envio automático: segunda-feira às 08:00 (horário de Brasília).'
      : 'Envio automático desativado. Marque a opção acima e clique em Salvar.',
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
  const config = await getBrokerCampaignConfig(db);
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
    sendable.push({ broker: broker, waPhone: waPhone });
  });

  for (let i = 0; i < sendable.length; i++) {
    const item = sendable[i];
    const message = buildBrokerCampaignMessage(config, item.broker, now);
    try {
      await sendTextMessage(item.waPhone, message);
      results.push({
        brokerId: item.broker.id,
        name: item.broker.name || '',
        status: 'sent',
        phone: item.waPhone,
      });
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
    return res.json({
      wa,
      repairsOpen,
      salesCount: salesSnap.size,
      brokersActive,
      brokersTotal: brokerSnap.size,
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
      return res.json(stats);
    }

    if (action === 'conversation' && req.query.phone) {
      const raw = String(req.query.phone).trim();
      const norm = normalizeWhatsAppPhone(raw) || raw;
      let lead = await getLeadByPhone(norm);
      if (!lead && raw !== norm) {
        lead = await getLeadByPhone(raw);
      }
      if (!lead) return res.status(404).json({ error: 'Conversa não encontrada' });
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
    const unreadOnly = req.query.unread === '1' || req.query.unread === 'true';
    const revisarBotOnly = req.query.revisar_bot === '1' || req.query.revisar_bot === 'true';
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
    if (unreadOnly) leads = leads.filter(l => (l.adminUnreadCount || 0) > 0);
    if (revisarBotOnly) leads = leads.filter(l => !!l.revisarBot);
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
        const tipoLabel = up.waType === 'image' ? 'Imagem' : up.waType === 'video' ? 'Vídeo' : up.waType === 'audio' ? 'Áudio' : 'Documento';
        const line = caption || ('[' + tipoLabel + ': ' + mediaName + ']');
        await saveMessage(phone, 'assistant', line, 'admin', {
          attachmentType: up.waType,
          fileName: mediaName,
          whatsappMediaId: up.id,
          mimeType: mediaMime,
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

exports.brokerCampaignPreview = functions.https.onRequest(async (req, res) => {
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
      const brokerId = String(body.brokerId || '').trim();
      const internalPayload = {
        type: body.type || 'manual',
        force: true,
        brokerId: brokerId,
        phone: body.phone || '',
      };

      if (brokerId) {
        const result = await sendWeeklyBrokerCampaignInternal(internalPayload);
        return res.json(result);
      }

      const db = admin.firestore();
      const runRef = db.collection('broker_campaign_logs').doc();
      const preview = await getBrokerCampaignPreview(db);
      await runRef.set({
        type: internalPayload.type,
        forced: true,
        status: 'queued',
        startedAt: new Date().toISOString(),
        totalTargets: preview.totalActiveNotOptOut,
        eligible: preview.eligible,
      }, { merge: true });

      res.json({
        ok: true,
        async: true,
        runId: runRef.id,
        sent: 0,
        errors: 0,
        skipped: 0,
        totalTargets: preview.totalActiveNotOptOut,
        eligible: preview.eligible,
        invalidPhone: preview.invalidPhone,
        message: 'Disparo em massa iniciado. Aguarde o resultado na tela.',
      });

      sendWeeklyBrokerCampaignInternal({
        type: internalPayload.type,
        force: true,
        runId: runRef.id,
      }).catch(function(err) {
        console.error('brokerCampaignSendNow async:', err);
        return runRef.set({
          status: 'error',
          finishedAt: new Date().toISOString(),
          error: err.message || String(err),
        }, { merge: true });
      });
      return null;
    } catch (err) {
      console.error('brokerCampaignSendNow:', err);
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
