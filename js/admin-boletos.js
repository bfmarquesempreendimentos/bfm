// Admin — Boletos de clientes (parcelas / financiamento)

function adminBoletosEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function adminBoletosStatusLabel(st) {
  if (st === 'pago') return 'Pago';
  if (st === 'vencido') return 'Vencido';
  return 'Pendente';
}

function adminBoletosStatusClass(st) {
  if (st === 'pago') return 'status-completed';
  if (st === 'vencido') return 'status-cancelled';
  return 'status-pending';
}

async function loadAdminBoletos() {
  var tbody = document.getElementById('adminBoletosTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">Carregando...</td></tr>';
  var filterEl = document.getElementById('adminBoletosFilterEmail');
  var filterEmail = filterEl ? (filterEl.value || '').trim().toLowerCase() : '';
  try {
    var payload = { action: 'list' };
    if (filterEmail) payload.clientEmail = filterEmail;
    var data = await adminPostJson('/adminBoletosMutate', payload);
    var rows = (data && data.boletos) ? data.boletos : [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">Nenhum boleto cadastrado.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function(b) {
      var st = b.status || 'pendente';
      var actions = '';
      if (st !== 'pago') {
        actions += '<button type="button" class="btn-action btn-edit" onclick="markAdminBoletoPaid(\'' + adminBoletosEscape(b.id).replace(/'/g, "\\'") + '\')" title="Marcar pago"><i class="fas fa-check"></i></button> ';
      }
      actions += '<button type="button" class="btn-action btn-delete" onclick="deleteAdminBoleto(\'' + adminBoletosEscape(b.id).replace(/'/g, "\\'") + '\')" title="Excluir"><i class="fas fa-trash"></i></button>';
      return '<tr>' +
        '<td>' + adminBoletosEscape(b.clientEmail) + '</td>' +
        '<td>' + adminBoletosEscape(b.parcela || '—') + '</td>' +
        '<td>' + adminBoletosEscape(b.propertyTitle || '—') + '</td>' +
        '<td>R$ ' + Number(b.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</td>' +
        '<td>' + adminBoletosEscape(typeof formatDate === 'function' ? formatDate(b.vencimento) : b.vencimento) + '</td>' +
        '<td><span class="status-badge ' + adminBoletosStatusClass(st) + '">' + adminBoletosStatusLabel(st) + '</span></td>' +
        '<td>' + actions + '</td></tr>';
    }).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#c0392b;">' +
      adminBoletosEscape(err.message || 'Erro ao carregar') + '</td></tr>';
  }
}

async function submitAdminBoletoForm(e) {
  if (e && e.preventDefault) e.preventDefault();
  var email = (document.getElementById('adminBoletoEmail') && document.getElementById('adminBoletoEmail').value || '').trim().toLowerCase();
  var valorStr = (document.getElementById('adminBoletoValor') && document.getElementById('adminBoletoValor').value || '').replace(/\./g, '').replace(',', '.');
  var valor = parseFloat(valorStr);
  var venc = document.getElementById('adminBoletoVencimento') && document.getElementById('adminBoletoVencimento').value;
  if (!email || !venc || !valor || isNaN(valor)) {
    if (typeof showMessage === 'function') showMessage('Preencha email, valor e vencimento.', 'error');
    return;
  }
  try {
    await adminPostJson('/adminBoletosMutate', {
      action: 'create',
      clientEmail: email,
      valor: valor,
      vencimento: venc,
      parcela: (document.getElementById('adminBoletoParcela') && document.getElementById('adminBoletoParcela').value) || '',
      propertyTitle: (document.getElementById('adminBoletoImovel') && document.getElementById('adminBoletoImovel').value) || '',
      comprovanteUrl: (document.getElementById('adminBoletoComprovante') && document.getElementById('adminBoletoComprovante').value) || '',
    });
    if (typeof showMessage === 'function') showMessage('Boleto cadastrado.', 'success');
    var form = document.getElementById('adminBoletoForm');
    if (form) form.reset();
    var filterEl = document.getElementById('adminBoletosFilterEmail');
    if (filterEl && !filterEl.value) filterEl.value = email;
    loadAdminBoletos();
  } catch (err) {
    if (typeof showMessage === 'function') showMessage(err.message || 'Erro ao salvar.', 'error');
  }
}

async function markAdminBoletoPaid(boletoId) {
  if (!boletoId) return;
  var url = prompt('URL do comprovante (opcional):', '');
  if (url === null) return;
  try {
    await adminPostJson('/adminBoletosMutate', {
      action: 'markPaid',
      boletoId: boletoId,
      comprovanteUrl: url || '',
    });
    if (typeof showMessage === 'function') showMessage('Boleto marcado como pago.', 'success');
    loadAdminBoletos();
  } catch (err) {
    if (typeof showMessage === 'function') showMessage(err.message || 'Erro.', 'error');
  }
}

async function deleteAdminBoleto(boletoId) {
  if (!boletoId || !confirm('Excluir este boleto?')) return;
  try {
    await adminPostJson('/adminBoletosMutate', { action: 'delete', boletoId: boletoId });
    if (typeof showMessage === 'function') showMessage('Boleto excluído.', 'success');
    loadAdminBoletos();
  } catch (err) {
    if (typeof showMessage === 'function') showMessage(err.message || 'Erro.', 'error');
  }
}

async function submitAdminTimelineForm(e) {
  if (e && e.preventDefault) e.preventDefault();
  var email = (document.getElementById('adminTimelineEmail') && document.getElementById('adminTimelineEmail').value || '').trim().toLowerCase();
  var title = (document.getElementById('adminTimelineTitle') && document.getElementById('adminTimelineTitle').value || '').trim();
  if (!email || !title) {
    if (typeof showMessage === 'function') showMessage('Email e título são obrigatórios.', 'error');
    return;
  }
  try {
    await adminPostJson('/adminTimelineEvent', {
      clientEmail: email,
      title: title,
      description: (document.getElementById('adminTimelineDesc') && document.getElementById('adminTimelineDesc').value) || '',
      type: (document.getElementById('adminTimelineType') && document.getElementById('adminTimelineType').value) || 'evento',
    });
    if (typeof showMessage === 'function') showMessage('Evento adicionado à timeline do cliente.', 'success');
    var form = document.getElementById('adminTimelineForm');
    if (form) form.reset();
  } catch (err) {
    if (typeof showMessage === 'function') showMessage(err.message || 'Erro.', 'error');
  }
}
