// Admin - Gestão de Solicitações de Reparo

function getAdminRepairs() {
    return JSON.parse(localStorage.getItem('repairRequests') || '[]');
}

function loadAdminRepairs() {
    const section = document.getElementById('repairs');
    if (!section) return;
    const tbody = document.getElementById('adminRepairsTableBody');
    if (!tbody) return;

    const repairs = getAdminRepairs();
    if (repairs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9">Nenhuma solicitação de reparo cadastrada.</td></tr>';
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

    tbody.innerHTML = repairs.map(r => `
        <tr>
            <td>#${r.id}</td>
            <td>${r.clientName || '-'}</td>
            <td>${r.clientEmail || '-'}</td>
            <td>${r.propertyTitle || r.propertyId || '-'}</td>
            <td>${r.location || '-'}</td>
            <td><span class="status-badge status-${r.status}">${statusLabels[r.status] || r.status}</span></td>
            <td>${typeof formatDate === 'function' ? formatDate(r.createdAt) : r.createdAt}</td>
            <td>
                <button class="btn-action btn-edit" onclick="openRepairEditModal(${r.id})" title="Editar status">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-action btn-view" onclick="viewAdminRepairDetails(${r.id})" title="Ver detalhes">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        </tr>
    `).join('');
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

    const newResponse = {
        type: 'manual',
        message: responseText || `Status alterado para ${newStatus}` + (visitDate ? ` - Visita agendada para ${visitDate}` : ''),
        date: new Date().toISOString(),
        updatedBy: 'admin'
    };
    repair.status = newStatus;
    repair.updatedAt = new Date().toISOString();
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

    if (typeof sendRepairVisitScheduledEmail === 'function' && newStatus === 'em_andamento') {
        try {
            await sendRepairVisitScheduledEmail(repair, visitDate || new Date());
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

function showSectionRepairs(sectionId) {
    if (sectionId === 'repairs') {
        loadAdminRepairs();
    }
}
