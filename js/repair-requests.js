// Sistema de Solicitação de Reparos

let selectedFiles = [];

// Mostrar formulário de solicitação de reparo
function showRepairRequestForm() {
    const modal = document.getElementById('repairRequestModal');
    modal.style.display = 'block';
    
    // Carregar imóveis do cliente
    loadClientPropertiesForRepair();
    
    // Resetar formulário
    document.getElementById('repairRequestForm').reset();
    document.getElementById('filePreview').style.display = 'none';
    document.getElementById('filePreviewList').innerHTML = '';
    selectedFiles = [];
}

// Fechar modal de solicitação de reparo
function closeRepairRequestModal() {
    document.getElementById('repairRequestModal').style.display = 'none';
    selectedFiles = [];
}

// Carregar imóveis do cliente para o select
function loadClientPropertiesForRepair() {
    const select = document.getElementById('repairProperty');
    const clientProperties = currentClient?.properties || [];
    
    select.innerHTML = '';
    
    if (clientProperties.length === 0) {
        select.innerHTML = '<option value="" disabled>Nenhum imóvel cadastrado</option>';
        select.disabled = true;
        return;
    }
    
    if (clientProperties.length === 1) {
        const prop = clientProperties[0];
        select.innerHTML = `<option value="${prop.id || prop.propertyId}" selected>${prop.title || prop.name || 'Meu Imóvel'}</option>`;
        select.disabled = true;
        return;
    }
    
    select.disabled = false;
    select.innerHTML = '<option value="">Selecione um imóvel</option>';
    clientProperties.forEach(prop => {
        const option = document.createElement('option');
        option.value = prop.id || prop.propertyId;
        option.textContent = prop.title || prop.name || `Imóvel ${prop.id || prop.propertyId}`;
        select.appendChild(option);
    });
}

// Manipular seleção de arquivo
function handleFileSelect(event) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    
    const maxFiles = 5;
    const maxTotalSize = 30 * 1024 * 1024; // 30MB
    const maxSingleSize = 25 * 1024 * 1024; // 25MB
    
    if (files.length > maxFiles) {
        showMessage(`Você pode enviar no máximo ${maxFiles} arquivos.`, 'error');
        event.target.value = '';
        return;
    }
    
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > maxTotalSize) {
        showMessage('O total de arquivos ultrapassa 30MB. Reduza o tamanho.', 'error');
        event.target.value = '';
        return;
    }
    
    const hasOversized = files.some(file => file.size > maxSingleSize);
    if (hasOversized) {
        showMessage('Um dos arquivos ultrapassa 25MB. Reduza o tamanho.', 'error');
        event.target.value = '';
        return;
    }
    
    selectedFiles = files;
    renderFilePreviews();
}

// Remover arquivo selecionado
function removeFile() {
    selectedFiles = [];
    document.getElementById('repairFile').value = '';
    document.getElementById('filePreview').style.display = 'none';
    document.getElementById('filePreviewList').innerHTML = '';
}

function removeSelectedFile(index) {
    selectedFiles.splice(index, 1);
    if (selectedFiles.length === 0) {
        removeFile();
        return;
    }
    renderFilePreviews();
}

function renderFilePreviews() {
    const preview = document.getElementById('filePreview');
    const previewList = document.getElementById('filePreviewList');
    previewList.innerHTML = '';
    
    selectedFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'file-preview-item';
        
        const url = URL.createObjectURL(file);
        if (file.type.startsWith('image/')) {
            item.innerHTML = `
                <img src="${url}" alt="Preview">
                <div class="file-preview-meta">
                    <span>${file.name}</span>
                    <button type="button" onclick="removeSelectedFile(${index})">Remover</button>
                </div>
            `;
        } else if (file.type.startsWith('video/')) {
            item.innerHTML = `
                <video src="${url}" controls></video>
                <div class="file-preview-meta">
                    <span>${file.name}</span>
                    <button type="button" onclick="removeSelectedFile(${index})">Remover</button>
                </div>
            `;
        }
        
        previewList.appendChild(item);
    });
    
    preview.style.display = 'block';
}

// Converter arquivo para base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// Enviar solicitação de reparo
async function submitRepairRequest(event) {
    event.preventDefault();
    
    if (!currentClient) {
        showMessage('Você precisa estar logado para fazer uma solicitação.', 'error');
        return;
    }
    
    if (selectedFiles.length === 0) {
        showMessage('Por favor, selecione pelo menos uma foto ou vídeo do problema.', 'error');
        return;
    }
    
    const propertyId = document.getElementById('repairProperty').value;
    const description = document.getElementById('repairDescription').value;
    const location = document.getElementById('repairLocation').value;
    const priority = document.getElementById('repairPriority').value;
    
    if (!propertyId) {
        showMessage('Por favor, selecione um imóvel.', 'error');
        return;
    }
    
    try {
        // Salvar anexos no Firebase Storage (preferencial) ou IndexedDB (fallback)
        let attachments = [];
        if (typeof uploadRepairAttachmentsToFirebase === 'function') {
            attachments = await uploadRepairAttachmentsToFirebase(selectedFiles);
        } else if (typeof saveAttachment === 'function') {
            for (const file of selectedFiles) {
                const saved = await saveAttachment(file);
                attachments.push({
                    id: saved.id,
                    name: saved.name,
                    type: saved.type,
                    size: saved.size
                });
            }
        } else {
            throw new Error('Storage indisponível');
        }
        
        const propertyInfo = currentClient.properties?.find(p => (p.id || p.propertyId) == propertyId);
        
        // Criar solicitação
        const repairRequest = {
            id: Date.now(),
            clientId: currentClient.id,
            clientUid: currentClient.uid || null,
            propertyId: propertyId,
            propertyTitle: propertyInfo?.title || propertyInfo?.name || 'Meu Imóvel',
            unitCode: propertyInfo?.unitCode || null,
            description: description,
            location: location,
            priority: priority,
            attachments: attachments,
            attachmentsCount: attachments.length,
            attachmentsTotalSize: attachments.reduce((sum, a) => sum + a.size, 0),
            status: 'pendente',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            responses: [
                {
                    type: 'automatic',
                    message: 'Recebemos sua solicitação de reparo! Nossa equipe técnica irá analisar e entrar em contato em breve. O número do seu protocolo é: #' + Date.now(),
                    date: new Date().toISOString()
                }
            ]
        };
        
        // Salvar no localStorage
        const repairRequests = JSON.parse(localStorage.getItem('repairRequests') || '[]');
        repairRequests.push(repairRequest);
        localStorage.setItem('repairRequests', JSON.stringify(repairRequests));

        if (typeof saveRepairRequestToFirestore === 'function') {
            saveRepairRequestToFirestore(repairRequest).catch(error => {
                console.error('Erro ao salvar reparo no Firestore:', error);
            });
        }
        
        // Adicionar ao histórico do cliente
        addClientHistory(
            'Solicitação de Reparo Enviada',
            'repair',
            `Solicitação #${repairRequest.id} - ${location}: ${description.substring(0, 50)}...`
        );
        
        // Enviar emails de notificação
        if (typeof sendRepairRequestEmail !== 'undefined') {
            sendRepairRequestEmail(repairRequest, currentClient).catch(error => {
                console.error('Erro ao enviar email:', error);
            });
        }
        
        showMessage('Solicitação enviada com sucesso! Você receberá uma resposta em breve.', 'success');
        closeRepairRequestModal();
        
        // Recarregar lista de reparos
        if (document.getElementById('clientRepairsTab').classList.contains('active')) {
            loadClientRepairs();
        }
        
    } catch (error) {
        console.error('Erro ao enviar solicitação:', error);
        showMessage('Erro ao enviar solicitação. Tente novamente.', 'error');
    }
}

// Carregar solicitações de reparo do cliente
function loadClientRepairs() {
    if (!currentClient) return;
    
    const repairRequests = JSON.parse(localStorage.getItem('repairRequests') || '[]');
    const clientRepairs = repairRequests.filter(r => r.clientId === currentClient.id);
    
    const repairsList = document.getElementById('clientRepairsList');
    
    if (clientRepairs.length === 0) {
        repairsList.innerHTML = '<p>Nenhuma solicitação de reparo no momento.</p>';
        return;
    }
    
    // Ordenar por data (mais recente primeiro)
    clientRepairs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    repairsList.innerHTML = clientRepairs.map(repair => {
        const statusClass = {
            'pendente': 'status-pending',
            'em_analise': 'status-analyzing',
            'em_andamento': 'status-progress',
            'concluido': 'status-completed',
            'cancelado': 'status-cancelled'
        }[repair.status] || 'status-pending';
        
        const statusText = {
            'pendente': 'Pendente',
            'em_analise': 'Em Análise',
            'em_andamento': 'Em Andamento',
            'concluido': 'Concluído',
            'cancelado': 'Cancelado'
        }[repair.status] || 'Pendente';
        
        const priorityClass = {
            'normal': 'priority-normal',
            'alta': 'priority-high',
            'urgente': 'priority-urgent'
        }[repair.priority] || 'priority-normal';
        
        const priorityText = {
            'normal': 'Normal',
            'alta': 'Alta',
            'urgente': 'Urgente'
        }[repair.priority] || 'Normal';
        
        // Obter nome do imóvel
        const property = currentClient.properties?.find(p => (p.id || p.propertyId) == repair.propertyId);
        const propertyName = property?.title || property?.name || `Imóvel #${repair.propertyId}`;
        
        // Mostrar última resposta
        const lastResponse = repair.responses && repair.responses.length > 0 
            ? repair.responses[repair.responses.length - 1]
            : null;
        
    const firstAttachment = repair.attachments && repair.attachments.length > 0 ? repair.attachments[0] : null;
        return `
            <div class="repair-request-card">
                <div class="repair-header">
                    <div>
                        <h5>Solicitação #${repair.id}</h5>
                        <p class="repair-property">${propertyName}</p>
                    </div>
                    <div class="repair-status">
                        <span class="status-badge ${statusClass}">${statusText}</span>
                        <span class="priority-badge ${priorityClass}">${priorityText}</span>
                    </div>
                </div>
                <div class="repair-body">
                    <div class="repair-info">
                        <p><strong>Localização:</strong> ${repair.location}</p>
                        <p><strong>Descrição:</strong> ${repair.description}</p>
                        <p><strong>Data:</strong> ${formatDate(repair.createdAt)}</p>
                    </div>
                    ${firstAttachment ? `
                        <div class="repair-file">
                            <strong>Arquivo anexado:</strong>
                            <div class="file-info">
                                <div class="repair-attachment-preview" 
                                     data-attachment-id="${firstAttachment.id || ''}"
                                     data-attachment-url="${firstAttachment.url || ''}"
                                     data-attachment-type="${firstAttachment.type || ''}">
                                </div>
                                <span>${firstAttachment.name}</span>
                            </div>
                        </div>
                    ` : ''}
                    ${lastResponse ? `
                        <div class="repair-response">
                            <strong>Última Resposta:</strong>
                            <div class="response-message ${lastResponse.type === 'automatic' ? 'response-automatic' : 'response-manual'}">
                                <p>${lastResponse.message}</p>
                                <small>${formatDate(lastResponse.date)} ${lastResponse.type === 'automatic' ? '(Resposta Automática)' : ''}</small>
                            </div>
                        </div>
                    ` : ''}
                </div>
                <div class="repair-actions">
                    <button class="btn btn-secondary btn-sm" onclick="viewRepairDetails(${repair.id})">
                        <i class="fas fa-eye"></i> Ver Detalhes
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Carregar previews dos anexos
    setTimeout(() => hydrateAttachmentPreviews(), 0);
}

// Ver detalhes da solicitação
function viewRepairDetails(repairId) {
    const repairRequests = JSON.parse(localStorage.getItem('repairRequests') || '[]');
    const repair = repairRequests.find(r => r.id === repairId);
    
    if (!repair) {
        showMessage('Solicitação não encontrada.', 'error');
        return;
    }
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-content repair-details-modal">
            <span class="close" onclick="this.closest('.modal').remove()">&times;</span>
            <h2>Detalhes da Solicitação #${repair.id}</h2>
            <div class="repair-details">
                <div class="detail-item">
                    <strong>Status:</strong>
                    <span class="status-badge status-${repair.status}">${getStatusText(repair.status)}</span>
                </div>
                <div class="detail-item">
                    <strong>Prioridade:</strong>
                    <span class="priority-badge priority-${repair.priority}">${getPriorityText(repair.priority)}</span>
                </div>
                <div class="detail-item">
                    <strong>Localização:</strong>
                    <span>${repair.location}</span>
                </div>
                <div class="detail-item">
                    <strong>Descrição:</strong>
                    <p>${repair.description}</p>
                </div>
                <div class="detail-item">
                    <strong>Data de Criação:</strong>
                    <span>${formatDate(repair.createdAt)}</span>
                </div>
                ${repair.attachments && repair.attachments.length > 0 ? `
                    <div class="detail-item">
                        <strong>Anexos:</strong>
                        <div class="file-display repair-attachments-grid">
                            ${repair.attachments.map(att => `
                                <div class="repair-attachment-preview" 
                                     data-attachment-id="${att.id || ''}"
                                     data-attachment-url="${att.url || ''}"
                                     data-attachment-type="${att.type || ''}">
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                <div class="detail-item">
                    <strong>Histórico de Respostas:</strong>
                    <div class="responses-timeline">
                        ${repair.responses && repair.responses.length > 0 
                            ? repair.responses.map(response => `
                                <div class="timeline-item ${response.type === 'automatic' ? 'timeline-automatic' : 'timeline-manual'}">
                                    <div class="timeline-marker"></div>
                                    <div class="timeline-content">
                                        <p>${response.message}</p>
                                        <small>${formatDate(response.date)} ${response.type === 'automatic' ? '(Automático)' : '(Equipe)'}</small>
                                    </div>
                                </div>
                            `).join('')
                            : '<p>Nenhuma resposta ainda.</p>'
                        }
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    setTimeout(() => hydrateAttachmentPreviews(modal), 0);
    
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// Funções auxiliares
function getStatusText(status) {
    const statusMap = {
        'pendente': 'Pendente',
        'em_analise': 'Em Análise',
        'em_andamento': 'Em Andamento',
        'concluido': 'Concluído',
        'cancelado': 'Cancelado'
    };
    return statusMap[status] || 'Pendente';
}

function getPriorityText(priority) {
    const priorityMap = {
        'normal': 'Normal',
        'alta': 'Alta',
        'urgente': 'Urgente'
    };
    return priorityMap[priority] || 'Normal';
}

// Mostrar modal de arquivo
function showRepairFileModal(fileData, fileType) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-content image-modal">
            <span class="close" onclick="this.closest('.modal').remove()">&times;</span>
            ${fileType.startsWith('image/') 
                ? `<img src="${fileData}" alt="Foto do problema" style="max-width: 100%; height: auto;">`
                : `<video src="${fileData}" controls style="max-width: 100%; height: auto;"></video>`
            }
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

async function hydrateAttachmentPreviews(scope = document) {
    const elements = scope.querySelectorAll('.repair-attachment-preview');
    for (const el of elements) {
        const attachmentUrl = el.getAttribute('data-attachment-url');
        const attachmentType = el.getAttribute('data-attachment-type');
        const attachmentId = el.getAttribute('data-attachment-id');
        
        if (attachmentUrl) {
            if (attachmentType && attachmentType.startsWith('image/')) {
                el.innerHTML = `<img src="${attachmentUrl}" alt="Anexo" class="repair-file-preview" onclick="showRepairFileModal('${attachmentUrl}', '${attachmentType}')">`;
            } else if (attachmentType && attachmentType.startsWith('video/')) {
                el.innerHTML = `<video src="${attachmentUrl}" controls class="repair-file-preview"></video>`;
            }
            continue;
        }
        
        if (!attachmentId || typeof getAttachment !== 'function') continue;
        const attachment = await getAttachment(attachmentId);
        if (!attachment) continue;
        
        const url = URL.createObjectURL(attachment.blob);
        if (attachment.type.startsWith('image/')) {
            el.innerHTML = `<img src="${url}" alt="${attachment.name}" class="repair-file-preview" onclick="showRepairFileModal('${url}', '${attachment.type}')">`;
        } else if (attachment.type.startsWith('video/')) {
            el.innerHTML = `<video src="${url}" controls class="repair-file-preview"></video>`;
        }
    }
}

// Fechar modal ao clicar fora
window.addEventListener('click', function(event) {
    const repairModal = document.getElementById('repairRequestModal');
    if (event.target === repairModal) {
        closeRepairRequestModal();
    }
});

