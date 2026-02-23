// Admin Panel JavaScript

// Admin state
let currentSection = 'dashboard';
let editingProperty = null;
let editingBroker = null;

// Initialize admin panel
document.addEventListener('DOMContentLoaded', function() {
    initializeAdminPanel();
});

// Mobile sidebar toggle
function toggleAdminSidebar() {
    const sidebar = document.querySelector('.admin-sidebar');
    const overlay = document.getElementById('adminSidebarOverlay');
    if (sidebar && overlay) {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('visible', sidebar.classList.contains('open'));
    }
}

function closeAdminSidebar() {
    const sidebar = document.querySelector('.admin-sidebar');
    const overlay = document.getElementById('adminSidebarOverlay');
    if (sidebar && overlay) {
        sidebar.classList.remove('open');
        overlay.classList.remove('visible');
    }
}

function initializeAdminPanel() {
    // Check admin authentication
    if (!isAdminAuthenticated()) {
        redirectToLogin();
        return;
    }
    
    // Load initial data
    loadDashboardData();
    setupAdminEventListeners();
    showSection('dashboard');
}

// Check admin authentication
function isAdminAuthenticated() {
    // In a real application, check for proper admin token/session
    const adminUser = localStorage.getItem('adminUser');
    return adminUser !== null;
}

// Redirect to login
function redirectToLogin() {
    window.location.href = 'admin-login.html';
}

// Admin logout
function adminLogout() {
    if (confirm('Tem certeza que deseja sair?')) {
        localStorage.removeItem('adminUser');
        redirectToLogin();
    }
}

// Setup admin event listeners
function setupAdminEventListeners() {
    // Filter listeners
    document.getElementById('adminTypeFilter')?.addEventListener('change', filterAdminProperties);
    document.getElementById('adminStatusFilter')?.addEventListener('change', filterAdminProperties);
    document.getElementById('adminSearchInput')?.addEventListener('input', filterAdminProperties);
    
    // Form listeners
    document.getElementById('generalSettingsForm')?.addEventListener('submit', saveGeneralSettings);
    document.getElementById('reservationSettingsForm')?.addEventListener('submit', saveReservationSettings);
    document.getElementById('saleForm')?.addEventListener('submit', handleSaleFormSubmission);
}

// Load sales data
function loadSalesData() {
    loadSalesPropertyOptions();
    renderSalesTable();
}

function loadSalesPropertyOptions() {
    const select = document.getElementById('saleProperty');
    if (!select) return;
    
    select.innerHTML = '<option value="">Selecione um imóvel</option>';
    if (!Array.isArray(properties)) return;
    
    properties.forEach(property => {
        const option = document.createElement('option');
        option.value = property.id;
        option.textContent = property.title;
        select.appendChild(option);
    });
}

function getSalesData() {
    return JSON.parse(localStorage.getItem('propertySales') || '[]');
}

function renderSalesTable() {
    const tbody = document.getElementById('salesTableBody');
    if (!tbody) return;
    
    const sales = getSalesData();
    if (sales.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8">Nenhuma venda cadastrada.</td></tr>';
        return;
    }
    
    tbody.innerHTML = sales.map(sale => `
        <tr>
            <td>${sale.id}</td>
            <td>${sale.propertyTitle || 'Imóvel'}</td>
            <td>${sale.clientName}</td>
            <td>${sale.clientCPF}</td>
            <td>${sale.clientEmail}</td>
            <td>R$ ${Number(sale.salePrice || 0).toLocaleString('pt-BR')}</td>
            <td>${formatDate(sale.saleDate)}</td>
            <td>
                <button class="btn-action btn-delete" onclick="deleteSale(${sale.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function handleSaleFormSubmission(e) {
    e.preventDefault();
    
    const propertyId = parseInt(document.getElementById('saleProperty').value, 10);
    const clientCPF = document.getElementById('saleClientCPF').value;
    
    if (!propertyId) {
        showMessage('Selecione um imóvel.', 'error');
        return;
    }
    
    if (!isValidCPF(clientCPF)) {
        showMessage('CPF inválido. Verifique o número digitado.', 'error');
        return;
    }
    
    const property = properties.find(p => p.id === propertyId);
    
    const saleData = {
        propertyId,
        propertyTitle: property?.title || 'Imóvel',
        unitCode: document.getElementById('saleUnitCode').value || null,
        clientName: document.getElementById('saleClientName').value,
        clientCPF: clientCPF,
        clientEmail: document.getElementById('saleClientEmail').value,
        clientPhone: document.getElementById('saleClientPhone').value,
        salePrice: document.getElementById('salePrice').value,
        contractNumber: document.getElementById('saleContractNumber').value
    };
    
    if (typeof addPropertySale === 'function') {
        addPropertySale(saleData);
        showMessage('Venda registrada com sucesso!', 'success');
        e.target.reset();
        renderSalesTable();
    } else {
        showMessage('Erro ao registrar venda. Verifique o sistema.', 'error');
    }
}

function deleteSale(saleId) {
    if (!confirm('Deseja remover esta venda?')) return;
    
    const sales = getSalesData();
    const updated = sales.filter(sale => sale.id !== saleId);
    localStorage.setItem('propertySales', JSON.stringify(updated));
    
    showMessage('Venda removida com sucesso!', 'success');
    renderSalesTable();
}

// Show section
function showSection(sectionId) {
    // Update navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    const navLink = document.querySelector(`.nav-item a[href="#${sectionId}"]`) || 
                    document.querySelector(`[onclick*="showSection('${sectionId}')"]`);
    if (navLink) navLink.closest('.nav-item')?.classList.add('active');
    
    // Update sections
    document.querySelectorAll('.admin-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(sectionId).classList.add('active');
    
    currentSection = sectionId;
    
    // Load section data
    switch (sectionId) {
        case 'dashboard':
            loadDashboardData();
            break;
        case 'properties':
            loadPropertiesData();
            break;
        case 'reservations':
            loadReservationsData();
            break;
        case 'sales':
            loadSalesData();
            break;
        case 'brokers':
            loadBrokersData();
            break;
        case 'reports':
            loadReportsData();
            break;
        case 'notifications':
            loadNotificationsData();
            break;
        case 'settings':
            loadSettingsData();
            break;
        case 'analytics':
            if (typeof loadAnalytics === 'function') loadAnalytics();
            break;
        case 'whatsapp-leads':
            if (typeof loadWhatsAppLeads === 'function') loadWhatsAppLeads();
            break;
    }
}

// Load dashboard data
function loadDashboardData() {
    const stats = getPropertyStatistics();
    const activeBrokers = getActiveBrokers().length;
    
    // Update stats cards
    document.getElementById('totalProperties').textContent = stats.total;
    document.getElementById('availableProperties').textContent = stats.available;
    document.getElementById('reservedProperties').textContent = stats.reserved;
    document.getElementById('soldProperties').textContent = stats.sold;
    document.getElementById('totalBrokers').textContent = activeBrokers;
    document.getElementById('totalValue').textContent = `R$ ${stats.totalValue.toLocaleString('pt-BR')}`;
    
    // Load recent activity
    loadRecentActivity();
    
    // Load expiring reservations
    loadExpiringReservations();
}

// Load recent activity
function loadRecentActivity() {
    const container = document.getElementById('recentActivity');
    if (!container) return;
    
    // Sample activity data - replace with real data
    const activities = [
        {
            type: 'property',
            icon: 'fas fa-home',
            text: 'Novo imóvel adicionado: Apartamento Vista Mar',
            time: '2 horas atrás'
        },
        {
            type: 'reservation',
            icon: 'fas fa-calendar-check',
            text: 'Nova reserva por João Silva',
            time: '4 horas atrás'
        },
        {
            type: 'sale',
            icon: 'fas fa-handshake',
            text: 'Venda concluída: Casa Condomínio',
            time: '1 dia atrás'
        }
    ];
    
    container.innerHTML = activities.map(activity => `
        <div class="activity-item">
            <div class="activity-icon ${activity.type}">
                <i class="${activity.icon}"></i>
            </div>
            <div class="activity-text">
                <p>${activity.text}</p>
                <small>${activity.time}</small>
            </div>
        </div>
    `).join('');
}

// Load expiring reservations
function loadExpiringReservations() {
    const container = document.getElementById('expiringReservations');
    if (!container) return;
    
    const activeReservations = getActiveReservations();
    const expiringReservations = activeReservations.filter(reservation => {
        const timeLeft = reservation.expiresAt.getTime() - Date.now();
        return timeLeft <= 24 * 60 * 60 * 1000; // 24 hours
    });
    
    if (expiringReservations.length === 0) {
        container.innerHTML = '<p class="empty-message">Nenhuma reserva expirando em breve.</p>';
        return;
    }
    
    container.innerHTML = expiringReservations.map(reservation => {
        const property = getPropertyById(reservation.propertyId);
        const timeLeft = formatTimeRemaining(reservation.expiresAt);
        
        return `
            <div class="activity-item">
                <div class="activity-icon reservation">
                    <i class="fas fa-clock"></i>
                </div>
                <div class="activity-text">
                    <p>${property?.title || 'Imóvel não encontrado'}</p>
                    <small>${timeLeft}</small>
                </div>
            </div>
        `;
    }).join('');
}

// Load properties data
function loadPropertiesData() {
    const tbody = document.getElementById('propertiesTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = properties.map(property => `
        <tr>
            <td>${property.id}</td>
            <td>${property.title}</td>
            <td>${property.type}</td>
            <td>${property.location}</td>
            <td>R$ ${property.price.toLocaleString('pt-BR')}</td>
            <td><span class="status-badge status-${property.status}">${getStatusText(property.status)}</span></td>
            <td>
                <div class="action-buttons">
                    <button class="btn-action btn-view" onclick="viewProperty(${property.id})">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-action btn-edit" onclick="editProperty(${property.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-action btn-delete" onclick="deletePropertyAdmin(${property.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Filter admin properties
function filterAdminProperties() {
    const typeFilter = document.getElementById('adminTypeFilter').value;
    const statusFilter = document.getElementById('adminStatusFilter').value;
    const searchFilter = document.getElementById('adminSearchInput').value.toLowerCase();
    
    const filtered = properties.filter(property => {
        const matchesType = !typeFilter || property.type === typeFilter;
        const matchesStatus = !statusFilter || property.status === statusFilter;
        const matchesSearch = !searchFilter || 
            property.title.toLowerCase().includes(searchFilter) ||
            property.location.toLowerCase().includes(searchFilter);
        
        return matchesType && matchesStatus && matchesSearch;
    });
    
    displayFilteredProperties(filtered);
}

// Display filtered properties
function displayFilteredProperties(filteredProperties) {
    const tbody = document.getElementById('propertiesTableBody');
    if (!tbody) return;
    
    if (filteredProperties.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-message">Nenhum imóvel encontrado.</td></tr>';
        return;
    }
    
    tbody.innerHTML = filteredProperties.map(property => `
        <tr>
            <td>${property.id}</td>
            <td>${property.title}</td>
            <td>${property.type}</td>
            <td>${property.location}</td>
            <td>R$ ${property.price.toLocaleString('pt-BR')}</td>
            <td><span class="status-badge status-${property.status}">${getStatusText(property.status)}</span></td>
            <td>
                <div class="action-buttons">
                    <button class="btn-action btn-view" onclick="viewProperty(${property.id})">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-action btn-edit" onclick="editProperty(${property.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-action btn-delete" onclick="deletePropertyAdmin(${property.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Get status text
function getStatusText(status) {
    const statusMap = {
        'disponivel': 'Disponível',
        'reservado': 'Reservado',
        'vendido': 'Vendido',
        'ativo': 'Ativo',
        'inativo': 'Inativo',
        'active': 'Ativa',
        'expired': 'Expirada',
        'cancelled': 'Cancelada'
    };
    return statusMap[status] || status;
}

// Show add property modal
function showAddPropertyModal() {
    editingProperty = null;
    document.getElementById('propertyModalTitle').textContent = 'Adicionar Imóvel';
    createPropertyForm();
    document.getElementById('propertyModal').style.display = 'block';
}

// Edit property
function editProperty(propertyId) {
    editingProperty = getPropertyById(propertyId);
    if (!editingProperty) return;
    
    document.getElementById('propertyModalTitle').textContent = 'Editar Imóvel';
    createPropertyForm(editingProperty);
    document.getElementById('propertyModal').style.display = 'block';
}

// View property
function viewProperty(propertyId) {
    const property = getPropertyById(propertyId);
    if (!property) return;
    
    // In a real application, show detailed view
    alert(`Visualizar imóvel: ${property.title}`);
}

// Delete property (admin)
function deletePropertyAdmin(propertyId) {
    deleteProperty(propertyId);
    loadPropertiesData();
}

// Create property form
function createPropertyForm(property = null) {
    const form = document.getElementById('propertyForm');
    
    form.innerHTML = `
        <div class="form-section">
            <h4>Informações Básicas</h4>
        </div>
        
        <div class="form-group">
            <label>Título:</label>
            <input type="text" name="title" value="${property?.title || ''}" required>
        </div>
        
        <div class="form-group">
            <label>Tipo:</label>
            <select name="type" required>
                <option value="">Selecione</option>
                <option value="apartamento" ${property?.type === 'apartamento' ? 'selected' : ''}>Apartamento</option>
                <option value="casa" ${property?.type === 'casa' ? 'selected' : ''}>Casa</option>
                <option value="cobertura" ${property?.type === 'cobertura' ? 'selected' : ''}>Cobertura</option>
            </select>
        </div>
        
        <div class="form-group full-width">
            <label>Localização:</label>
            <input type="text" name="location" value="${property?.location || ''}" required>
        </div>
        
        <div class="form-group">
            <label>Preço (R$):</label>
            <input type="number" name="price" value="${property?.price || ''}" min="0" step="1000" required>
        </div>
        
        <div class="form-group">
            <label>Área (m²):</label>
            <input type="number" name="area" value="${property?.area || ''}" min="0" step="0.1" required>
        </div>
        
        <div class="form-group">
            <label>Quartos:</label>
            <input type="number" name="bedrooms" value="${property?.bedrooms || ''}" min="0" required>
        </div>
        
        <div class="form-group">
            <label>Banheiros:</label>
            <input type="number" name="bathrooms" value="${property?.bathrooms || ''}" min="0" required>
        </div>
        
        <div class="form-group">
            <label>Vagas:</label>
            <input type="number" name="parking" value="${property?.parking || 0}" min="0">
        </div>
        
        <div class="form-group">
            <label>Status:</label>
            <select name="status">
                <option value="disponivel" ${property?.status === 'disponivel' ? 'selected' : ''}>Disponível</option>
                <option value="reservado" ${property?.status === 'reservado' ? 'selected' : ''}>Reservado</option>
                <option value="vendido" ${property?.status === 'vendido' ? 'selected' : ''}>Vendido</option>
            </select>
        </div>
        
        <div class="form-section">
            <h4>Descrição</h4>
        </div>
        
        <div class="form-group full-width">
            <label>Descrição:</label>
            <textarea name="description" rows="4" required>${property?.description || ''}</textarea>
        </div>
        
        <div class="form-section">
            <h4>Características</h4>
        </div>
        
        <div class="form-group full-width">
            <label>Características:</label>
            <div class="features-input">
                <input type="text" id="featureInput" placeholder="Digite uma característica">
                <button type="button" class="add-feature" onclick="addFeature()">Adicionar</button>
            </div>
            <div class="features-list" id="featuresList">
                ${(property?.features || []).map(feature => `
                    <span class="feature-tag">
                        ${feature}
                        <button type="button" class="remove-feature" onclick="removeFeature(this)">×</button>
                    </span>
                `).join('')}
            </div>
        </div>
        
        <div class="form-section">
            <h4>Ações</h4>
        </div>
        
        <div class="form-group full-width" style="display: flex; gap: 10px; justify-content: end;">
            <button type="button" class="btn btn-secondary" onclick="closePropertyModal()">Cancelar</button>
            <button type="submit" class="btn btn-primary">${property ? 'Atualizar' : 'Adicionar'} Imóvel</button>
        </div>
    `;
    
    // Setup form submission
    form.onsubmit = function(e) {
        e.preventDefault();
        handlePropertyFormSubmission(e);
    };
}

// Add feature
function addFeature() {
    const input = document.getElementById('featureInput');
    const featuresList = document.getElementById('featuresList');
    
    if (input.value.trim()) {
        const featureTag = document.createElement('span');
        featureTag.className = 'feature-tag';
        featureTag.innerHTML = `
            ${input.value.trim()}
            <button type="button" class="remove-feature" onclick="removeFeature(this)">×</button>
        `;
        featuresList.appendChild(featureTag);
        input.value = '';
    }
}

// Remove feature
function removeFeature(button) {
    button.parentElement.remove();
}

// Handle property form submission
function handlePropertyFormSubmission(e) {
    const formData = new FormData(e.target);
    
    // Collect features
    const features = Array.from(document.querySelectorAll('.feature-tag')).map(tag => 
        tag.textContent.replace('×', '').trim()
    );
    
    const propertyData = {
        title: formData.get('title'),
        type: formData.get('type'),
        location: formData.get('location'),
        price: parseFloat(formData.get('price')),
        area: parseFloat(formData.get('area')),
        bedrooms: parseInt(formData.get('bedrooms')),
        bathrooms: parseInt(formData.get('bathrooms')),
        parking: parseInt(formData.get('parking')) || 0,
        status: formData.get('status'),
        description: formData.get('description'),
        features: features,
        images: editingProperty?.images || ['assets/images/placeholder.jpg'],
        videos: editingProperty?.videos || []
    };
    
    // Validate data
    const errors = validatePropertyData(propertyData);
    if (errors.length > 0) {
        alert('Erros encontrados:\n' + errors.join('\n'));
        return;
    }
    
    if (editingProperty) {
        // Update existing property
        updateProperty(editingProperty.id, propertyData);
        showMessage('Imóvel atualizado com sucesso!', 'success');
    } else {
        // Add new property
        addProperty(propertyData);
        showMessage('Imóvel adicionado com sucesso!', 'success');
    }
    
    closePropertyModal();
    loadPropertiesData();
}

// Close property modal
function closePropertyModal() {
    document.getElementById('propertyModal').style.display = 'none';
    editingProperty = null;
}

// Load reservations data
function loadReservationsData() {
    const tbody = document.getElementById('reservationsTableBody');
    if (!tbody) return;
    
    const allReservations = getAllReservations();
    
    tbody.innerHTML = allReservations.map(reservation => {
        const property = getPropertyById(reservation.propertyId);
        const broker = brokers.find(b => b.id === reservation.brokerId);
        
        return `
            <tr>
                <td>${reservation.id}</td>
                <td>${property?.title || 'N/A'}</td>
                <td>${broker?.name || 'N/A'}</td>
                <td>${reservation.clientInfo?.name || 'N/A'}</td>
                <td>${formatDate(reservation.createdAt)}</td>
                <td>${formatDate(reservation.expiresAt)}</td>
                <td><span class="status-badge status-${reservation.status}">${getStatusText(reservation.status)}</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-action btn-view" onclick="viewReservation('${reservation.id}')">
                            <i class="fas fa-eye"></i>
                        </button>
                        ${reservation.status === 'active' ? `
                            <button class="btn-action btn-delete" onclick="cancelReservationAdmin('${reservation.id}')">
                                <i class="fas fa-times"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// View reservation
function viewReservation(reservationId) {
    const reservation = reservations.find(r => r.id === reservationId);
    if (!reservation) return;
    
    const property = getPropertyById(reservation.propertyId);
    const broker = brokers.find(b => b.id === reservation.brokerId);
    
    const details = `
        Reserva: ${reservation.id}
        Imóvel: ${property?.title}
        Corretor: ${broker?.name}
        Cliente: ${reservation.clientInfo?.name}
        Email: ${reservation.clientInfo?.email}
        Telefone: ${reservation.clientInfo?.phone}
        CPF: ${reservation.clientInfo?.cpf}
        Status: ${getStatusText(reservation.status)}
        Criada em: ${formatDate(reservation.createdAt)}
        Expira em: ${formatDate(reservation.expiresAt)}
    `;
    
    alert(details);
}

// Cancel reservation (admin)
function cancelReservationAdmin(reservationId) {
    if (confirm('Tem certeza que deseja cancelar esta reserva?')) {
        cancelReservation(reservationId);
        loadReservationsData();
    }
}

// Load brokers data
async function loadBrokersData() {
    const tbody = document.getElementById('brokersTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;">Carregando corretores...</td></tr>';
    
    if (typeof loadBrokersFromFirestore === 'function') {
        await loadBrokersFromFirestore();
    }
    
    const allBrokers = getAllBrokers();
    
    const brokerId = (id) => typeof id === 'string' ? `'${id.replace(/'/g, "\\'")}'` : id;
    tbody.innerHTML = allBrokers.map(broker => `
        <tr>
            <td>${broker.id}</td>
            <td>${broker.name || broker.email}</td>
            <td>${broker.email}</td>
            <td>${broker.phone || ''}</td>
            <td>${broker.creci || ''}</td>
            <td><span class="status-badge status-${broker.isActive ? 'ativo' : 'inativo'}">${broker.isActive ? 'Ativo' : 'Inativo'}</span></td>
            <td>${formatDate(broker.createdAt)}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn-action btn-edit" onclick="editBroker(${brokerId(broker.id)})">
                        <i class="fas fa-edit"></i>
                    </button>
                    ${!broker.isActive ? `
                        <button class="btn-action btn-approve" onclick="approveBroker(${brokerId(broker.id)})">
                            <i class="fas fa-check"></i>
                        </button>
                    ` : `
                        <button class="btn-action btn-delete" onclick="deactivateBroker(${brokerId(broker.id)})">
                            <i class="fas fa-ban"></i>
                        </button>
                    `}
                </div>
            </td>
        </tr>
    `).join('');
}

// Show add broker modal
function showAddBrokerModal() {
    editingBroker = null;
    document.getElementById('brokerModalTitle').textContent = 'Adicionar Corretor';
    createBrokerForm();
    document.getElementById('brokerModal').style.display = 'block';
}

// Edit broker
function editBroker(brokerId) {
    editingBroker = typeof findBrokerById === 'function' ? findBrokerById(brokerId) : brokers.find(b => String(b.id) === String(brokerId));
    if (!editingBroker) return;
    
    document.getElementById('brokerModalTitle').textContent = 'Editar Corretor';
    createBrokerForm(editingBroker);
    document.getElementById('brokerModal').style.display = 'block';
}

// Create broker form
function createBrokerForm(broker = null) {
    const form = document.getElementById('brokerForm');
    
    form.innerHTML = `
        <div class="form-group">
            <label>Nome Completo:</label>
            <input type="text" name="name" value="${broker?.name || ''}" placeholder="Opcional">
        </div>
        
        <div class="form-group">
            <label>Email:</label>
            <input type="email" name="email" value="${broker?.email || ''}" required>
        </div>

        <div class="form-group">
            <label>CPF:</label>
            <input type="text" name="cpf" value="${broker?.cpf || ''}" placeholder="000.000.000-00 (opcional)">
        </div>
        
        <div class="form-group">
            <label>Telefone:</label>
            <input type="tel" name="phone" value="${broker?.phone || ''}" placeholder="Opcional">
        </div>
        
        <div class="form-group">
            <label>CRECI:</label>
            <input type="text" name="creci" value="${broker?.creci || ''}" placeholder="Opcional">
        </div>
        
        ${!editingBroker ? `
            <div class="form-group">
                <label>Senha:</label>
                <input type="password" name="password" required>
            </div>
        ` : ''}
        
        <div class="form-group">
            <label>Status:</label>
            <select name="isActive">
                <option value="true" ${broker?.isActive ? 'selected' : ''}>Ativo</option>
                <option value="false" ${!broker?.isActive ? 'selected' : ''}>Inativo</option>
            </select>
        </div>
        
        <div style="display: flex; gap: 10px; justify-content: end;">
            <button type="button" class="btn btn-secondary" onclick="closeBrokerModal()">Cancelar</button>
            <button type="submit" class="btn btn-primary">${broker ? 'Atualizar' : 'Adicionar'} Corretor</button>
        </div>
    `;
    
    // Setup form submission
    form.onsubmit = function(e) {
        e.preventDefault();
        handleBrokerFormSubmission(e);
    };
}

// Handle broker form submission
async function handleBrokerFormSubmission(e) {
    const formData = new FormData(e.target);
    
    const brokerData = {
        name: formData.get('name') || formData.get('email'),
        cpf: (formData.get('cpf') || '').replace(/\D/g, ''),
        email: formData.get('email'),
        phone: formData.get('phone') || '',
        creci: formData.get('creci') || '',
        isActive: formData.get('isActive') === 'true'
    };
    
    if (!editingBroker) {
        brokerData.password = formData.get('password');
        brokerData.id = brokers.length + 1;
        brokerData.createdAt = new Date();
        
        if (brokers.find(b => b.email === brokerData.email)) {
            alert('Este email já está cadastrado.');
            return;
        }
        
        if (brokerData.creci && brokers.find(b => b.creci === brokerData.creci)) {
            alert('Este CRECI já está cadastrado.');
            return;
        }
        
        if (typeof saveBrokerToFirestore === 'function') {
            try {
                const docId = await saveBrokerToFirestore(brokerData);
                if (docId) brokerData.id = docId;
            } catch (err) { console.error('Erro ao salvar no Firestore:', err); }
        }
        
        brokers.push(brokerData);
        if (typeof saveBrokersToStorage === 'function') saveBrokersToStorage();
        showMessage('Corretor adicionado com sucesso!', 'success');
    } else {
        Object.assign(editingBroker, brokerData);
        if (typeof updateBrokerInFirestore === 'function' && typeof editingBroker.id === 'string') {
            try {
                await updateBrokerInFirestore(editingBroker.id, brokerData);
            } catch (err) { console.error('Erro ao atualizar no Firestore:', err); }
        }
        if (typeof saveBrokersToStorage === 'function') saveBrokersToStorage();
        showMessage('Corretor atualizado com sucesso!', 'success');
    }
    
    closeBrokerModal();
    loadBrokersData();
}

// Close broker modal
function closeBrokerModal() {
    document.getElementById('brokerModal').style.display = 'none';
    editingBroker = null;
}

// Load reports data
function loadReportsData() {
    // In a real application, generate charts and reports
    console.log('Loading reports data...');
}

// Load settings data
function loadSettingsData() {
    // Load current settings
    const companyName = localStorage.getItem('companyName') || 'Construtora Premium';
    const contactEmail = localStorage.getItem('contactEmail') || 'contato@construtorapremium.com';
    const contactPhone = localStorage.getItem('contactPhone') || '(11) 99999-9999';
    const reservationHours = localStorage.getItem('reservationHours') || '48';
    const maxReservations = localStorage.getItem('maxReservations') || '5';
    
    document.getElementById('companyName').value = companyName;
    document.getElementById('contactEmail').value = contactEmail;
    document.getElementById('contactPhone').value = contactPhone;
    document.getElementById('reservationHours').value = reservationHours;
    document.getElementById('maxReservations').value = maxReservations;
}

// Save general settings
function saveGeneralSettings(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    
    localStorage.setItem('companyName', formData.get('companyName'));
    localStorage.setItem('contactEmail', formData.get('contactEmail'));
    localStorage.setItem('contactPhone', formData.get('contactPhone'));
    
    showMessage('Configurações gerais salvas com sucesso!', 'success');
}

// Save reservation settings
function saveReservationSettings(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    
    localStorage.setItem('reservationHours', formData.get('reservationHours'));
    localStorage.setItem('maxReservations', formData.get('maxReservations'));
    
    showMessage('Configurações de reserva salvas com sucesso!', 'success');
}

// Export properties
function exportProperties() {
    exportPropertiesToCSV();
}

// Export reservations
function exportReservations() {
    const allReservations = getAllReservations();
    
    if (allReservations.length === 0) {
        showMessage('Não há reservas para exportar.', 'warning');
        return;
    }
    
    const csvData = allReservations.map(reservation => {
        const property = getPropertyById(reservation.propertyId);
        const broker = brokers.find(b => b.id === reservation.brokerId);
        
        return {
            'ID': reservation.id,
            'Imóvel': property?.title || 'N/A',
            'Corretor': broker?.name || 'N/A',
            'Cliente': reservation.clientInfo?.name || 'N/A',
            'Email Cliente': reservation.clientInfo?.email || 'N/A',
            'Telefone Cliente': reservation.clientInfo?.phone || 'N/A',
            'CPF Cliente': reservation.clientInfo?.cpf || 'N/A',
            'Status': getStatusText(reservation.status),
            'Data Criação': formatDate(reservation.createdAt),
            'Data Expiração': formatDate(reservation.expiresAt)
        };
    });
    
    const headers = Object.keys(csvData[0]);
    let csvContent = headers.join(',') + '\n';
    csvData.forEach(row => {
        const rowData = headers.map(header => `"${row[header]}"`).join(',');
        csvContent += rowData + '\n';
    });
    
    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `reservas_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showMessage('Arquivo CSV de reservas exportado com sucesso!', 'success');
}

// Exportar backup completo do sistema
function exportSystemBackup() {
    const backup = {
        generatedAt: new Date().toISOString(),
        data: {}
    };
    
    // Capturar todas as chaves do localStorage
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key);
        // Tenta parsear JSON para facilitar leitura
        let parsedValue = value;
        let isJson = false;
        try {
            parsedValue = JSON.parse(value);
            isJson = true;
        } catch (error) {
            parsedValue = value;
        }
        
        backup.data[key] = {
            value: parsedValue,
            isJson: isJson
        };
    }
    
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `backup_sistema_${new Date().toISOString().split('T')[0]}.json`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showMessage('Backup gerado com sucesso!', 'success');
}

// Importar backup do sistema
function importSystemBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!confirm('Deseja importar este backup? Isso substituirá os dados atuais.')) {
        event.target.value = '';
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const backup = JSON.parse(e.target.result);
            if (!backup.data) {
                throw new Error('Formato de backup inválido');
            }
            
            // Limpar localStorage atual
            localStorage.clear();
            
            // Restaurar dados
            Object.keys(backup.data).forEach(key => {
                const item = backup.data[key];
                if (item.isJson) {
                    localStorage.setItem(key, JSON.stringify(item.value));
                } else {
                    localStorage.setItem(key, item.value);
                }
            });
            
            showMessage('Backup importado com sucesso! Recarregue a página.', 'success');
            setTimeout(() => window.location.reload(), 1500);
        } catch (error) {
            console.error('Erro ao importar backup:', error);
            showMessage('Erro ao importar backup. Verifique o arquivo.', 'error');
        }
    };
    
    reader.readAsText(file);
    event.target.value = '';
}

// Refresh dashboard
function refreshDashboard() {
    loadDashboardData();
    showMessage('Dashboard atualizado!', 'success');
}

// Generate sales report
function generateSalesReport() {
    const startDate = document.getElementById('salesStartDate').value;
    const endDate = document.getElementById('salesEndDate').value;
    
    if (!startDate || !endDate) {
        alert('Por favor, selecione as datas de início e fim.');
        return;
    }
    
    // In a real application, generate actual sales report
    showMessage('Relatório de vendas gerado!', 'success');
}

// Load notifications data
function loadNotificationsData() {
    const container = document.getElementById('notificationsList');
    if (!container) return;
    
    const notifications = getAdminNotifications();
    
    if (notifications.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-bell-slash"></i>
                <h3>Nenhuma notificação</h3>
                <p>Você não tem notificações no momento.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = notifications.map(notification => `
        <div class="notification-item ${notification.status}" onclick="handleNotificationClick('${notification.id}')">
            <div class="notification-header">
                <h4 class="notification-title">${notification.title}</h4>
                <span class="notification-time">${formatTimeAgo(notification.createdAt)}</span>
            </div>
            <div class="notification-message">${notification.message}</div>
            ${notification.status === 'pending' ? `
                <div class="notification-actions">
                    ${getNotificationActions(notification)}
                </div>
            ` : ''}
        </div>
    `).join('');
}

// Get notification actions based on type
function getNotificationActions(notification) {
    switch (notification.type) {
        case 'reservation_request':
            return `
                <button class="btn-action btn-approve" onclick="event.stopPropagation(); approveReservationRequest('${notification.id}')">
                    <i class="fas fa-check"></i> Aprovar
                </button>
                <button class="btn-action btn-delete" onclick="event.stopPropagation(); showRejectReservationModal('${notification.id}')">
                    <i class="fas fa-times"></i> Rejeitar
                </button>
            `;
        case 'reservation_expiring':
            return `
                <button class="btn-action btn-approve" onclick="event.stopPropagation(); handleReservationExpiration('${notification.id}', 'extend')">
                    <i class="fas fa-clock"></i> Estender
                </button>
                <button class="btn-action btn-delete" onclick="event.stopPropagation(); handleReservationExpiration('${notification.id}', 'expire')">
                    <i class="fas fa-times"></i> Expirar
                </button>
            `;
        case 'document_request':
            return `
                <button class="btn-action btn-approve" onclick="event.stopPropagation(); approveDocumentAccess('${notification.id}')">
                    <i class="fas fa-key"></i> Liberar Acesso
                </button>
                <button class="btn-action btn-delete" onclick="event.stopPropagation(); rejectDocumentAccess('${notification.id}')">
                    <i class="fas fa-ban"></i> Negar
                </button>
            `;
        default:
            return `
                <button class="btn-action btn-view" onclick="event.stopPropagation(); markNotificationAsRead('${notification.id}')">
                    <i class="fas fa-check"></i> Marcar como Lida
                </button>
            `;
    }
}

// Handle notification click
function handleNotificationClick(notificationId) {
    const notification = adminNotifications.find(n => n.id === notificationId);
    if (!notification) return;
    
    // Mark as read if pending
    if (notification.status === 'pending') {
        markNotificationAsRead(notificationId);
    }
    
    // Show detailed view
    showNotificationDetails(notification);
}

// Show notification details
function showNotificationDetails(notification) {
    const modal = document.getElementById('notificationActionModal');
    const content = document.getElementById('notificationActionContent');
    
    content.innerHTML = `
        <h2>${notification.title}</h2>
        <div class="notification-detail">
            <p><strong>Tipo:</strong> ${getNotificationTypeName(notification.type)}</p>
            <p><strong>Data:</strong> ${formatDate(notification.createdAt)}</p>
            <p><strong>Status:</strong> ${getStatusText(notification.status)}</p>
            
            <div class="notification-message">
                <h4>Mensagem:</h4>
                <p>${notification.message}</p>
            </div>
            
            ${notification.data ? `
                <div class="notification-data">
                    <h4>Detalhes:</h4>
                    ${formatNotificationData(notification)}
                </div>
            ` : ''}
            
            ${notification.status === 'pending' ? `
                <div class="notification-actions">
                    <h4>Ações:</h4>
                    ${getNotificationActions(notification)}
                </div>
            ` : ''}
        </div>
    `;
    
    modal.style.display = 'block';
}

// Format notification data
function formatNotificationData(notification) {
    const data = notification.data;
    let html = '';
    
    switch (notification.type) {
        case 'reservation_request':
            html = `
                <p><strong>Imóvel:</strong> ${data.propertyTitle}</p>
                <p><strong>Corretor:</strong> ${data.brokerName}</p>
                <p><strong>Cliente:</strong> ${data.clientName}</p>
                <p><strong>CPF:</strong> ${data.clientCPF}</p>
                <p><strong>Telefone:</strong> ${data.clientPhone}</p>
            `;
            break;
        case 'reservation_expiring':
            html = `
                <p><strong>Imóvel:</strong> ${data.propertyTitle}</p>
                <p><strong>Corretor:</strong> ${data.brokerName}</p>
                <p><strong>Expira em:</strong> ${formatDate(data.expiresAt)}</p>
            `;
            break;
        case 'document_request':
            html = `
                <p><strong>Imóvel:</strong> ${data.propertyTitle}</p>
                <p><strong>Corretor:</strong> ${data.brokerName}</p>
            `;
            break;
    }
    
    return html;
}

// Get notification type name
function getNotificationTypeName(type) {
    const types = {
        'reservation_request': 'Solicitação de Reserva',
        'reservation_expiring': 'Reserva Expirando',
        'document_request': 'Solicitação de Documentos',
        'broker_access': 'Solicitação de Acesso'
    };
    return types[type] || type;
}

// Format time ago
function formatTimeAgo(date) {
    const now = new Date();
    const diffInMinutes = Math.floor((now - date) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Agora mesmo';
    if (diffInMinutes < 60) return `${diffInMinutes}m atrás`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h atrás`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d atrás`;
    
    return formatDate(date);
}

// Show notifications panel
function showNotificationsPanel() {
    const panel = document.getElementById('notificationsPanel');
    const content = document.getElementById('notificationsPanelContent');
    
    const recentNotifications = getAdminNotifications('pending').slice(0, 5);
    
    if (recentNotifications.length === 0) {
        content.innerHTML = '<p class="no-notifications">Nenhuma notificação pendente.</p>';
    } else {
        content.innerHTML = recentNotifications.map(notification => `
            <div class="notification-item pending" onclick="handleNotificationClick('${notification.id}')">
                <div class="notification-header">
                    <h5 class="notification-title">${notification.title}</h5>
                    <span class="notification-time">${formatTimeAgo(notification.createdAt)}</span>
                </div>
                <div class="notification-message">${notification.message}</div>
            </div>
        `).join('');
    }
    
    panel.style.display = 'block';
    panel.classList.add('slide-in');
}

// Close notifications panel
function closeNotificationsPanel() {
    const panel = document.getElementById('notificationsPanel');
    panel.style.display = 'none';
    panel.classList.remove('slide-in');
}

// Close notification action modal
function closeNotificationActionModal() {
    document.getElementById('notificationActionModal').style.display = 'none';
}

// Filter notifications
function filterNotifications(filter) {
    // Update filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    const container = document.getElementById('notificationsList');
    let filteredNotifications;
    
    if (filter === 'all') {
        filteredNotifications = getAdminNotifications();
    } else if (filter === 'pending') {
        filteredNotifications = getAdminNotifications('pending');
    } else {
        filteredNotifications = adminNotifications.filter(n => n.type === filter);
    }
    
    if (filteredNotifications.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-bell-slash"></i>
                <h3>Nenhuma notificação encontrada</h3>
                <p>Não há notificações para este filtro.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filteredNotifications.map(notification => `
        <div class="notification-item ${notification.status}" onclick="handleNotificationClick('${notification.id}')">
            <div class="notification-header">
                <h4 class="notification-title">${notification.title}</h4>
                <span class="notification-time">${formatTimeAgo(notification.createdAt)}</span>
            </div>
            <div class="notification-message">${notification.message}</div>
            ${notification.status === 'pending' ? `
                <div class="notification-actions">
                    ${getNotificationActions(notification)}
                </div>
            ` : ''}
        </div>
    `).join('');
}

// Mark all notifications as read
function markAllNotificationsRead() {
    const pendingNotifications = getAdminNotifications('pending');
    
    pendingNotifications.forEach(notification => {
        notification.status = 'read';
        notification.readAt = new Date();
    });
    
    saveNotifications();
    updateNotificationBadge();
    loadNotificationsData();
    
    showMessage('Todas as notificações foram marcadas como lidas.', 'success');
}

// Show reject reservation modal
function showRejectReservationModal(notificationId) {
    const reason = prompt('Motivo da rejeição (opcional):');
    if (reason !== null) {
        rejectReservationRequest(notificationId, reason);
        loadNotificationsData();
        updateNotificationBadge();
    }
}

// Reject document access
function rejectDocumentAccess(notificationId) {
    const notification = adminNotifications.find(n => n.id === notificationId);
    if (!notification) return;
    
    notification.status = 'rejected';
    notification.rejectedAt = new Date();
    
    saveNotifications();
    updateNotificationBadge();
    loadNotificationsData();
    
    showMessage('Acesso aos documentos negado.', 'warning');
}
