// Document management system for properties

// Property documents storage
let propertyDocuments = [];

// Initialize documents system
document.addEventListener('DOMContentLoaded', function() {
    loadPropertyDocuments();
});

// Load property documents from localStorage
function loadPropertyDocuments() {
    const saved = localStorage.getItem('propertyDocuments');
    if (saved) {
        propertyDocuments = JSON.parse(saved);
        propertyDocuments.forEach(doc => {
            doc.uploadedAt = new Date(doc.uploadedAt);
            if (doc.updatedAt) doc.updatedAt = new Date(doc.updatedAt);
        });
    }
}

// Save property documents to localStorage
function savePropertyDocuments() {
    localStorage.setItem('propertyDocuments', JSON.stringify(propertyDocuments));
}

// Add property document
function addPropertyDocument(propertyId, documentData) {
    const document = {
        id: generateDocumentId(),
        propertyId: propertyId,
        type: documentData.type, // 'escritura', 'matricula', 'planta', 'memorial', 'habite_se', 'outros'
        title: documentData.title,
        description: documentData.description || '',
        fileName: documentData.fileName,
        fileSize: documentData.fileSize,
        fileType: documentData.fileType,
        filePath: documentData.filePath,
        uploadedBy: documentData.uploadedBy,
        uploadedAt: new Date(),
        isPublic: documentData.isPublic || false, // If true, visible to all brokers
        requiresApproval: documentData.requiresApproval !== false // Default true
    };
    
    propertyDocuments.push(document);
    savePropertyDocuments();
    
    return document;
}

// Generate document ID
function generateDocumentId() {
    return 'DOC' + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase();
}

// Get documents for property
function getPropertyDocuments(propertyId, brokerId = null) {
    const docs = propertyDocuments.filter(doc => doc.propertyId === propertyId);
    
    if (!brokerId) {
        return docs; // Admin can see all documents
    }
    
    // Filter documents based on broker access
    return docs.filter(doc => {
        if (doc.isPublic) return true;
        if (doc.requiresApproval) {
            return hasBrokerDocumentAccess(brokerId, propertyId);
        }
        return true;
    });
}

// Request document access
async function requestDocumentAccess(propertyId, brokerId) {
    if (!currentUser || !isBroker()) {
        showMessage('Acesso negado. Faça login como corretor.', 'error');
        return false;
    }
    
    // Check if already has access
    if (hasBrokerDocumentAccess(brokerId, propertyId)) {
        showMessage('Você já tem acesso aos documentos deste imóvel.', 'info');
        return true;
    }
    
    // Check if request already exists
    const existingRequest = adminNotifications.find(n => 
        n.type === 'document_request' && 
        n.data.propertyId === propertyId && 
        n.data.brokerId === brokerId &&
        n.status === 'pending'
    );
    
    if (existingRequest) {
        showMessage('Solicitação já enviada. Aguarde aprovação do administrador.', 'warning');
        return false;
    }
    
    const property = getPropertyById(propertyId);
    if (!property) {
        showMessage('Imóvel não encontrado.', 'error');
        return false;
    }
    
    // Create notification for admin
    createDocumentRequestNotification(propertyId, brokerId, currentUser.name, property.title);
    
    // Enviar email para o admin (B F Marques) quando chega a solicitação
    if (typeof sendEmail === 'function') {
        const subject = 'Nova Solicitação de Acesso a Documentos - ' + property.title;
        const body = `
            <h2>Nova Solicitação de Acesso a Documentos</h2>
            <p><strong>Imóvel:</strong> ${property.title}</p>
            <p><strong>Corretor:</strong> ${currentUser.name} (${currentUser.email || ''})</p>
            <p>Acesse o painel administrativo para aprovar ou rejeitar.</p>
            <p>Atenciosamente,<br><strong>B F Marques Empreendimentos</strong></p>
        `;
        try { await sendEmail('bfmarquesempreendimentos@gmail.com', subject, body); } catch (err) { console.error('Erro ao enviar email:', err); }
    }
    
    showMessage('Solicitação de acesso aos documentos enviada para aprovação.', 'success');
    return true;
}

// Show documents modal
function showDocumentsModal(propertyId) {
    const property = getPropertyById(propertyId);
    if (!property) return;
    
    const brokerId = currentUser && isBroker() ? currentUser.id : null;
    const documents = getPropertyDocuments(propertyId, brokerId);
    
    const modal = document.getElementById('documentsModal') || createDocumentsModal();
    const content = modal.querySelector('.modal-content');
    
    content.innerHTML = `
        <span class="close" onclick="closeDocumentsModal()">&times;</span>
        <h2>Documentos - ${property.title}</h2>
        
        <div class="documents-container">
            ${documents.length > 0 ? `
                <div class="documents-list">
                    ${documents.map(doc => `
                        <div class="document-item">
                            <div class="document-info">
                                <div class="document-icon">
                                    <i class="fas ${getDocumentIcon(doc.type)}"></i>
                                </div>
                                <div class="document-details">
                                    <h4>${doc.title}</h4>
                                    <p class="document-type">${getDocumentTypeName(doc.type)}</p>
                                    ${doc.description ? `<p class="document-description">${doc.description}</p>` : ''}
                                    <small>Enviado em ${formatDate(doc.uploadedAt)}</small>
                                </div>
                            </div>
                            <div class="document-actions">
                                <button class="btn-document-view" onclick="viewDocument('${doc.id}')">
                                    <i class="fas fa-eye"></i> Visualizar
                                </button>
                                <button class="btn-document-download" onclick="downloadDocument('${doc.id}')">
                                    <i class="fas fa-download"></i> Baixar
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            ` : `
                <div class="no-documents">
                    <i class="fas fa-folder-open"></i>
                    <h3>Nenhum documento disponível</h3>
                    ${brokerId ? `
                        <p>Solicite acesso aos documentos deste imóvel.</p>
                        <button class="btn btn-primary" onclick="requestDocumentAccess(${propertyId}, ${brokerId})">
                            <i class="fas fa-key"></i> Solicitar Acesso
                        </button>
                    ` : ''}
                </div>
            `}
            
            ${brokerId && documents.length > 0 && !hasBrokerDocumentAccess(brokerId, propertyId) ? `
                <div class="access-request-section">
                    <p>Para acessar todos os documentos, solicite permissão ao administrador.</p>
                    <button class="btn btn-primary" onclick="requestDocumentAccess(${propertyId}, ${brokerId})">
                        <i class="fas fa-key"></i> Solicitar Acesso Completo
                    </button>
                </div>
            ` : ''}
        </div>
    `;
    
    modal.style.display = 'block';
}

// Create documents modal
function createDocumentsModal() {
    const modal = document.createElement('div');
    modal.id = 'documentsModal';
    modal.className = 'modal';
    modal.innerHTML = '<div class="modal-content documents-modal"></div>';
    document.body.appendChild(modal);
    return modal;
}

// Close documents modal
function closeDocumentsModal() {
    const modal = document.getElementById('documentsModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Get document type name
function getDocumentTypeName(type) {
    const types = {
        'escritura': 'Escritura',
        'matricula': 'Matrícula',
        'planta': 'Planta Baixa',
        'memorial': 'Memorial Descritivo',
        'habite_se': 'Habite-se',
        'registro': 'Registro do Imóvel',
        'iptu': 'IPTU',
        'condominio': 'Taxa de Condomínio',
        'financiamento': 'Documentos de Financiamento',
        'outros': 'Outros Documentos'
    };
    return types[type] || 'Documento';
}

// Get document icon
function getDocumentIcon(type) {
    const icons = {
        'escritura': 'fa-file-contract',
        'matricula': 'fa-id-card',
        'planta': 'fa-drafting-compass',
        'memorial': 'fa-file-alt',
        'habite_se': 'fa-certificate',
        'registro': 'fa-stamp',
        'iptu': 'fa-receipt',
        'condominio': 'fa-building',
        'financiamento': 'fa-hand-holding-usd',
        'outros': 'fa-file'
    };
    return icons[type] || 'fa-file';
}

// View document
function viewDocument(documentId) {
    const doc = propertyDocuments.find(d => d.id === documentId);
    if (!doc) {
        showMessage('Documento não encontrado.', 'error');
        return;
    }
    
    // Check access
    if (currentUser && isBroker() && doc.requiresApproval && !doc.isPublic) {
        if (!hasBrokerDocumentAccess(currentUser.id, doc.propertyId)) {
            showMessage('Acesso negado. Solicite permissão ao administrador.', 'error');
            return;
        }
    }
    
    // In a real application, this would open the document viewer
    // For now, we'll show an alert
    showMessage(`Visualizando: ${doc.title}`, 'info');
    console.log('Viewing document:', doc);
}

// Download document
function downloadDocument(documentId) {
    const doc = propertyDocuments.find(d => d.id === documentId);
    if (!doc) {
        showMessage('Documento não encontrado.', 'error');
        return;
    }
    
    // Check access
    if (currentUser && isBroker() && doc.requiresApproval && !doc.isPublic) {
        if (!hasBrokerDocumentAccess(currentUser.id, doc.propertyId)) {
            showMessage('Acesso negado. Solicite permissão ao administrador.', 'error');
            return;
        }
    }
    
    // In a real application, this would trigger the download
    // For now, we'll show a message
    showMessage(`Download iniciado: ${doc.title}`, 'success');
    console.log('Downloading document:', doc);
}

// Admin: Add document to property
function adminAddPropertyDocument(propertyId) {
    const property = getPropertyById(propertyId);
    if (!property) {
        showMessage('Imóvel não encontrado.', 'error');
        return;
    }
    
    // Show add document modal
    showAddDocumentModal(propertyId);
}

// Show add document modal
function showAddDocumentModal(propertyId) {
    const modal = document.getElementById('addDocumentModal') || createAddDocumentModal();
    const form = modal.querySelector('#addDocumentForm');
    
    form.innerHTML = `
        <h3>Adicionar Documento</h3>
        
        <div class="form-group">
            <label>Tipo do Documento:</label>
            <select name="type" required>
                <option value="">Selecione o tipo</option>
                <option value="escritura">Escritura</option>
                <option value="matricula">Matrícula</option>
                <option value="planta">Planta Baixa</option>
                <option value="memorial">Memorial Descritivo</option>
                <option value="habite_se">Habite-se</option>
                <option value="registro">Registro do Imóvel</option>
                <option value="iptu">IPTU</option>
                <option value="condominio">Taxa de Condomínio</option>
                <option value="financiamento">Documentos de Financiamento</option>
                <option value="outros">Outros</option>
            </select>
        </div>
        
        <div class="form-group">
            <label>Título:</label>
            <input type="text" name="title" required>
        </div>
        
        <div class="form-group">
            <label>Descrição (opcional):</label>
            <textarea name="description" rows="3"></textarea>
        </div>
        
        <div class="form-group">
            <label>Arquivo:</label>
            <input type="file" name="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" required>
        </div>
        
        <div class="form-group checkbox-group">
            <label>
                <input type="checkbox" name="isPublic"> 
                Documento público (visível para todos os corretores)
            </label>
        </div>
        
        <div class="form-group checkbox-group">
            <label>
                <input type="checkbox" name="requiresApproval" checked> 
                Requer aprovação para acesso
            </label>
        </div>
        
        <div class="form-actions">
            <button type="button" class="btn btn-secondary" onclick="closeAddDocumentModal()">Cancelar</button>
            <button type="submit" class="btn btn-primary">Adicionar Documento</button>
        </div>
    `;
    
    // Setup form submission
    form.onsubmit = function(e) {
        e.preventDefault();
        handleAddDocument(e, propertyId);
    };
    
    modal.style.display = 'block';
}

// Create add document modal
function createAddDocumentModal() {
    const modal = document.createElement('div');
    modal.id = 'addDocumentModal';
    modal.className = 'modal';
    modal.innerHTML = '<div class="modal-content"><form id="addDocumentForm"></form></div>';
    document.body.appendChild(modal);
    return modal;
}

// Handle add document
function handleAddDocument(e, propertyId) {
    const formData = new FormData(e.target);
    const file = formData.get('file');
    
    if (!file || file.size === 0) {
        showMessage('Por favor, selecione um arquivo.', 'error');
        return;
    }
    
    // In a real application, you would upload the file to a server
    // For this demo, we'll simulate the upload
    const documentData = {
        type: formData.get('type'),
        title: formData.get('title'),
        description: formData.get('description'),
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        filePath: `uploads/property_${propertyId}/${file.name}`, // Simulated path
        uploadedBy: 'admin',
        isPublic: formData.get('isPublic') === 'on',
        requiresApproval: formData.get('requiresApproval') === 'on'
    };
    
    const document = addPropertyDocument(propertyId, documentData);
    
    closeAddDocumentModal();
    showMessage('Documento adicionado com sucesso!', 'success');
    
    // Refresh documents list if modal is open
    const documentsModal = document.getElementById('documentsModal');
    if (documentsModal && documentsModal.style.display === 'block') {
        showDocumentsModal(propertyId);
    }
}

// Close add document modal
function closeAddDocumentModal() {
    const modal = document.getElementById('addDocumentModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Get document statistics
function getDocumentStatistics() {
    return {
        total: propertyDocuments.length,
        byType: propertyDocuments.reduce((acc, doc) => {
            acc[doc.type] = (acc[doc.type] || 0) + 1;
            return acc;
        }, {}),
        public: propertyDocuments.filter(doc => doc.isPublic).length,
        restricted: propertyDocuments.filter(doc => doc.requiresApproval).length
    };
}

