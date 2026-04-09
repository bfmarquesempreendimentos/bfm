/* Painel de Atendimento WhatsApp - Inbox e gestão de contatos */

var waInboxBaseUrl = 'https://us-central1-site-interativo-b-f-marques.cloudfunctions.net';
var waLeadsData = [];
var waInboxSelectedPhone = null;
var waInboxPollTimer = null;
var waInboxPollInterval = 15000;

function waInboxApi(path, options) {
  options = options || {};
  var url = waInboxBaseUrl + path;
  var method = (options.method || 'GET').toUpperCase();
  var body = options.body;
  var headers = { 'Content-Type': 'application/json' };

  return fetch(url, {
    method: method,
    headers: headers,
    body: method === 'POST' && body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
    credentials: 'omit'
  }).then(function(res) {
    if (!res.ok) throw new Error('Erro ' + res.status);
    return res.json();
  });
}

function waInboxRefresh() {
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

function waInboxLoadList() {
  var listBody = document.getElementById('waInboxListBody');
  if (listBody) listBody.innerHTML = '<div class="wa-loading">Carregando...</div>';

  var modo = document.getElementById('waFilterModo');
  var cat = document.getElementById('waFilterCategoria');
  var status = document.getElementById('waFilterStatus');
  var search = document.getElementById('waSearchInput');

  var q = '?action=list&limit=100';
  if (modo && modo.value) q += '&modo_humano=' + (modo.value === 'humano' ? 'true' : 'false');
  if (cat && cat.value) q += '&categoria=' + encodeURIComponent(cat.value);
  if (status && status.value) q += '&status=' + encodeURIComponent(status.value);
  if (search && search.value.trim()) q += '&search=' + encodeURIComponent(search.value.trim());

  waInboxApi('/chatbotInbox' + q).then(function(data) {
    waLeadsData = data.leads || [];
    waInboxRenderList();
    waInboxLoadStats();
  }).catch(function(err) {
    if (listBody) listBody.innerHTML = '<div class="wa-loading">Erro ao carregar. <button type="button" onclick="waInboxRefresh()">Tentar novamente</button></div>';
    if (typeof console !== 'undefined' && console.error) console.error(err);
  });
}

function waInboxFilter() {
  waInboxLoadList();
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
    var phone = l.phone || l.id || '';
    var name = l.name || 'Sem nome';
    var unread = (l.adminUnreadCount || 0) > 0;
    var active = phone === waInboxSelectedPhone;
    var cat = l.categoria || 'geral';
    var status = l.status || 'novo';
    var modoHumano = !!l.modo_humano;
    var preview = l.lastActivityPreview || l.encaminhadoMotivo || l.notes || '';
    if (preview.length > 40) preview = preview.substring(0, 37) + '...';

    html += '<div class="wa-inbox-item' + (active ? ' active' : '') + (unread ? ' unread' : '') + '" data-phone="' + escapeHtml(phone) + '" onclick="waInboxSelect(this.getAttribute(\'data-phone\'))">';
    html += '<div class="wa-inbox-item-avatar"><i class="fab fa-whatsapp"></i></div>';
    html += '<div class="wa-inbox-item-info">';
    html += '<div class="wa-inbox-item-name">' + escapeHtml(name) + '</div>';
    html += '<div class="wa-inbox-item-preview">' + escapeHtml(preview || formatPhoneShort(phone)) + '</div>';
    html += '<div class="wa-inbox-item-badges">';
    if (unread) html += '<span class="wa-inbox-item-unread">' + (l.adminUnreadCount || 1) + '</span>';
    if (modoHumano) html += '<span class="wa-inbox-item-badge" style="background:#fef3c7;color:#92400e;">Humano</span>';
    if (l.ultimaOrigem === 'anuncio') html += '<span class="wa-inbox-item-badge" style="background:#dbeafe;color:#1e40af;">Anúncio</span>';
    html += '<span class="wa-inbox-item-badge" style="background:#e2e8f0;">' + escapeHtml(cat) + '</span>';
    html += '</div>';
    html += '</div></div>';
  }
  listBody.innerHTML = html;
}

function waInboxSelect(phone) {
  waInboxSelectedPhone = phone;
  waInboxRenderList();
  waInboxLoadChat(phone);
}

function waInboxLoadChat(phone) {
  var emptyEl = document.getElementById('waInboxChatEmpty');
  var activeEl = document.getElementById('waInboxChatActive');
  if (!emptyEl || !activeEl) return;

  emptyEl.style.display = 'none';
  activeEl.style.display = 'flex';

  waInboxApi('/chatbotInbox?action=conversation&phone=' + encodeURIComponent(phone)).then(function(data) {
    var lead = data.lead || {};
    var messages = data.messages || [];

    document.getElementById('waChatName').textContent = lead.name || 'Sem nome';
    document.getElementById('waChatPhone').textContent = formatPhone(lead.phone || phone);
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
      parts.push(
        '<div class="wa-chat-bubble ' + bubbleClass + '">' +
        '<div class="wa-chat-bubble-label">' + escapeHtml(label) + '</div>' +
        '<div>' + content + '</div>' +
        '<div class="wa-chat-bubble-time">' + escapeHtml(time) + '</div>' +
        '</div>'
      );
    }
    if (messages.length === 0) {
      parts.push('<div class="wa-loading">Nenhuma mensagem salva nesta conversa ainda.</div>');
    }
    container.innerHTML = parts.join('');
    container.scrollTop = container.scrollHeight;

    waInboxMarkRead(phone);
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
    waInboxLoadChat(waInboxSelectedPhone);
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
    waInboxLoadChat(waInboxSelectedPhone);
    waInboxLoadList();
  }).catch(function(err) {
    if (typeof showMessage === 'function') showMessage('Erro: ' + (err.message || 'Tente novamente.'), 'error');
  });
}

function waInboxSend() {
  if (!waInboxSelectedPhone) return;
  var input = document.getElementById('waChatInput');
  var text = (input && input.value || '').trim();
  if (!text) return;

  input.value = '';
  input.disabled = true;

  waInboxApi('/chatbotInboxSend', { method: 'POST', body: { phone: waInboxSelectedPhone, text: text } }).then(function() {
    waInboxLoadChat(waInboxSelectedPhone);
  }).catch(function(err) {
    if (typeof showMessage === 'function') showMessage('Erro ao enviar: ' + (err.message || 'Tente novamente.'), 'error');
  }).then(function() {
    if (input) input.disabled = false;
  });
}

function waInboxMarkRead(phone) {
  if (!phone) return;
  waInboxApi('/chatbotInboxMarkRead', { method: 'POST', body: { phone: phone } }).catch(function() {});
}

function waInboxStartPoll() {
  if (waInboxPollTimer) clearInterval(waInboxPollTimer);
  waInboxPollTimer = setInterval(function() {
    if (waInboxSelectedPhone) {
      waInboxLoadList();
      waInboxLoadChat(waInboxSelectedPhone);
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
    waInboxLoadChat(waInboxSelectedPhone);
    waInboxLoadList();
  }).catch(function() {
    if (typeof showMessage === 'function') showMessage('Erro ao atualizar categoria.', 'error');
  });
}

function updateLeadStatus(phone, newStatus) {
  if (!phone || !newStatus) return;
  waInboxApi('/chatbotInboxUpdateStatus', { method: 'POST', body: { phone: phone, status: newStatus } }).then(function() {
    if (typeof showMessage === 'function') showMessage('Status atualizado.', 'success');
    waInboxLoadChat(phone);
    waInboxLoadList();
  }).catch(function(err) {
    if (typeof showMessage === 'function') showMessage('Erro ao atualizar status.', 'error');
  });
}

document.addEventListener('DOMContentLoaded', function() {
  var section = document.getElementById('whatsapp-leads');
  var main = document.querySelector('.admin-main');
  if (section && main) {
    var obs = new MutationObserver(function() {
      if (section.classList.contains('active')) {
        waInboxRefresh();
      }
    });
    obs.observe(main, { subtree: true, attributes: true, attributeFilter: ['class'] });
  }
});
