/* Painel de Atendimento WhatsApp - Inbox e gestão de contatos */

/** Alinha com lead-manager.normalizeWhatsAppPhone (só dígitos, BR com 55) */
function normalizeWaPhone(raw) {
  if (raw == null) return '';
  var s = String(raw).replace(/\D/g, '');
  if (s.length < 10) return String(raw).trim();
  if (s.length >= 12 && s.indexOf('55') === 0) return s;
  if (s.length === 11) return '55' + s;
  if (s.length === 10) return '55' + s;
  return s;
}

function getWaInboxBaseUrl() {
    if (typeof getCloudFunctionsBaseUrl === 'function') return getCloudFunctionsBaseUrl();
    if (typeof ApiClient !== 'undefined' && ApiClient.getBaseUrl) return ApiClient.getBaseUrl();
    if (typeof CONFIG !== 'undefined' && CONFIG.cloudFunctions && CONFIG.cloudFunctions.baseURL) {
        return CONFIG.cloudFunctions.baseURL;
    }
    return '';
}
var waLeadsData = [];
/** Atalho ativo nos cartões de estatística: '' | 'total' | 'pendentes' | 'humano' | 'vendas' | 'duvidas' | 'sugestoes' */
var waInboxQuickFilter = '';
var waInboxSelectedPhone = null;
var waInboxPollTimer = null;
var waInboxPollInterval = 22000;
var waLastListSig = '';
var waLastChatSig = '';
var WA_SLA_FIRST_RESPONSE_MINUTES = 120;

function parseDateSafe(value) {
  if (!value) return null;
  var d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function minutesSince(value) {
  var d = parseDateSafe(value);
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / 60000);
}

function formatRelativeMinutes(mins) {
  if (mins == null || mins < 0) return '';
  if (mins < 1) return 'agora';
  if (mins < 60) return 'há ' + mins + ' min';
  var h = Math.floor(mins / 60);
  var rem = mins % 60;
  if (h < 24) return 'há ' + h + 'h' + (rem ? (' ' + rem + 'm') : '');
  var d = Math.floor(h / 24);
  return 'há ' + d + ' dia(s)';
}

function waInboxGetToken() {
  if (typeof getAdminIdToken === 'function') return getAdminIdToken();
  return Promise.resolve(null);
}

function waInboxGetCreds() {
  if (typeof getAdminApiCredentials === 'function') return getAdminApiCredentials();
  try {
    var s = sessionStorage.getItem('adminSession');
    if (s) {
      var o = JSON.parse(s);
      if (o && o.email && o.password) return { email: o.email, password: o.password };
    }
  } catch (e) {}
  return { email: '', password: '' };
}

function waInboxApi(path, options) {
  options = options || {};
  var method = (options.method || 'GET').toUpperCase();
  var body = options.body;
  return waInboxGetToken().then(function(token) {
    var headers = { 'Content-Type': 'application/json' };
    var creds = waInboxGetCreds();
    var url = getWaInboxBaseUrl() + path;

    if (token) {
      headers.Authorization = 'Bearer ' + token;
    } else if (method === 'POST') {
      body = body || {};
      if (!body.adminEmail && creds.email) body.adminEmail = creds.email;
      if (!body.adminPassword && creds.password) body.adminPassword = creds.password;
    } else if (creds.email && creds.password) {
      var sep = url.indexOf('?') >= 0 ? '&' : '?';
      url += sep + 'adminEmail=' + encodeURIComponent(creds.email) +
        '&adminPassword=' + encodeURIComponent(creds.password);
    } else {
      return Promise.reject(new Error('Sessão expirada. Saia e entre novamente no painel.'));
    }

    return fetch(url, {
      method: method,
      headers: headers,
      body: method === 'POST' && body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      credentials: 'omit'
    }).then(function(res) {
      return res.text().then(function(txt) {
        var data = null;
        try { data = txt ? JSON.parse(txt) : null; } catch (parseErr) { data = null; }
        if (!res.ok) {
          var msg = (data && data.error) ? String(data.error) : '';
          if (!msg && res.status === 403) msg = 'Acesso negado. Entre novamente no painel.';
          if (!msg) msg = 'Erro ' + res.status;
          throw new Error(msg);
        }
        return data || {};
      });
    });
  });
}

function waInboxRefresh() {
  waLastListSig = '';
  waLastChatSig = '';
  waInboxLoadList();
  waInboxLoadStats();
  if (typeof showMessage === 'function') showMessage('Lista atualizada.', 'success');
}

function waInboxLoadStats() {
  waInboxApi('/chatbotInbox?action=stats').then(function(stats) {
    var el;
    var total = stats.total || 0;
    el = document.getElementById('waStatTotal');
    if (el) el.textContent = total;
    el = document.getElementById('waStatPendentes');
    if (el) el.textContent = stats.pendentesLeitura || 0;
    el = document.getElementById('waStatAtendimento');
    if (el) el.textContent = stats.emAtendimento || 0;
    el = document.getElementById('waStatVendas');
    if (el) el.textContent = stats.vendas || 0;
    el = document.getElementById('waStatDuvidas');
    if (el) el.textContent = stats.duvidas || 0;
    el = document.getElementById('waStatSugestoes');
    if (el) el.textContent = stats.sugestoes || 0;
    el = document.getElementById('waStatCorretores');
    if (el) el.textContent = stats.brokersInWa != null ? stats.brokersInWa : 0;
    el = document.getElementById('waStatLeadsOnly');
    if (el) el.textContent = stats.leadsOnlyInWa != null ? stats.leadsOnlyInWa : 0;
    var pendentes = stats.pendentesLeitura || 0;
    var navLink = document.querySelector('a[href="#whatsapp-leads"]');
    if (navLink) {
      var badge = navLink.querySelector('.wa-nav-badge');
      if (pendentes > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'wa-nav-badge';
          navLink.appendChild(badge);
        }
        badge.textContent = pendentes > 99 ? '99+' : pendentes;
        badge.style.display = '';
      } else if (badge) {
        badge.style.display = 'none';
      }
    }
  }).catch(function(err) {
    if (typeof console !== 'undefined' && console.warn) console.warn('Erro stats:', err);
  });
}

function waInboxListSignature(leads) {
  var a = [];
  for (var i = 0; i < leads.length; i++) {
    var l = leads[i];
    a.push(String(l.phone || l.id || '') + ':' + String(l.lastMessageAt || l.updatedAt || '') + ':' + String(l.adminUnreadCount || 0) + ':' + String(l.modo_humano ? 1 : 0) + ':' + String(l.revisarBot ? 1 : 0));
  }
  return a.join('|');
}

function waInboxChatSignature(messages, lead) {
  var n = messages ? messages.length : 0;
  var lastTs = '';
  var lastLen = 0;
  var lastMeta = '';
  if (n > 0) {
    var last = messages[n - 1];
    lastTs = String(last.timestamp || '');
    lastLen = String(last.content || '').length;
    lastMeta = String(last.whatsappMediaId || '') + '|' + String(last.attachmentType || '') + '|' + String(last.mimeType || '');
  }
  var leadPart = lead ? (String(lead.updatedAt || '') + '|' + String(lead.modo_humano ? 1 : 0) + '|' + String(lead.status || '')) : '';
  return leadPart + '||' + String(n) + '|' + lastTs + '|' + String(lastLen) + '|' + lastMeta;
}

function waInboxLoadList(quiet) {
  var listBody = document.getElementById('waInboxListBody');
  if (listBody && !quiet) listBody.innerHTML = '<div class="wa-loading">Carregando...</div>';

  var modo = document.getElementById('waFilterModo');
  var cat = document.getElementById('waFilterCategoria');
  var status = document.getElementById('waFilterStatus');
  var contactType = document.getElementById('waFilterContactType');
  var search = document.getElementById('waSearchInput');

  var q = '?action=list&limit=100';
  if (waInboxQuickFilter === 'pendentes') {
    q += '&unread=1';
  } else if (waInboxQuickFilter === 'corretores') {
    q += '&contact_type=brokers';
  } else if (waInboxQuickFilter === 'leads') {
    q += '&contact_type=leads';
  } else {
    if (modo && modo.value) q += '&modo_humano=' + (modo.value === 'humano' ? 'true' : 'false');
    if (cat && cat.value) q += '&categoria=' + encodeURIComponent(cat.value);
  }
  if (contactType && contactType.value && waInboxQuickFilter !== 'corretores' && waInboxQuickFilter !== 'leads') {
    q += '&contact_type=' + encodeURIComponent(contactType.value);
  }
  if (status && status.value) q += '&status=' + encodeURIComponent(status.value);
  if (search && search.value.trim()) q += '&search=' + encodeURIComponent(search.value.trim());

  waInboxApi('/chatbotInbox' + q).then(function(data) {
    var leads = data.leads || [];
    var sig = waInboxListSignature(leads);
    if (quiet && sig === waLastListSig) {
      return;
    }
    waLastListSig = sig;
    waLeadsData = leads;
    waInboxRenderList();
    if (!quiet) waInboxLoadStats();
  }).catch(function(err) {
    var errMsg = (err && err.message) ? err.message : 'Erro ao carregar.';
    if (listBody) {
      listBody.innerHTML = '<div class="wa-loading">' + errMsg.replace(/</g, '&lt;') +
        ' <button type="button" onclick="waInboxRefresh()">Tentar novamente</button></div>';
    }
    if (typeof console !== 'undefined' && console.error) console.error(err);
  });
}

function waInboxFilter() {
  waInboxQuickFilter = '';
  waInboxUpdateStatCardActive('');
  waInboxLoadList();
}

function waInboxUpdateStatCardActive(key) {
  var row = document.querySelector('.wa-stats-row');
  if (!row) return;
  var btns = row.querySelectorAll('[data-wa-stat]');
  var i;
  for (i = 0; i < btns.length; i++) {
    var b = btns[i];
    if (b.getAttribute('data-wa-stat') === key && key) {
      b.classList.add('wa-stat--active');
    } else {
      b.classList.remove('wa-stat--active');
    }
  }
}

function waInboxStatClick(key) {
  var modo = document.getElementById('waFilterModo');
  var cat = document.getElementById('waFilterCategoria');
  var status = document.getElementById('waFilterStatus');
  var contactType = document.getElementById('waFilterContactType');
  var search = document.getElementById('waSearchInput');
  waInboxQuickFilter = key === 'total' ? '' : key;
  if (modo) modo.value = '';
  if (cat) cat.value = '';
  if (status) status.value = '';
  if (contactType) contactType.value = '';
  if (search) search.value = '';
  if (key === 'humano' && modo) modo.value = 'humano';
  if (key === 'vendas' && cat) cat.value = 'vendas';
  if (key === 'duvidas' && cat) cat.value = 'duvidas';
  if (key === 'sugestoes' && cat) cat.value = 'sugestoes';
  if (key === 'corretores' && contactType) contactType.value = 'brokers';
  if (key === 'leads' && contactType) contactType.value = 'leads';
  waInboxUpdateStatCardActive(key === 'total' ? '' : key);
  waLastListSig = '';
  waInboxLoadList(false);
}

function waInboxRenderList() {
  var listBody = document.getElementById('waInboxListBody');
  if (!listBody) return;

  if (waLeadsData.length === 0) {
    listBody.innerHTML = '<div class="wa-loading">Nenhuma conversa encontrada.</div>';
    return;
  }

  var html = '';
  for (var i = 0; i < waLeadsData.length; i++) {
    var l = waLeadsData[i];
    var phone = normalizeWaPhone(l.phone || l.id || '');
    var name = l.name || 'Sem nome';
    var unread = (l.adminUnreadCount || 0) > 0;
    var active = phone === waInboxSelectedPhone;
    var cat = l.categoria || 'geral';
    var status = l.status || 'novo';
    var modoHumano = !!l.modo_humano;
    var revisarBot = !!l.revisarBot;
    var preview = l.lastActivityPreview || l.encaminhadoMotivo || l.notes || '';
    if (preview.length > 40) preview = preview.substring(0, 37) + '...';
    var minsFromLastLeadMsg = minutesSince(l.lastUserMessageAt || l.lastMessageAt || l.updatedAt);
    var slaLate = minsFromLastLeadMsg != null && minsFromLastLeadMsg > WA_SLA_FIRST_RESPONSE_MINUTES;
    var urgent = ((l.adminUnreadCount || 0) > 0 && slaLate) || l.urgencyLevel === 'alta' || !!l.needsHumanFollowup;
    var tempoLabel = formatRelativeMinutes(minsFromLastLeadMsg);
    var isBroker = !!l.isBroker;
    if (isBroker && l.brokerName) name = l.brokerName;

    html += '<div class="wa-inbox-item' + (active ? ' active' : '') + (unread ? ' unread' : '') + (isBroker ? ' wa-inbox-item--broker' : '') + (revisarBot && !modoHumano ? ' wa-item-revisar-bot' : '') + '" data-phone="' + escapeHtml(phone) + '" onclick="waInboxSelect(this.getAttribute(\'data-phone\'))">';
    html += '<div class="wa-inbox-item-avatar' + (isBroker ? ' wa-inbox-item-avatar--broker' : '') + '"><i class="' + (isBroker ? 'fas fa-user-tie' : 'fab fa-whatsapp') + '"></i></div>';
    html += '<div class="wa-inbox-item-info">';
    html += '<div class="wa-inbox-item-name">' + escapeHtml(name) + '</div>';
    html += '<div class="wa-inbox-item-preview">' + escapeHtml(preview || formatPhoneShort(phone)) + '</div>';
    html += '<div class="wa-inbox-item-badges">';
    if (unread) html += '<span class="wa-inbox-item-unread">' + (l.adminUnreadCount || 1) + '</span>';
    if (revisarBot && !modoHumano) {
      html += '<span class="wa-inbox-item-badge wa-bot-review-badge" title="Há mensagens no bot após atendimento humano — abra para revisar">Pós-bot</span>';
    }
    if (urgent) html += '<span class="wa-inbox-item-badge" style="background:#fee2e2;color:#991b1b;" title="Lead sem retorno dentro do SLA ou marcado como urgente">Urgente</span>';
    if (modoHumano) html += '<span class="wa-inbox-item-badge" style="background:#fef3c7;color:#92400e;">Humano</span>';
    if (isBroker) html += '<span class="wa-inbox-item-badge wa-badge-broker" title="Telefone cadastrado em Corretores">Corretor</span>';
    if (l.ultimaOrigem === 'anuncio') html += '<span class="wa-inbox-item-badge" style="background:#dbeafe;color:#1e40af;">Anúncio</span>';
    if (l.followUpExcluded) {
      html += '<span class="wa-inbox-item-badge" style="background:#f3f4f6;color:#4b5563;" title="Sem follow-up automático">Sem FU</span>';
    } else if (l.followUpStage && l.followUpStage !== 'completed') {
      html += '<span class="wa-inbox-item-badge" style="background:#ede9fe;color:#5b21b6;" title="Estágio follow-up">FU ' + escapeHtml(String(l.followUpStage)) + '</span>';
    }
    html += '<span class="wa-inbox-item-badge" style="background:#e2e8f0;">' + escapeHtml(cat) + '</span>';
    if (tempoLabel) html += '<span class="wa-inbox-item-badge" style="background:#ecfeff;color:#155e75;" title="Tempo desde a última mensagem do cliente">SLA: ' + escapeHtml(tempoLabel) + '</span>';
    html += '</div>';
    html += '</div></div>';
  }
  listBody.innerHTML = html;
}

function waInboxSelect(phone) {
  waInboxSelectedPhone = normalizeWaPhone(phone) || phone;
  waLastChatSig = '';
  waInboxRenderList();
  waInboxLoadChat(waInboxSelectedPhone, { quiet: false });
}

function waInboxLoadChat(phone, opts) {
  opts = opts || {};
  var quiet = !!opts.quiet;
  var emptyEl = document.getElementById('waInboxChatEmpty');
  var activeEl = document.getElementById('waInboxChatActive');
  if (!emptyEl || !activeEl) return;

  emptyEl.style.display = 'none';
  activeEl.style.display = 'flex';

  var containerPre = document.getElementById('waChatMessages');
  var distFromBottom = 0;
  var stickToBottom = true;
  if (containerPre && quiet) {
    distFromBottom = containerPre.scrollHeight - containerPre.scrollTop - containerPre.clientHeight;
    stickToBottom = distFromBottom < 120;
  }

  var phoneNorm = normalizeWaPhone(phone);
  waInboxApi('/chatbotInbox?action=conversation&phone=' + encodeURIComponent(phoneNorm || phone)).then(function(data) {
    var lead = data.lead || {};
    var messages = data.messages || [];

    var sig = waInboxChatSignature(messages, lead);
    if (quiet && normalizeWaPhone(phone) === normalizeWaPhone(waInboxSelectedPhone) && sig === waLastChatSig) {
      return;
    }
    waLastChatSig = sig;

    var chatName = lead.isBroker && lead.brokerName ? lead.brokerName : (lead.name || 'Sem nome');
    document.getElementById('waChatName').textContent = chatName;
    var chatHeader = document.querySelector('.wa-chat-header-info');
    if (chatHeader) {
      if (lead.isBroker) chatHeader.classList.add('wa-chat-header--broker');
      else chatHeader.classList.remove('wa-chat-header--broker');
    }
    var brokerTag = document.getElementById('waChatBrokerBadge');
    if (!brokerTag && chatHeader) {
      brokerTag = document.createElement('span');
      brokerTag.id = 'waChatBrokerBadge';
      brokerTag.className = 'wa-badge-broker wa-chat-broker-badge';
      brokerTag.textContent = 'Corretor';
      var phoneEl = document.getElementById('waChatPhone');
      if (phoneEl && phoneEl.parentNode) phoneEl.parentNode.insertBefore(brokerTag, phoneEl.nextSibling);
    }
    if (brokerTag) brokerTag.style.display = lead.isBroker ? 'inline-block' : 'none';
    document.getElementById('waChatPhone').textContent = formatPhone(lead.phone || phoneNorm || phone);
    document.getElementById('waChatCategoria').textContent = lead.categoria || 'geral';
    document.getElementById('waChatCategoria').className = 'wa-cat-badge';
    var catSel = document.getElementById('waChatCategoriaSelect');
    if (catSel) {
      catSel.value = lead.categoria || 'geral';
    }
    var statusVal = lead.status || 'novo';
    document.getElementById('waChatStatus').textContent = statusVal;
    var msgCountEl = document.getElementById('waChatMsgCount');
    var statusSelect = document.getElementById('waChatStatusSelect');
    if (statusSelect) {
      statusSelect.value = statusVal;
    }

    var waLink = 'https://wa.me/' + (lead.phone || phone).replace(/\D/g, '');
    var linkEl = document.getElementById('waChatWaLink');
    if (linkEl) { linkEl.href = waLink; }
    var link2 = document.getElementById('waChatWaLink2');
    if (link2) { link2.href = waLink; }

    var modoHumano = !!lead.modo_humano;
    var fuBadge = document.getElementById('waChatFollowUpBadge');
    var fuExcludeBtn = document.getElementById('waBtnFollowUpExclude');
    var fuResumeBtn = document.getElementById('waBtnFollowUpResume');
    if (fuBadge) {
      if (lead.followUpExcluded) {
        fuBadge.textContent = 'Follow-up: desligado (' + (lead.followUpExcludeReason || 'excluído') + ')';
        fuBadge.className = 'wa-followup-badge wa-followup-off';
      } else if (lead.followUpStage === 'completed') {
        fuBadge.textContent = 'Follow-up: sequência concluída';
        fuBadge.className = 'wa-followup-badge wa-followup-done';
      } else if (lead.followUpStage) {
        fuBadge.textContent = 'Follow-up: estágio ' + lead.followUpStage;
        fuBadge.className = 'wa-followup-badge wa-followup-on';
      } else if (lead.firstUserMessageAt || lead.lastUserMessageAt) {
        fuBadge.textContent = 'Follow-up: elegível (insiste se parar de responder)';
        fuBadge.className = 'wa-followup-badge wa-followup-on';
      } else {
        fuBadge.textContent = 'Follow-up: aguardando 1ª mensagem do cliente';
        fuBadge.className = 'wa-followup-badge';
      }
    }
    if (fuExcludeBtn) fuExcludeBtn.style.display = lead.followUpExcluded ? 'none' : 'inline-block';
    if (fuResumeBtn) fuResumeBtn.style.display = lead.followUpExcluded ? 'inline-block' : 'none';
    var assumirBtn = document.getElementById('waBtnAssumir');
    var devolverBtn = document.getElementById('waBtnDevolver');
    var sendBox = document.getElementById('waChatSendBox');
    var sendDisabled = document.getElementById('waChatSendDisabled');

    if (assumirBtn) assumirBtn.style.display = modoHumano ? 'none' : 'inline-block';
    if (devolverBtn) devolverBtn.style.display = modoHumano ? 'inline-block' : 'none';
    if (sendBox) sendBox.style.display = modoHumano ? 'flex' : 'none';
    if (sendDisabled) sendDisabled.style.display = modoHumano ? 'none' : 'block';

    var container = document.getElementById('waChatMessages');
    if (msgCountEl) {
      msgCountEl.textContent = messages.length ? '(' + messages.length + ' mensagens)' : '';
    }

    var parts = [];
    for (var i = 0; i < messages.length; i++) {
      var m = messages[i];
      var isUser = m.role === 'user';
      var isAdmin = m.source === 'admin';
      var bubbleClass = isUser ? 'user' : (isAdmin ? 'admin' : 'bot');
      var label = isUser ? 'Cliente' : (isAdmin ? 'Você (painel)' : 'Bia');
      var time = m.timestamp ? new Date(m.timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
      var rawContent = (m.content || '').replace(/\n/g, '\n');
      var content = escapeHtml(rawContent).replace(/\n/g, '<br>');
      var att = m.attachmentType;
      var attUrl = m.attachmentUrl;
      var attName = m.fileName;
      var waMediaId = m.whatsappMediaId;
      var mediaProxy = waMediaId
        ? (getWaInboxBaseUrl() + '/chatbotInboxWhatsAppMedia?mediaId=' + encodeURIComponent(String(waMediaId)))
        : '';
      var attHtml = '';
      if (att === 'audio' && waMediaId) {
        attHtml = '<div class="wa-chat-attachment wa-chat-audio">' +
          '<div class="wa-chat-audio-title"><i class="fas fa-microphone" aria-hidden="true"></i> Mensagem de áudio</div>' +
          '<audio controls preload="metadata" src="' + mediaProxy + '">Seu navegador não reproduz áudio.</audio></div>';
      } else if (att === 'image' && attUrl) {
        attHtml = '<div class="wa-chat-attachment"><img src="' + escapeHtml(attUrl) + '" alt="" /></div>';
      } else if (att === 'image' && waMediaId) {
        attHtml = '<div class="wa-chat-attachment"><img src="' + mediaProxy + '" alt="Imagem recebida" /></div>';
      } else if (att === 'video' && attUrl) {
        attHtml = '<div class="wa-chat-attachment"><video controls preload="metadata" src="' + escapeHtml(attUrl) + '"></video></div>';
      } else if (att === 'video' && waMediaId) {
        attHtml = '<div class="wa-chat-attachment"><video controls preload="metadata" src="' + mediaProxy + '"></video></div>';
      } else if (att === 'document' && waMediaId) {
        attHtml = '<div class="wa-chat-attachment wa-chat-doc-download">' +
          '<a href="' + mediaProxy + '" target="_blank" rel="noopener" class="wa-chat-doc-link"><i class="fas fa-file-download" aria-hidden="true"></i> ' +
          escapeHtml(attName || 'Abrir documento recebido') + '</a></div>';
      } else if (att === 'audio') {
        attHtml = '<div class="wa-chat-attachment wa-chat-attachment-file wa-chat-audio-fallback"><i class="fas fa-microphone" aria-hidden="true"></i> ' +
          '<span>Áudio recebido — reprodução no painel indisponível (sem ID da mídia). Ouça no celular do cliente ou peça outro áudio.</span></div>';
      } else if (att === 'image' || att === 'video' || att === 'document') {
        attHtml = '<div class="wa-chat-attachment wa-chat-attachment-file"><i class="fas fa-paperclip" aria-hidden="true"></i> ' +
          escapeHtml(attName || (att === 'document' ? 'Documento' : att)) + '</div>';
      }
      var deletable = !isUser && m.id;
      var extraBubbleClass = deletable ? ' wa-chat-bubble--deletable' : '';
      var delBtn = '';
      if (deletable) {
        delBtn = '<button type="button" class="wa-chat-delete-msg" data-msg-id="' + escapeHtml(String(m.id)) + '" onclick="waInboxDeleteMessageButton(event)" title="Remover só do painel (no WhatsApp do cliente continua)">' +
          '<i class="fas fa-trash-alt" aria-hidden="true"></i><span class="wa-sr-only">Apagar do histórico</span></button>';
      }
      parts.push(
        '<div class="wa-chat-bubble ' + bubbleClass + extraBubbleClass + '">' +
        delBtn +
        '<div class="wa-chat-bubble-label">' + escapeHtml(label) + '</div>' +
        attHtml +
        '<div>' + content + '</div>' +
        '<div class="wa-chat-bubble-time">' + escapeHtml(time) + '</div>' +
        '</div>'
      );
    }
    if (messages.length === 0) {
      parts.push('<div class="wa-loading">Nenhuma mensagem salva nesta conversa ainda.</div>');
    }
    container.innerHTML = parts.join('');
    if (!quiet || stickToBottom) {
      container.scrollTop = container.scrollHeight;
    } else {
      container.scrollTop = container.scrollHeight - container.clientHeight - distFromBottom;
      if (container.scrollTop < 0) container.scrollTop = 0;
    }

    waInboxMarkRead(phoneNorm || phone);
    waInboxStartPoll();

    var inputEl = document.getElementById('waChatInput');
    if (inputEl && !inputEl.dataset.waInboxBound) {
      inputEl.dataset.waInboxBound = '1';
      inputEl.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          waInboxSend();
        }
      });
    }
  }).catch(function(err) {
    if (typeof console !== 'undefined' && console.error) console.error(err);
    activeEl.querySelector('#waChatMessages').innerHTML = '<div class="wa-loading">Erro ao carregar conversa.</div>';
  });
}

function waInboxAssume() {
  if (!waInboxSelectedPhone) return;
  var adminUser = JSON.parse(localStorage.getItem('adminUser') || '{}');
  waInboxApi('/chatbotInboxAssume', { method: 'POST', body: { phone: waInboxSelectedPhone, adminEmail: adminUser.email || 'admin' } }).then(function() {
    if (typeof showMessage === 'function') showMessage('Conversa assumida. Agora você pode responder pelo painel.', 'success');
    waLastChatSig = '';
    waInboxLoadChat(waInboxSelectedPhone, { quiet: false });
    waInboxLoadList();
  }).catch(function(err) {
    if (typeof showMessage === 'function') showMessage('Erro ao assumir: ' + (err.message || 'Tente novamente.'), 'error');
  });
}

function waInboxReturnToBot() {
  if (!waInboxSelectedPhone) return;
  if (!confirm('Devolver esta conversa para o bot? O bot voltará a responder automaticamente.')) return;
  waInboxApi('/chatbotInboxReturnToBot', { method: 'POST', body: { phone: waInboxSelectedPhone } }).then(function() {
    if (typeof showMessage === 'function') showMessage('Conversa devolvida ao bot.', 'success');
    waLastChatSig = '';
    waInboxLoadChat(waInboxSelectedPhone, { quiet: false });
    waInboxLoadList();
  }).catch(function(err) {
    if (typeof showMessage === 'function') showMessage('Erro: ' + (err.message || 'Tente novamente.'), 'error');
  });
}

function waInboxSetFollowUp(excluded, reason) {
  if (!waInboxSelectedPhone) return;
  var adminUser = JSON.parse(localStorage.getItem('adminUser') || '{}');
  var msg = excluded
    ? 'Marcar este lead para NÃO receber follow-up automático (ex.: idade / banco)?'
    : 'Reativar follow-up automático para este lead?';
  if (!confirm(msg)) return;
  waInboxApi('/chatbotInboxFollowUp', {
    method: 'POST',
    body: {
      phone: waInboxSelectedPhone,
      excluded: !!excluded,
      reason: reason || (excluded ? 'manual_admin' : ''),
      by: adminUser.email || 'admin',
    },
  }).then(function() {
    if (typeof showMessage === 'function') {
      showMessage(excluded ? 'Follow-up desligado para este lead.' : 'Follow-up reativado.', 'success');
    }
    waLastChatSig = '';
    waInboxLoadChat(waInboxSelectedPhone, { quiet: false });
    waInboxLoadList(false);
  }).catch(function(err) {
    if (typeof showMessage === 'function') showMessage('Erro: ' + (err.message || ''), 'error');
  });
}

function waInboxPickFile() {
  var inp = document.getElementById('waChatFileInput');
  if (inp) {
    try {
      inp.setAttribute('multiple', 'multiple');
    } catch (eIgn) {}
    inp.click();
  }
}

function waInboxRefreshPendingFileUI() {
  var row = document.getElementById('waChatPendingFile');
  var arr = window.waInboxPendingFiles;
  if (!arr || arr.length === 0) {
    window.waInboxPendingFiles = [];
    if (row) {
      row.style.display = 'none';
      row.innerHTML = '';
    }
    return;
  }
  if (!row) return;
  row.style.display = 'block';
  var html = '';
  var j;
  for (j = 0; j < arr.length; j++) {
    html += '<span class="wa-pending-item">' +
      '<span class="wa-pending-name">' + escapeHtml(arr[j].name) + '</span>' +
      ' <button type="button" class="btn-small btn-secondary" onclick="waInboxRemovePending(' + j + ')">×</button>' +
      '</span>';
  }
  html += ' <button type="button" class="btn-small btn-secondary" onclick="waInboxClearAllFiles()">Remover todos</button>';
  row.innerHTML = html;
}

function waInboxFileChosen(fileInput) {
  if (!fileInput || !fileInput.files || !fileInput.files.length) return;
  if (!window.waInboxPendingFiles) window.waInboxPendingFiles = [];
  var n = fileInput.files.length;
  var list = [];
  var i;
  for (i = 0; i < n; i++) {
    list.push(fileInput.files[i]);
  }
  fileInput.value = '';
  for (i = 0; i < list.length; i++) {
    var f = list[i];
    if (!f) continue;
    var blob = f;
    if (typeof f.slice === 'function') {
      try {
        blob = f.slice(0, f.size, f.type || '');
      } catch (eSlice) {
        blob = f;
      }
    }
    window.waInboxPendingFiles.push({
      file: blob,
      name: f.name || ('arquivo-' + (window.waInboxPendingFiles.length + 1)),
      type: (f.type && String(f.type).length) ? f.type : 'application/octet-stream'
    });
  }
  waInboxRefreshPendingFileUI();
}

function waInboxRemovePending(index) {
  if (!window.waInboxPendingFiles || index < 0 || index >= window.waInboxPendingFiles.length) return;
  window.waInboxPendingFiles.splice(index, 1);
  waInboxRefreshPendingFileUI();
}

function waInboxClearAllFiles() {
  window.waInboxPendingFiles = [];
  waInboxRefreshPendingFileUI();
}

function waInboxSend() {
  if (!waInboxSelectedPhone) return;
  var input = document.getElementById('waChatInput');
  var text = (input && input.value || '').trim();
  var pendingList = window.waInboxPendingFiles || [];
  var hasFiles = pendingList.length > 0;
  if (!text && !hasFiles) return;

  var finish = function() {
    if (input) input.disabled = false;
  };

  if (hasFiles) {
    if (!window.FileReader) {
      if (typeof showMessage === 'function') showMessage('Seu navegador não suporta anexos por aqui.', 'error');
      return;
    }
    var snapshot = [];
    var sx;
    for (sx = 0; sx < window.waInboxPendingFiles.length; sx++) {
      snapshot.push(window.waInboxPendingFiles[sx]);
    }
    if (snapshot.length === 0) return;

    if (input) input.disabled = true;
    var btnSend = document.getElementById('waBtnSend');
    if (btnSend) btnSend.disabled = true;

    var encodedParts = [];
    var readIndex = 0;

    function failRead(pendName) {
      if (typeof showMessage === 'function') showMessage('Erro ao ler: ' + escapeHtml(pendName || 'arquivo'), 'error');
      if (btnSend) btnSend.disabled = false;
      finish();
    }

    function readNext() {
      if (readIndex >= snapshot.length) {
        postNext(0);
        return;
      }
      var pending = snapshot[readIndex];
      var reader = new FileReader();
      reader.onerror = function() {
        failRead(pending.name);
      };
      reader.onloadend = function() {
        var result = reader.result;
        if (!result || typeof result !== 'string') {
          failRead(pending.name);
          return;
        }
        var comma = result.indexOf(',');
        encodedParts.push({
          base64: comma >= 0 ? result.substring(comma + 1) : result,
          name: pending.name,
          type: pending.type
        });
        readIndex++;
        readNext();
      };
      reader.readAsDataURL(pending.file);
    }

    function postNext(pi) {
      if (pi >= encodedParts.length) {
        if (input) input.value = '';
        waInboxClearAllFiles();
        waLastChatSig = '';
        waInboxLoadChat(waInboxSelectedPhone, { quiet: false });
        waInboxLoadList(true);
        if (btnSend) btnSend.disabled = false;
        finish();
        return;
      }
      var part = encodedParts[pi];
      var caption = pi === 0 ? text : '';
      waInboxApi('/chatbotInboxSend', {
        method: 'POST',
        body: {
          phone: waInboxSelectedPhone,
          text: caption,
          mediaBase64: part.base64,
          mediaMimeType: part.type,
          mediaFileName: part.name
        }
      }).then(function() {
        postNext(pi + 1);
      }).catch(function(err) {
        if (typeof showMessage === 'function') {
          showMessage('Erro ao enviar ' + part.name + ': ' + (err.message || 'Tente novamente.'), 'error');
        }
        if (btnSend) btnSend.disabled = false;
        finish();
      });
    }

    readNext();
    return;
  }

  if (input) {
    input.value = '';
    input.disabled = true;
  }

  waInboxApi('/chatbotInboxSend', { method: 'POST', body: { phone: waInboxSelectedPhone, text: text } }).then(function() {
    waLastChatSig = '';
    waInboxLoadChat(waInboxSelectedPhone, { quiet: false });
  }).catch(function(err) {
    if (typeof showMessage === 'function') showMessage('Erro ao enviar: ' + (err.message || 'Tente novamente.'), 'error');
  }).then(finish);
}

function waInboxMarkRead(phone) {
  if (!phone) return;
  waInboxApi('/chatbotInboxMarkRead', { method: 'POST', body: { phone: phone } }).catch(function() {});
}

function waInboxDeleteMessageButton(ev) {
  if (!ev || !ev.currentTarget) return;
  if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
  var id = ev.currentTarget.getAttribute('data-msg-id');
  if (!id || !waInboxSelectedPhone) return;
  var msg = 'Remover esta mensagem apenas do histórico deste painel?\n\n' +
    'No WhatsApp do cliente ela continua visível — a API oficial da Meta não permite apagar mensagem já enviada no aplicativo.';
  if (!confirm(msg)) return;
  waInboxApi('/chatbotInboxDeleteMessage', { method: 'POST', body: { phone: waInboxSelectedPhone, messageId: id } }).then(function() {
    waLastChatSig = '';
    waLastListSig = '';
    waInboxLoadChat(waInboxSelectedPhone, { quiet: false });
    waInboxLoadList(true);
    if (typeof showMessage === 'function') showMessage('Mensagem removida do histórico do painel.', 'success');
  }).catch(function(err) {
    if (typeof showMessage === 'function') showMessage(err.message || 'Erro ao remover.', 'error');
  });
}

function waInboxStartPoll() {
  if (!window.waInboxSectionActive) return;
  if (waInboxPollTimer) clearInterval(waInboxPollTimer);
  waInboxPollTimer = setInterval(function() {
    if (!window.waInboxSectionActive) return;
    waInboxLoadStats();
    if (waInboxSelectedPhone) {
      waInboxLoadList(true);
      waInboxLoadChat(waInboxSelectedPhone, { quiet: true });
    }
  }, waInboxPollInterval);
}

function escapeHtml(s) {
  if (!s) return '';
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function formatPhone(phone) {
  if (!phone) return '—';
  var clean = String(phone).replace(/\D/g, '');
  if (clean.length >= 12) return '+' + clean.substring(0, 2) + ' (' + clean.substring(2, 4) + ') ' + clean.substring(4, 9) + '-' + clean.substring(9);
  return phone;
}

function formatPhoneShort(phone) {
  if (!phone) return '';
  var clean = String(phone).replace(/\D/g, '');
  if (clean.length >= 10) return '(' + clean.slice(-11, -9) + ') ' + clean.slice(-9, -4) + '-' + clean.slice(-4);
  return phone;
}

/* Compatibilidade: manter funções antigas para admin.js */
function loadWhatsAppLeads() {
  waInboxRefresh();
}

function filterWALeads() {
  waInboxFilter();
}

function showLeadDetail(phone) {
  waInboxSelect(phone);
}

function closeLeadDetail() {
  waInboxSelectedPhone = null;
  var emptyEl = document.getElementById('waInboxChatEmpty');
  var activeEl = document.getElementById('waInboxChatActive');
  if (emptyEl) emptyEl.style.display = 'flex';
  if (activeEl) activeEl.style.display = 'none';
  waInboxRenderList();
  if (waInboxPollTimer) { clearInterval(waInboxPollTimer); waInboxPollTimer = null; }
}

function waInboxUpdateStatusFromSelect() {
  var sel = document.getElementById('waChatStatusSelect');
  if (sel && waInboxSelectedPhone) updateLeadStatus(waInboxSelectedPhone, sel.value);
}

function waInboxUpdateCategoryFromSelect() {
  var sel = document.getElementById('waChatCategoriaSelect');
  if (!sel || !waInboxSelectedPhone) return;
  var v = sel.value;
  waInboxApi('/chatbotInboxUpdateCategory', { method: 'POST', body: { phone: waInboxSelectedPhone, categoria: v } }).then(function() {
    if (typeof showMessage === 'function') showMessage('Categoria atualizada.', 'success');
    waLastChatSig = '';
    waInboxLoadChat(waInboxSelectedPhone, { quiet: false });
    waInboxLoadList();
  }).catch(function() {
    if (typeof showMessage === 'function') showMessage('Erro ao atualizar categoria.', 'error');
  });
}

function updateLeadStatus(phone, newStatus) {
  if (!phone || !newStatus) return;
  waInboxApi('/chatbotInboxUpdateStatus', { method: 'POST', body: { phone: phone, status: newStatus } }).then(function() {
    if (typeof showMessage === 'function') showMessage('Status atualizado.', 'success');
    waLastChatSig = '';
    waInboxLoadChat(phone, { quiet: false });
    waInboxLoadList();
  }).catch(function(err) {
    if (typeof showMessage === 'function') showMessage('Erro ao atualizar status.', 'error');
  });
}

document.addEventListener('DOMContentLoaded', function() {
  var section = document.getElementById('whatsapp-leads');
  var main = document.querySelector('.admin-main');
  if (section && main) {
    var wasSectionActive = false;
    var obs = new MutationObserver(function() {
      var active = section.classList.contains('active');
      window.waInboxSectionActive = active;
      if (active && !wasSectionActive) {
        waInboxRefresh();
        if (waInboxSelectedPhone) waInboxStartPoll();
      }
      if (!active && waInboxPollTimer) {
        clearInterval(waInboxPollTimer);
        waInboxPollTimer = null;
      }
      wasSectionActive = active;
    });
    obs.observe(main, { subtree: true, attributes: true, attributeFilter: ['class'] });
  }
});
