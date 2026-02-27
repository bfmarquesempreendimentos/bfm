// Admin - Gestão de Solicitações de Reparo

function getAdminRepairs() {
    return JSON.parse(localStorage.getItem('repairRequests') || '[]');
}

async function loadAdminRepairs() {
    var section = document.getElementById('repairs');
    if (!section) return;
    var tbody = document.getElementById('adminRepairsTableBody');
    if (!tbody) return;
    var statusEl = document.getElementById('repairSyncStatus');
    if (statusEl) { statusEl.style.display = 'none'; statusEl.className = 'repair-sync-status'; statusEl.textContent = ''; }

    // Cloud Function como FONTE PRIMÁRIA (evita falhas do Firestore SDK no Mac/Safari); Firestore como fallback
    var fromFirestore = [];
    var getRepairsUrl = 'https://us-central1-site-interativo-b-f-marques.cloudfunctions.net/getRepairs?t=' + Date.now();
    if (typeof fetch === 'function') {
        try {
            var resp = await fetch(getRepairsUrl);
            if (resp.ok) {
                var data = await resp.json();
                if (data && Array.isArray(data) && data.length > 0) fromFirestore = data;
            }
        } catch (e1) {
            console.warn('Cloud Function getRepairs falhou:', e1);
        }
    }
    if (fromFirestore.length === 0 && typeof getAllRepairRequestsFromFirestore === 'function' && typeof firebaseAvailable === 'function' && firebaseAvailable()) {
        try {
            fromFirestore = await getAllRepairRequestsFromFirestore();
        } catch (e2) {
            console.warn('Firestore direto falhou:', e2);
        }
    }
    try {
        var local = getAdminRepairs();
            var byId = {};
            for (var j = 0; j < fromFirestore.length; j++) {
                var f = fromFirestore[j];
                var fid = f.id !== undefined ? f.id : (f.firestoreId || f.id);
                if (fid === undefined || fid === null) continue;
                var existing = byId[fid];
                if (!existing || (f.updatedAt && (!existing.updatedAt || new Date(f.updatedAt) > new Date(existing.updatedAt)))) {
                    byId[fid] = f;
                }
            }
            for (var i = 0; i < local.length; i++) {
                var lid = local[i].id;
                if (lid !== undefined && lid !== null && !byId[lid]) {
                    byId[lid] = local[i];
                }
            }
            local = [];
            for (var k in byId) { if (byId.hasOwnProperty(k)) local.push(byId[k]); }
            localStorage.setItem('repairRequests', JSON.stringify(local));
            if (statusEl) {
                statusEl.style.display = 'block';
                if (local.length === 0 && fromFirestore.length === 0) {
                    statusEl.style.background = '#fff3e0';
                    statusEl.style.color = '#e65100';
                    var isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent) || (navigator.vendor && navigator.vendor.indexOf('Apple') > -1);
                    statusEl.innerHTML = 'Conectado. Nenhum reparo no sistema.' +
                        (isSafari ? ' <strong>No Mac/Safari os reparos podem não carregar. Use o Chrome para ver os dados.</strong>' : '');
                } else {
                    statusEl.style.background = '#e8f5e9';
                    statusEl.style.color = '#2e7d32';
                    statusEl.textContent = local.length + ' reparo(s) carregado(s).';
                }
            }
    } catch (e) {
        console.warn('Erro ao sincronizar reparos:', e);
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.style.background = '#ffebee';
            statusEl.style.color = '#c62828';
            statusEl.innerHTML = '<strong>Erro ao conectar.</strong> <a href="#" onclick="loadAdminRepairs();return false;">Clique aqui para tentar novamente</a>.';
        }
        if (typeof showMessage === 'function') {
            showMessage('Erro ao buscar reparos. Clique em Atualizar para tentar novamente.', 'error');
        }
    }

    var repairs = getAdminRepairs();
    if (repairs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8">Nenhuma solicitação de reparo cadastrada.</td></tr>';
        return;
    }

    repairs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const statusLabels = {
        pendente: 'Pendente',
        em_analise: 'Em Análise',
        em_andamento: 'Em Andamento',
        concluido: 'Concluído',
        cancelado: 'Cancelado'
    };

    var canDelete = typeof isSuperAdmin === 'function' && isSuperAdmin();
    tbody.innerHTML = repairs.map(function(r) {
        var idVal = typeof r.id === 'string' ? "'" + String(r.id).replace(/'/g, "\\'") + "'" : r.id;
        var deleteBtn = canDelete ? ' <button class="btn-action btn-delete" onclick="deleteRepairAdmin(' + idVal + ')" title="Excluir (apenas Super Admin)"><i class="fas fa-trash"></i></button>' : '';
        return '<tr><td>#' + r.id + '</td><td>' + (r.clientName || '-') + '</td><td>' + (r.clientEmail || '-') + '</td><td>' + (r.propertyTitle || r.propertyId || '-') + '</td><td>' + (r.location || '-') + '</td><td><span class="status-badge status-' + r.status + '">' + (statusLabels[r.status] || r.status) + '</span></td><td>' + (typeof formatDate === 'function' ? formatDate(r.createdAt) : r.createdAt) + '</td><td><button class="btn-action btn-edit" onclick="openRepairEditModal(' + idVal + ')" title="Editar status"><i class="fas fa-edit"></i></button> <button class="btn-action btn-view" onclick="viewAdminRepairDetails(' + idVal + ')" title="Ver detalhes"><i class="fas fa-eye"></i></button>' + deleteBtn + '</td></tr>';
    }).join('');
}

function openRepairEditModal(repairId) {
    const repairs = getAdminRepairs();
    const repair = repairs.find(r => r.id === repairId);
    if (!repair) {
        showMessage('Solicitação não encontrada.', 'error');
        return;
    }
    window._editingRepairId = repairId;
    document.getElementById('repairEditStatus').value = repair.status || 'pendente';
    document.getElementById('repairEditVisitDate').value = repair.visitDate ? repair.visitDate.slice(0, 16) : '';
    document.getElementById('repairEditResponse').value = '';
    document.getElementById('repairEditModal').style.display = 'block';
}

function closeRepairEditModal() {
    document.getElementById('repairEditModal').style.display = 'none';
    window._editingRepairId = null;
}

async function saveRepairStatus() {
    const repairId = window._editingRepairId;
    if (!repairId) return;
    const newStatus = document.getElementById('repairEditStatus').value;
    const visitDate = document.getElementById('repairEditVisitDate').value;
    const responseText = document.getElementById('repairEditResponse').value.trim();

    const repairs = getAdminRepairs();
    const index = repairs.findIndex(r => r.id === repairId);
    if (index === -1) {
        showMessage('Solicitação não encontrada.', 'error');
        return;
    }
    const repair = repairs[index];
    const oldStatus = repair.status;

    var newResponse = {
        type: 'manual',
        message: responseText || 'Status alterado para ' + newStatus + (visitDate ? ' - Visita agendada para ' + visitDate : ''),
        date: new Date().toISOString()
    };
    if (typeof addUpdatedBy === 'function') addUpdatedBy(newResponse);
    repair.status = newStatus;
    repair.updatedAt = new Date().toISOString();
    if (typeof addUpdatedBy === 'function') addUpdatedBy(repair);
    if (visitDate) repair.visitDate = visitDate;
    if (!repair.responses) repair.responses = [];
    repair.responses.push(newResponse);

    repairs[index] = repair;
    localStorage.setItem('repairRequests', JSON.stringify(repairs));

    if (typeof updateRepairRequestInFirestore === 'function') {
        const updates = {
            status: newStatus,
            updatedAt: repair.updatedAt,
            visitDate: visitDate || null,
            responses: repair.responses
        };
        updateRepairRequestInFirestore(repairId, updates).catch(e => console.error('Erro ao atualizar Firestore:', e));
    }

    if (typeof sendRepairVisitScheduledEmail === 'function' && newStatus === 'em_andamento' && visitDate) {
        try {
            await sendRepairVisitScheduledEmail(repair, visitDate);
            showMessage('Status atualizado. Email de visita agendada enviado ao cliente.', 'success');
        } catch (e) {
            console.error('Erro ao enviar email visita:', e);
            showMessage('Status atualizado. Erro ao enviar email de visita.', 'error');
        }
    } else if (typeof sendRepairCompletedEmail === 'function' && newStatus === 'concluido') {
        try {
            await sendRepairCompletedEmail(repair);
            showMessage('Status atualizado. Email de conclusão enviado ao cliente.', 'success');
        } catch (e) {
            console.error('Erro ao enviar email conclusão:', e);
            showMessage('Status atualizado. Erro ao enviar email de conclusão.', 'error');
        }
    } else {
        showMessage('Status atualizado com sucesso.', 'success');
    }

    // Sempre que houver resposta da empresa, avisar o cliente por email (exceto em_andamento+visitDate e concluido que já têm email próprio)
    var skipGenericEmail = (newStatus === 'em_andamento' && visitDate) || newStatus === 'concluido';
    if (!skipGenericEmail && typeof sendRepairNewResponseEmailToClient === 'function' && repair.clientEmail) {
        try {
            await sendRepairNewResponseEmailToClient(repair, newResponse.message);
        } catch (e) {
            console.error('Erro ao enviar notificação de nova mensagem ao cliente:', e);
        }
    }

    closeRepairEditModal();
    loadAdminRepairs();
}

function viewAdminRepairDetails(repairId) {
    const repairs = getAdminRepairs();
    const repair = repairs.find(r => r.id === repairId);
    if (!repair) {
        showMessage('Solicitação não encontrada.', 'error');
        return;
    }
    const statusLabels = { pendente: 'Pendente', em_analise: 'Em Análise', em_andamento: 'Em Andamento', concluido: 'Concluído', cancelado: 'Cancelado' };
    const respList = (repair.responses || []).map(r => `<li><strong>${r.type === 'automatic' ? 'Automático' : 'Equipe'}</strong>: ${r.message} <small>(${typeof formatDate === 'function' ? formatDate(r.date) : r.date})</small></li>`).join('');
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:600px;">
            <span class="close" onclick="this.closest('.modal').remove()">&times;</span>
            <h2>Detalhes Reparo #${repair.id}</h2>
            <div style="margin:15px 0;">
                <p><strong>Cliente:</strong> ${repair.clientName || '-'} (${repair.clientEmail || '-'})</p>
                <p><strong>Imóvel:</strong> ${repair.propertyTitle || repair.propertyId || '-'}</p>
                <p><strong>Localização:</strong> ${repair.location || '-'}</p>
                <p><strong>Descrição:</strong> ${repair.description || '-'}</p>
                <p><strong>Status:</strong> ${statusLabels[repair.status] || repair.status}</p>
                <p><strong>Prioridade:</strong> ${repair.priority || 'Normal'}</p>
                <p><strong>Data abertura:</strong> ${typeof formatDate === 'function' ? formatDate(repair.createdAt) : repair.createdAt}</p>
                ${repair.visitDate ? `<p><strong>Data visita:</strong> ${typeof formatDate === 'function' ? formatDate(repair.visitDate) : repair.visitDate}</p>` : ''}
                ${(repair.attachments && repair.attachments.length) ? `<p><strong>Anexos:</strong> ${repair.attachments.length} arquivo(s)</p>` : ''}
                ${respList ? `<h4>Histórico de Respostas</h4><ul style="margin:10px 0;">${respList}</ul>` : ''}
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
}

function deleteRepairAdmin(repairId) {
    if (typeof isSuperAdmin !== 'function' || !isSuperAdmin()) {
        if (typeof showMessage === 'function') showMessage('Apenas Super Admin pode excluir reparos.', 'error');
        return;
    }
    if (!confirm('Tem certeza que deseja excluir esta solicitação de reparo? Esta ação não pode ser desfeita.')) return;
    var repairs = getAdminRepairs();
    var index = -1;
    for (var i = 0; i < repairs.length; i++) {
        if (repairs[i].id === repairId || String(repairs[i].id) === String(repairId)) {
            index = i;
            break;
        }
    }
    if (index === -1) {
        if (typeof showMessage === 'function') showMessage('Solicitação não encontrada.', 'error');
        return;
    }
    repairs.splice(index, 1);
    localStorage.setItem('repairRequests', JSON.stringify(repairs));
    if (typeof deleteRepairRequestFromFirestore === 'function') {
        deleteRepairRequestFromFirestore(repairId).catch(function(e) {
            console.error('Erro ao excluir do Firestore:', e);
            if (typeof showMessage === 'function') showMessage('Reparo removido localmente. Erro ao sincronizar com servidor.', 'warning');
        });
    }
    if (typeof showMessage === 'function') showMessage('Solicitação de reparo excluída.', 'success');
    loadAdminRepairs();
}

function showSectionRepairs(sectionId) {
    if (sectionId === 'repairs') {
        loadAdminRepairs();
    }
}

// Abrir reparo via link (admin.html?openRepair=123) - carrega do Firestore se necessário
async function openRepairFromLink(repairId) {
    const id = Number(repairId);
    if (!id) return;
    let repairs = getAdminRepairs();
    let repair = repairs.find(r => r.id === id);
    if (!repair && typeof getRepairRequestFromFirestore === 'function' && typeof firebaseAvailable === 'function' && firebaseAvailable()) {
        try {
            const fromFirestore = await getRepairRequestFromFirestore(id);
            if (fromFirestore) {
                const { firestoreId, ...data } = fromFirestore;
                repair = data;
                repairs.push(repair);
                localStorage.setItem('repairRequests', JSON.stringify(repairs));
            }
        } catch (e) {
            console.warn('Erro ao carregar reparo do Firestore:', e);
        }
    }
    if (repair) {
        loadAdminRepairs();
        openRepairEditModal(id);
    }
    // Limpar parâmetro da URL sem recarregar
    if (window.history && window.history.replaceState) {
        const url = new URL(window.location.href);
        url.searchParams.delete('openRepair');
        window.history.replaceState({}, '', url.toString());
    }
}
