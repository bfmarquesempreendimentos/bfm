let waLeadsData = [];

async function loadWhatsAppLeads() {
  try {
    const db = firebase.firestore();

    const statsSnap = await db.collection('chatbot_leads').get();
    const stats = { total: 0, novo: 0, qualificado: 0, agendado: 0, convertido: 0, encaminhado: 0 };
    const leads = [];

    statsSnap.forEach(doc => {
      const data = { id: doc.id, ...doc.data() };
      leads.push(data);
      stats.total++;
      const s = data.status || 'novo';
      if (stats[s] !== undefined) stats[s]++;
    });

    waLeadsData = leads.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    document.getElementById('waLeadsTotal').textContent = stats.total;
    document.getElementById('waLeadsNovo').textContent = stats.novo;
    document.getElementById('waLeadsQualificado').textContent = stats.qualificado;
    document.getElementById('waLeadsAgendado').textContent = stats.agendado;

    renderWALeadsTable(waLeadsData);
  } catch (err) {
    console.error('Erro ao carregar leads WhatsApp:', err);
    document.getElementById('waLeadsTableBody').innerHTML =
      '<tr><td colspan="7" class="loading-msg">Erro ao carregar leads</td></tr>';
  }
}

function filterWALeads() {
  const status = document.getElementById('waFilterStatus').value;
  const search = document.getElementById('waSearchInput').value.toLowerCase();

  let filtered = waLeadsData;
  if (status) filtered = filtered.filter(l => l.status === status);
  if (search) {
    filtered = filtered.filter(l =>
      (l.name || '').toLowerCase().includes(search) ||
      (l.phone || '').includes(search)
    );
  }
  renderWALeadsTable(filtered);
}

function renderWALeadsTable(leads) {
  const tbody = document.getElementById('waLeadsTableBody');

  if (!leads.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading-msg">Nenhum lead encontrado</td></tr>';
    return;
  }

  const propertyNames = {
    1: 'Porto Novo', 2: 'Itaúna', 3: 'Amendoeiras', 4: 'Laranjal',
    5: 'Apolo', 6: 'Coelho', 7: 'Caçador', 8: 'Luxo Maricá'
  };

  const statusColors = {
    novo: '#3498db',
    qualificado: '#f39c12',
    agendado: '#e74c3c',
    convertido: '#27ae60',
    encaminhado: '#9b59b6',
  };

  tbody.innerHTML = leads.map(lead => {
    const props = (lead.interestedProperties || [])
      .map(id => propertyNames[id] || `#${id}`)
      .join(', ') || '—';

    const income = lead.income
      ? `R$ ${Number(lead.income).toLocaleString('pt-BR')}`
      : '—';

    const date = lead.createdAt
      ? new Date(lead.createdAt).toLocaleDateString('pt-BR')
      : '—';

    const status = lead.status || 'novo';
    const color = statusColors[status] || '#999';

    const phone = lead.phone || '';
    const waLink = `https://wa.me/${phone}`;

    return `<tr>
      <td><strong>${lead.name || 'Sem nome'}</strong></td>
      <td><a href="${waLink}" target="_blank" rel="noopener" title="Abrir WhatsApp">${formatPhone(phone)}</a></td>
      <td>${income}</td>
      <td>${props}</td>
      <td><span class="wa-status-badge" style="background:${color}">${status}</span></td>
      <td>${date}</td>
      <td class="wa-actions-cell">
        <button class="btn-small btn-info" onclick="showLeadDetail('${phone}')" title="Ver detalhes">
          <i class="fas fa-eye"></i>
        </button>
        <a href="${waLink}" target="_blank" rel="noopener" class="btn-small btn-whatsapp" title="Responder no WhatsApp">
          <i class="fab fa-whatsapp"></i>
        </a>
      </td>
    </tr>`;
  }).join('');
}

function formatPhone(phone) {
  if (!phone) return '—';
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 13) {
    return `+${clean.slice(0, 2)} (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
  }
  return phone;
}

async function showLeadDetail(phone) {
  const lead = waLeadsData.find(l => l.phone === phone || l.id === phone);
  if (!lead) return;

  const modal = document.getElementById('waLeadDetailModal');
  const body = document.getElementById('waLeadDetailBody');
  document.getElementById('waLeadDetailTitle').textContent = lead.name || 'Lead sem nome';

  let html = `
    <div class="wa-lead-info">
      <div class="wa-lead-info-row"><strong>Telefone:</strong> ${formatPhone(lead.phone)}</div>
      <div class="wa-lead-info-row"><strong>Nome:</strong> ${lead.name || '—'}</div>
      <div class="wa-lead-info-row"><strong>Renda:</strong> ${lead.income ? `R$ ${Number(lead.income).toLocaleString('pt-BR')}` : '—'}</div>
      <div class="wa-lead-info-row"><strong>CPF:</strong> ${lead.cpf || '—'}</div>
      <div class="wa-lead-info-row"><strong>Email:</strong> ${lead.email || '—'}</div>
      <div class="wa-lead-info-row"><strong>Status:</strong> ${lead.status || 'novo'}</div>
      <div class="wa-lead-info-row"><strong>Responsável:</strong> ${lead.assignedTo || 'Davi'}</div>
      <div class="wa-lead-info-row"><strong>Data de criação:</strong> ${lead.createdAt ? new Date(lead.createdAt).toLocaleString('pt-BR') : '—'}</div>
    </div>
  `;

  if (lead.scheduledVisit) {
    html += `
      <div class="wa-lead-visit">
        <h4>📅 Visita Agendada</h4>
        <p>Data: ${lead.scheduledVisit.date}</p>
      </div>
    `;
  }

  html += '<div class="wa-lead-conversation"><h4>💬 Histórico de Conversa</h4>';

  try {
    const db = firebase.firestore();
    const convSnap = await db.collection('chatbot_conversations')
      .doc(phone)
      .collection('messages')
      .orderBy('timestamp', 'asc')
      .limit(50)
      .get();

    if (convSnap.empty) {
      html += '<p class="no-messages">Nenhuma mensagem registrada</p>';
    } else {
      html += '<div class="wa-chat-messages">';
      convSnap.forEach(doc => {
        const msg = doc.data();
        const isUser = msg.role === 'user';
        const time = msg.timestamp ? new Date(msg.timestamp).toLocaleString('pt-BR') : '';
        html += `
          <div class="wa-chat-bubble ${isUser ? 'wa-bubble-user' : 'wa-bubble-bot'}">
            <div class="wa-bubble-text">${escapeHtml(msg.content || '')}</div>
            <div class="wa-bubble-time">${time}</div>
          </div>
        `;
      });
      html += '</div>';
    }
  } catch (err) {
    html += '<p class="no-messages">Erro ao carregar histórico</p>';
  }

  html += '</div>';
  html += `
    <div class="wa-lead-actions-footer">
      <a href="https://wa.me/${lead.phone}" target="_blank" class="btn btn-primary" style="background:#25d366;">
        <i class="fab fa-whatsapp"></i> Responder no WhatsApp
      </a>
      <select id="waLeadStatusUpdate" onchange="updateLeadStatus('${lead.phone}', this.value)">
        <option value="">Alterar status...</option>
        <option value="novo">Novo</option>
        <option value="qualificado">Qualificado</option>
        <option value="agendado">Agendado</option>
        <option value="convertido">Convertido</option>
      </select>
    </div>
  `;

  body.innerHTML = html;
  modal.style.display = 'flex';
}

function closeLeadDetail() {
  document.getElementById('waLeadDetailModal').style.display = 'none';
}

async function updateLeadStatus(phone, newStatus) {
  if (!newStatus) return;
  try {
    const db = firebase.firestore();
    await db.collection('chatbot_leads').doc(phone).update({
      status: newStatus,
      updatedAt: new Date().toISOString(),
    });
    await loadWhatsAppLeads();
    closeLeadDetail();
  } catch (err) {
    console.error('Erro ao atualizar status:', err);
    alert('Erro ao atualizar status do lead');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML.replace(/\n/g, '<br>');
}

document.addEventListener('DOMContentLoaded', () => {
  const observer = new MutationObserver(() => {
    const section = document.getElementById('whatsapp-leads');
    if (section && section.classList.contains('active') && waLeadsData.length === 0) {
      loadWhatsAppLeads();
    }
  });

  const main = document.querySelector('.admin-main');
  if (main) observer.observe(main, { subtree: true, attributes: true, attributeFilter: ['class'] });
});
