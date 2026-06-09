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

/**
 * Gera chaves de comparação de telefone tolerantes ao 9º dígito (Brasil).
 * Ex.: 5521998080191 e 552198080191 viram o mesmo conjunto de chaves.
 */
function brokerPhoneMatchKeys(raw) {
  var keys = [];
  var norm = normalizeWhatsAppPhone(raw);
  if (!norm) return keys;
  keys.push(norm);
  if (norm.indexOf('55') === 0 && norm.length >= 12) {
    var ddd = norm.substring(2, 4);
    var rest = norm.substring(4);
    if (rest.length === 9 && rest.charAt(0) === '9') {
      keys.push('55' + ddd + rest.substring(1));
    } else if (rest.length === 8) {
      keys.push('55' + ddd + '9' + rest);
    }
  }
  return keys;
}

async function findRegisteredBrokerByPhone(phone) {
  var lookupKeys = brokerPhoneMatchKeys(phone);
  if (!lookupKeys.length) return null;
  var now = Date.now();
  if (!brokerPhoneCache.map || now - brokerPhoneCache.at > BROKER_CACHE_MS) {
    var snap = await getDb().collection('brokers').get();
    var map = {};
    snap.forEach(function(doc) {
      var d = doc.data() || {};
      var entry = {
        id: doc.id,
        name: d.name || '',
        email: d.email || '',
        isActive: isBrokerActiveFlag(d.isActive),
      };
      var brokerKeys = brokerPhoneMatchKeys(d.phone);
      brokerKeys.forEach(function(k) {
        if (!map[k] || (entry.isActive && !map[k].isActive)) map[k] = entry;
      });
    });
    brokerPhoneCache = { at: now, map: map };
  }
  var i;
  for (i = 0; i < lookupKeys.length; i++) {
    var hit = brokerPhoneCache.map[lookupKeys[i]];
    if (hit && hit.isActive) return hit;
  }
  return null;
}

function getBrokerBiaPromptBlock(broker) {
  var first = String((broker && broker.name) || '').trim().split(' ')[0] || 'parceiro(a)';
  return '\n\n## MODO CORRETOR CADASTRADO (PRIORIDADE MÁXIMA)\n' +
    'Quem conversa é um *corretor parceiro* cadastrado: *' + first + '*. Esta conversa NÃO é lead/cliente final. Trate como colega profissional do mercado imobiliário.\n\n' +
    '### CONTATO HUMANO = SEMPRE BRUNO (NUNCA DAVI)\n' +
    '- O único contato humano para o corretor é o *Bruno Marques* no WhatsApp *' + BRUNO_CORRETOR_PHONE_DISPLAY + '* (gestão comercial).\n' +
    '- *NUNCA* cite o "Davi" nem o número (21) 99759-0814 para corretor. Davi é só para cliente final — aqui é Bruno.\n' +
    '- Para *reserva de unidade*, *aprovação de financiamento*, *valores fechados*, *proposta*, *agendamento/visita* ou qualquer decisão comercial: direcione ao *Bruno Marques ' + BRUNO_CORRETOR_PHONE_DISPLAY + '*. Não use encaminhar_humano no lugar do Bruno; passe o WhatsApp do Bruno.\n' +
    '- O telefone do Bruno é *EXCLUSIVO para corretores* — nunca passe para cliente final.\n\n' +
    '### NÃO EXPLIQUE NADA TÉCNICO (O CORRETOR JÁ SABE)\n' +
    '- *NÃO* explique como funciona o Minha Casa Minha Vida, faixas de renda, subsídio, taxas de juros, ITBI/registro, prazo ou regras do programa. O corretor é profissional e já domina isso.\n' +
    '- *NÃO* peça renda bruta familiar, CPF, "nome limpo" nem faça roteiro de qualificação de consumidor.\n' +
    '- *NÃO* ofereça simulação de financiamento por iniciativa própria nem dê discurso de "sair do aluguel". Só rode simular_financiamento se o corretor pedir explicitamente um número.\n' +
    '- Seja objetivo e direto, de profissional para profissional. Responda só o que foi perguntado, com dados concretos.\n\n' +
    '### O que você FORNECE ao corretor (dados objetivos)\n' +
    '- Preço de venda, *valor de engenharia*, status de unidade (disponível/reservado/assinado): use SEMPRE estoque_empreendimento e consultar_unidade (dados oficiais — não invente).\n' +
    '- Características, endereço e mapa dos empreendimentos: use listar_imoveis e detalhes_imovel.\n' +
    '- Não invente preço, desconto, aprovação ou reserva.\n\n' +
    '### COMO CONHECER O LOCAL / PEGAR A CHAVE (VISITA DO CORRETOR)\n' +
    '- Se o corretor perguntar como *conhecer o local*, *visitar*, *pegar/onde está a chave* ou *acessar o empreendimento*, use a ferramenta *orientar_acesso_visita*. Ela envia o vídeo de acesso.\n' +
    '- Explique que a chave fica escondida no *quadro de luz da Enel* do empreendimento — *mesmo padrão em todos* (o vídeo mostra onde) e que ele pode ir conhecer com o cliente. Para combinar horário/suporte, contato é o *Bruno ' + BRUNO_CORRETOR_PHONE_DISPLAY + '*.\n' +
    '- Essa orientação de chave é *exclusiva para corretor* — nunca passe para cliente final.\n\n' +
    '### Outras regras\n' +
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

/** Lições automáticas: a Bia aprende com os próprios erros recorrentes. */
var BIA_AUTO_LESSONS = {
  citou_davi: 'NUNCA cite "Davi" nem o número (21) 99759-0814 para corretor cadastrado. O contato do corretor é SEMPRE o Bruno Marques (21) 99555-7010.',
  pediu_cpf_nome_limpo: 'NUNCA peça CPF nem "nome limpo" para corretor cadastrado — ele não é cliente final.',
  pediu_renda: 'NUNCA peça renda para corretor cadastrado. Dê só dados objetivos (preço, engenharia, estoque, endereço).',
  explicou_mcmv: 'NÃO explique Minha Casa Minha Vida, subsídio, faixas nem use "sair do aluguel" com corretor. Ele já domina o programa.',
};

/** Registra/contabiliza uma lição quando a Bia comete um erro conhecido. */
async function recordBiaAutoLesson(key) {
  if (!key || !BIA_AUTO_LESSONS[key]) return;
  const db = getDb();
  const ref = db.collection('bia_training').doc('auto');
  const snap = await ref.get();
  const data = snap.exists ? (snap.data() || {}) : {};
  let lessons = Array.isArray(data.lessons) ? data.lessons.slice() : [];
  let found = false;
  const nowIso = new Date().toISOString();
  lessons.forEach(function(l) {
    if (l.key === key) {
      l.count = (l.count || 1) + 1;
      l.lastAt = nowIso;
      l.text = BIA_AUTO_LESSONS[key];
      found = true;
    }
  });
  if (!found) {
    lessons.push({ key: key, text: BIA_AUTO_LESSONS[key], count: 1, firstAt: nowIso, lastAt: nowIso });
  }
  if (lessons.length > 30) lessons = lessons.slice(-30);
  await ref.set({ lessons: lessons, updatedAt: nowIso }, { merge: true });
}

async function getBiaTrainingPromptExtra(phone) {
  const db = getDb();
  const parts = [];
  try {
    const autoSnap = await db.collection('bia_training').doc('auto').get();
    if (autoSnap.exists) {
      const autoData = autoSnap.data() || {};
      const manual = (autoData.manual || []);
      if (manual.length) {
        parts.push('\n\n## REGRAS DEFINIDAS PELO GESTOR (PRIORIDADE MÁXIMA — sempre siga)');
        manual.forEach(function(m) {
          parts.push('- ' + (typeof m === 'string' ? m : (m.text || '')));
        });
      }
      const lessons = (autoData.lessons || []);
      if (lessons.length) {
        parts.push('\n\n## LIÇÕES APRENDIDAS (erros já cometidos — NUNCA repita)');
        lessons.forEach(function(l) {
          parts.push('- ' + (l.text || ''));
        });
      }
    }
  } catch (eAuto) {
    console.warn('getBiaTrainingPromptExtra auto:', eAuto.message);
  }
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
  recordBiaAutoLesson,
  getBiaTrainingPromptExtra,
  setFollowUpExclusion: function(phone, excluded, reason, by) {
    var apply = require('./follow-up-engine').setFollowUpExclusion;
    return apply(getDb(), phone, excluded, reason, by);
  },
  findRegisteredBrokerByPhone,
  brokerPhoneMatchKeys,
  getBrokerBiaPromptBlock,
  BRUNO_CORRETOR_PHONE_DISPLAY,
};
