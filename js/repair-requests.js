// Sistema de Solicitação de Reparos

let selectedFiles = [];

// Mostrar formulário de solicitação de reparo
function showRepairRequestForm() {
    const modal = document.getElementById('repairRequestModal');
    if (!modal) {
        showMessage('Formulário de reparo não disponível nesta página. Acesse pela Área do Cliente.', 'error');
        return;
    }
    modal.classList.add('repair-overlay-open');
    modal.style.display = modal.classList.contains('repair-overlay') ? 'flex' : 'block';
    document.body.style.overflow = 'hidden';
    
    // Carregar imóveis do cliente
    loadClientPropertiesForRepair();
    
    // Resetar formulário
    const form = document.getElementById('repairRequestForm');
    if (form) form.reset();
    const filePreview = document.getElementById('filePreview');
    if (filePreview) filePreview.style.display = 'none';
    const filePreviewList = document.getElementById('filePreviewList');
    if (filePreviewList) filePreviewList.innerHTML = '';
    selectedFiles = [];
    updateRepairFileHint();
}

// Verificar se formulário tem conteúdo (para confirmação ao fechar)
function isRepairFormFilled() {
    const desc = document.getElementById('repairDescription')?.value?.trim() || '';
    const loc = document.getElementById('repairLocation')?.value?.trim() || '';
    return desc.length > 0 || loc.length > 0 || selectedFiles.length > 0;
}

// Fechar modal de solicitação de reparo (com confirmação se formulário preenchido)
function closeRepairRequestModal() {
    if (isRepairFormFilled() && !confirm('Tem certeza que deseja sair? As informações preenchidas serão perdidas.')) {
        return;
    }
    const modal = document.getElementById('repairRequestModal');
    if (modal) {
        modal.classList.remove('repair-overlay-open');
        modal.style.display = 'none';
    }
    document.body.style.overflow = '';
    selectedFiles = [];
}

// Carregar imóveis do cliente para o select
function loadClientPropertiesForRepair() {
    const select = document.getElementById('repairProperty');
    const noPropsAlert = document.getElementById('repairNoPropertiesAlert');
    const clientProperties = currentClient?.properties || [];
    
    select.innerHTML = '';
    if (noPropsAlert) noPropsAlert.style.display = 'none';
    
    if (clientProperties.length === 0) {
        select.innerHTML = '<option value="" disabled>Nenhum imóvel cadastrado</option>';
        select.disabled = true;
        if (noPropsAlert) noPropsAlert.style.display = 'block';
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

// Constantes de validação
const REPAIR_MIN_PHOTOS = 3;
const REPAIR_MAX_FILES = 5;
const REPAIR_MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB
const REPAIR_MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB por vídeo
const REPAIR_MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB por imagem

function isImageFile(file) {
    return file.type && file.type.startsWith('image/');
}

function isVideoFile(file) {
    return file.type && file.type.startsWith('video/');
}

// Validação de arquivos (exposta para testes)
function validateRepairFiles(files) {
    const arr = Array.isArray(files) ? files : Array.from(files || []);
    const photoCount = arr.filter(isImageFile).length;
    const total = arr.length;
    if (total > REPAIR_MAX_FILES) return { valid: false, error: `Máximo de ${REPAIR_MAX_FILES} arquivos. Você selecionou ${total}.` };
    if (photoCount < REPAIR_MIN_PHOTOS) return { valid: false, error: `É obrigatório enviar no mínimo ${REPAIR_MIN_PHOTOS} fotos. Você selecionou ${photoCount} foto(s).` };
    const totalSize = arr.reduce((sum, f) => sum + (f.size || 0), 0);
    if (totalSize > REPAIR_MAX_TOTAL_SIZE) return { valid: false, error: 'O total ultrapassa 50MB. Reduza o tamanho dos arquivos.' };
    const oversizedImg = arr.find(f => isImageFile(f) && (f.size || 0) > REPAIR_MAX_IMAGE_SIZE);
    if (oversizedImg) return { valid: false, error: 'Uma das imagens ultrapassa 10MB. Comprima a foto.' };
    const oversizedVid = arr.find(f => isVideoFile(f) && (f.size || 0) > REPAIR_MAX_VIDEO_SIZE);
    if (oversizedVid) return { valid: false, error: 'O vídeo ultrapassa 50MB. Grave um vídeo mais curto.' };
    const invalid = arr.find(f => !isImageFile(f) && !isVideoFile(f));
    if (invalid) return { valid: false, error: 'Aceito apenas fotos (JPG, PNG, etc.) e vídeos (MP4, etc.).' };
    return { valid: true };
}

// Manipular seleção de arquivo
function handleFileSelect(event) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    
    const result = validateRepairFiles(files);
    if (!result.valid) {
        showMessage(result.error, 'error');
        event.target.value = '';
        selectedFiles = [];
        renderFilePreviews();
        updateRepairFileHint();
        return;
    }
    
    selectedFiles = files;
    renderFilePreviews();
    updateRepairFileHint();
}

function updateRepairFileHint() {
    const hint = document.getElementById('repairFileHint');
    if (!hint) return;
    const photos = selectedFiles.filter(isImageFile).length;
    const videos = selectedFiles.filter(isVideoFile).length;
    const total = selectedFiles.length;
    if (total === 0) {
        hint.textContent = '';
        hint.className = 'file-hint';
        return;
    }
    let msg = `${photos} foto(s), ${videos} vídeo(s) • ${total}/${REPAIR_MAX_FILES} arquivos`;
    if (photos < REPAIR_MIN_PHOTOS) {
        msg += ` • Adicione mais ${REPAIR_MIN_PHOTOS - photos} foto(s)`;
        hint.style.color = '#e74c3c';
    } else {
        hint.style.color = '#27ae60';
    }
    hint.textContent = msg;
}

// Remover arquivo selecionado
function removeFile() {
    selectedFiles = [];
    const fileInput = document.getElementById('repairFile');
    if (fileInput) fileInput.value = '';
    const preview = document.getElementById('filePreview');
    if (preview) preview.style.display = 'none';
    const previewList = document.getElementById('filePreviewList');
    if (previewList) previewList.innerHTML = '';
    updateRepairFileHint();
}

function removeSelectedFile(index) {
    selectedFiles.splice(index, 1);
    if (selectedFiles.length === 0) {
        removeFile();
        return;
    }
    renderFilePreviews();
    updateRepairFileHint();
}

function renderFilePreviews() {
    const preview = document.getElementById('filePreview');
    const previewList = document.getElementById('filePreviewList');
    if (!preview || !previewList) return;
    previewList.innerHTML = '';
    
    if (selectedFiles.length === 0) {
        preview.style.display = 'none';
        updateRepairFileHint();
        return;
    }
    
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
    updateRepairFileHint();
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
    
    const photoCount = selectedFiles.filter(f => f.type && f.type.startsWith('image/')).length;
    const totalFiles = selectedFiles.length;
    
    if (totalFiles === 0) {
        showMessage('É obrigatório enviar fotos e/ou vídeos do problema.', 'error');
        return;
    }
    if (photoCount < REPAIR_MIN_PHOTOS) {
        showMessage(`É obrigatório enviar no mínimo ${REPAIR_MIN_PHOTOS} fotos do problema. Você anexou ${photoCount} foto(s).`, 'error');
        return;
    }
    if (totalFiles > REPAIR_MAX_FILES) {
        showMessage(`Máximo de ${REPAIR_MAX_FILES} arquivos. Você anexou ${totalFiles}.`, 'error');
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
    
    const submitBtn = document.querySelector('#repairRequestForm button[type="submit"]');
    const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
        }
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
            clientName: currentClient.name || '',
            clientEmail: currentClient.email || '',
            clientPhone: currentClient.phone || '',
            clientCpf: currentClient.cpf || '',
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
        if (typeof addCreatedBy === 'function') addCreatedBy(repairRequest);
        // Salvar no localStorage
        const repairRequests = JSON.parse(localStorage.getItem('repairRequests') || '[]');
        repairRequests.push(repairRequest);
        localStorage.setItem('repairRequests', JSON.stringify(repairRequests));

        if (typeof saveRepairRequestToFirestore === 'function' && typeof firebaseAvailable === 'function' && firebaseAvailable()) {
            try {
                await saveRepairRequestToFirestore(repairRequest);
            } catch (firestoreError) {
                console.error('Erro ao salvar reparo no Firestore:', firestoreError);
                showMessage('Aviso: reparo salvo localmente, mas não chegou ao servidor. O administrador pode não visualizá-lo. Tente novamente mais tarde.', 'warning');
            }
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
        const repairsTab = document.getElementById('clientRepairsTab');
        if (repairsTab && repairsTab.classList.contains('active')) {
            loadClientRepairs();
        }
        
    } catch (error) {
        console.error('Erro ao enviar solicitação:', error);
        showMessage('Erro ao enviar solicitação. Tente novamente.', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
        }
    }
}

// Carregar solicitações de reparo do cliente
async function loadClientRepairs() {
    if (!currentClient) return;
    
    const repairsList = document.getElementById('clientRepairsList');
    if (!repairsList) return;
    
    let repairRequests = JSON.parse(localStorage.getItem('repairRequests') || '[]');
    if (typeof getAllRepairRequestsFromFirestore === 'function' && typeof firebaseAvailable === 'function' && firebaseAvailable()) {
        try {
            const fromFirestore = await getAllRepairRequestsFromFirestore();
            const isClientRepair = (r) =>
                r.clientId === currentClient.id || r.clientUid === currentClient.uid ||
                (r.clientEmail && currentClient.email && r.clientEmail.toLowerCase() === currentClient.email.toLowerCase());
            const clientFromFirestore = fromFirestore.filter(isClientRepair);
            const byId = new Map(repairRequests.filter(isClientRepair).map(r => [r.id, r]));
            clientFromFirestore.forEach(f => {
                const existing = byId.get(f.id);
                if (!existing || (f.updatedAt && (!existing.updatedAt || new Date(f.updatedAt) > new Date(existing.updatedAt)))) {
                    byId.set(f.id, f);
                }
            });
            const others = repairRequests.filter(r => !isClientRepair(r));
            repairRequests = others.concat(Array.from(byId.values()));
            localStorage.setItem('repairRequests', JSON.stringify(repairRequests));
        } catch (e) {
            console.warn('Erro ao sincronizar reparos:', e);
        }
    }
    const clientRepairs = repairRequests.filter(r =>
        r.clientId === currentClient.id || r.clientUid === currentClient.uid ||
        (r.clientEmail && currentClient.email && r.clientEmail.toLowerCase() === currentClient.email.toLowerCase())
    );
    
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

// Enviar resposta do cliente na solicitação de reparo
async function submitClientRepairResponse(event, repairId) {
    event.preventDefault();
    const textarea = document.getElementById('repairClientResponseMsg');
    const message = (textarea?.value || '').trim();
    if (!message || !currentClient) {
        showMessage('Digite sua mensagem ou faça login.', 'error');
        return;
    }
    const repairRequests = JSON.parse(localStorage.getItem('repairRequests') || '[]');
    const index = repairRequests.findIndex(r => r.id === repairId);
    if (index === -1) {
        showMessage('Solicitação não encontrada.', 'error');
        return;
    }
    const repair = repairRequests[index];
    const newResponse = {
        type: 'client',
        message: message,
        date: new Date().toISOString(),
        updatedBy: 'client'
    };
    if (!repair.responses) repair.responses = [];
    repair.responses.push(newResponse);
    repair.updatedAt = new Date().toISOString();
    repairRequests[index] = repair;
    localStorage.setItem('repairRequests', JSON.stringify(repairRequests));

    if (typeof updateRepairRequestInFirestore === 'function') {
        updateRepairRequestInFirestore(repairId, {
            responses: repair.responses,
            updatedAt: repair.updatedAt
        }).catch(e => console.error('Erro ao atualizar Firestore:', e));
    }

    if (typeof sendRepairClientResponseEmailToCompany === 'function') {
        sendRepairClientResponseEmailToCompany(repair, message).catch(e =>
            console.error('Erro ao enviar email:', e)
        );
    }

    showMessage('Mensagem enviada! A empresa será notificada por email.', 'success');
    if (textarea) textarea.value = '';
    const modal = document.querySelector('.modal');
    if (modal) {
        modal.remove();
        viewRepairDetails(repairId);
    }
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
                                <div class="timeline-item ${response.type === 'automatic' ? 'timeline-automatic' : response.type === 'client' ? 'timeline-client' : 'timeline-manual'}">
                                    <div class="timeline-marker"></div>
                                    <div class="timeline-content">
                                        <p>${response.message}</p>
                                        <small>${formatDate(response.date)} ${response.type === 'automatic' ? '(Automático)' : response.type === 'client' ? '(Você)' : '(Equipe)'}</small>
                                    </div>
                                </div>
                            `).join('')
                            : '<p>Nenhuma resposta ainda.</p>'
                        }
                    </div>
                </div>
                <div class="detail-item repair-respond-area">
                    <strong>Responder ou enviar dúvida:</strong>
                    <form class="repair-response-form" onsubmit="submitClientRepairResponse(event, ${repair.id})">
                        <textarea id="repairClientResponseMsg" rows="3" placeholder="Digite sua mensagem, dúvida ou resposta..." required></textarea>
                        <button type="submit" class="btn btn-primary btn-sm">
                            <i class="fas fa-paper-plane"></i> Enviar
                        </button>
                    </form>
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

