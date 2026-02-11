// Área do Cliente - Portal Completo

let currentClient = null;

const ADMIN_CLIENT = {
    email: 'brunoferreiramarques@gmail.com',
    password: '123456',
    name: 'Admin B F Marques'
};

// Abrir área do cliente
function openClientArea() {
    window.location.href = 'client-area.html';
}

// Fechar área do cliente
function closeClientArea() {
    document.getElementById('clientAreaModal').style.display = 'none';
}

// Mostrar tab do cliente
function showClientTab(tab) {
    document.querySelectorAll('.client-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    if (tab === 'login') {
        document.getElementById('clientLoginTab').classList.add('active');
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
    } else {
        document.getElementById('clientRegisterTab').classList.add('active');
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
    }
    
    document.getElementById('clientDashboard').style.display = 'none';
}

// Login do cliente
async function loginClient(event) {
    event.preventDefault();
    
    const login = document.getElementById('clientLogin').value;
    const password = document.getElementById('clientPassword').value;

    // Admin override
    if (login.toLowerCase() === ADMIN_CLIENT.email.toLowerCase() && password === ADMIN_CLIENT.password) {
        currentClient = {
            name: ADMIN_CLIENT.name,
            email: ADMIN_CLIENT.email,
            cpf: '00000000000',
            phone: '',
            properties: [],
            isAdmin: true
        };
        localStorage.setItem('currentClient', JSON.stringify(currentClient));
        showMessage('Login admin realizado com sucesso!', 'success');
        showClientDashboard();
        return;
    }

    // Firebase Auth (se disponível)
    if (typeof getFirebaseAuth === 'function' && firebaseAvailable()) {
        try {
            const auth = getFirebaseAuth();
            const userCredential = await auth.signInWithEmailAndPassword(login, password);
            const uid = userCredential.user.uid;
            
            let profile = null;
            if (typeof getClientProfileByUID === 'function') {
                profile = await getClientProfileByUID(uid);
            }
            
            if (!profile || !profile.cpf) {
                showMessage('Perfil não encontrado. Entre em contato com a empresa.', 'error');
                return;
            }
            
            // Validar CPF na base de vendas
            if (typeof getPropertySalesByEmail === 'function') {
                const sales = await getPropertySalesByEmail(profile.email);
                if (!sales || sales.length === 0) {
                    showMessage('CPF não encontrado em nossas vendas.', 'error');
                    return;
                }
                profile.properties = sales.map(sale => {
                    if (typeof saleToClientProperty !== 'undefined') {
                        return saleToClientProperty(sale);
                    }
                    return {
                        id: sale.id,
                        propertyId: sale.propertyId,
                        title: sale.propertyTitle,
                        price: sale.salePrice,
                        purchaseDate: sale.saleDate,
                        status: 'vendido'
                    };
                });
            }
            
            currentClient = { ...profile, uid };
            localStorage.setItem('currentClient', JSON.stringify(currentClient));
            showMessage('Login realizado com sucesso!', 'success');
            showClientDashboard();
            return;
        } catch (error) {
            console.error('Erro no login Firebase:', error);
            showMessage('Email ou senha incorretos.', 'error');
            return;
        }
    }
    
    // Buscar cliente no localStorage (apenas por email)
    const clients = JSON.parse(localStorage.getItem('clients') || '[]');
    const client = clients.find(c => 
        c.email.toLowerCase() === login.toLowerCase() && c.password === password
    );
    
    if (client) {
        // Verificar se CPF tem propriedade vendida
        if (typeof hasPropertySale !== 'undefined' && !hasPropertySale(client.cpf)) {
            showMessage('CPF não encontrado em nossas vendas. Entre em contato conosco.', 'error');
            return;
        }
        
        // Carregar propriedades do cliente baseado no CPF
        if (typeof getPropertiesByCPF !== 'undefined') {
            const sales = getPropertiesByCPF(client.cpf);
            if (sales && sales.length > 0) {
                client.properties = sales.map(sale => {
                    if (typeof saleToClientProperty !== 'undefined') {
                        return saleToClientProperty(sale);
                    }
                    return {
                        id: sale.id,
                        propertyId: sale.propertyId,
                        title: sale.propertyTitle,
                        price: sale.salePrice,
                        purchaseDate: sale.saleDate,
                        status: 'vendido'
                    };
                });
            }
        }
        
        currentClient = { ...client };
        delete currentClient.password; // Não armazenar senha na sessão
        localStorage.setItem('currentClient', JSON.stringify(currentClient));
        showMessage('Login realizado com sucesso!', 'success');
        showClientDashboard();
    } else {
        showMessage('Email ou senha incorretos.', 'error');
    }
}

// Registrar cliente
async function registerClient(event) {
    event.preventDefault();
    
    const name = document.getElementById('clientName').value;
    const cpf = document.getElementById('clientCPF').value.replace(/\D/g, '');
    const email = document.getElementById('clientEmail').value;
    const phone = document.getElementById('clientPhone').value.replace(/\D/g, '');
    const password = document.getElementById('clientRegPassword').value;
    
    // Validar CPF
    if (cpf.length !== 11) {
        showMessage('CPF inválido. Digite 11 dígitos.', 'error');
        return;
    }
    
    // Verificar se CPF tem propriedade vendida (Firebase ou local)
    if (typeof getPropertySalesByEmail === 'function' && firebaseAvailable()) {
        const sales = await getPropertySalesByEmail(email);
        if (!sales || sales.length === 0) {
            showMessage('CPF não encontrado em nossas vendas. Verifique o CPF ou entre em contato conosco.', 'error');
            return;
        }
    } else if (typeof hasPropertySale !== 'undefined' && !hasPropertySale(cpf)) {
        showMessage('CPF não encontrado em nossas vendas. Verifique o CPF ou entre em contato conosco.', 'error');
        return;
    }
    
    // Firebase Auth (se disponível)
    if (typeof getFirebaseAuth === 'function' && firebaseAvailable()) {
        try {
            const auth = getFirebaseAuth();
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const uid = userCredential.user.uid;
            
            let clientProperties = [];
            if (typeof getPropertySalesByEmail === 'function') {
                const sales = await getPropertySalesByEmail(email);
                clientProperties = sales.map(sale => {
                    if (typeof saleToClientProperty !== 'undefined') {
                        return saleToClientProperty(sale);
                    }
                    return {
                        id: sale.id,
                        propertyId: sale.propertyId,
                        title: sale.propertyTitle,
                        price: sale.salePrice,
                        purchaseDate: sale.saleDate,
                        status: 'vendido'
                    };
                });
            }
            
            const profile = {
                uid,
                name,
                cpf,
                email,
                phone,
                address: '',
                properties: clientProperties,
                documents: [],
                history: [],
                createdAt: new Date().toISOString()
            };
            
            if (typeof saveClientProfile === 'function') {
                await saveClientProfile(uid, profile);
            }
            
            currentClient = { ...profile };
            localStorage.setItem('currentClient', JSON.stringify(currentClient));
            showMessage('Cadastro realizado com sucesso!', 'success');
            showClientDashboard();
            addClientHistory('Cadastro realizado no sistema', 'system');
            return;
        } catch (error) {
            console.error('Erro no cadastro Firebase:', error);
            showMessage('Erro ao cadastrar. Verifique o email ou tente outra senha.', 'error');
            return;
        }
    }
    
    // Verificar se já existe (local)
    const clients = JSON.parse(localStorage.getItem('clients') || '[]');
    if (clients.find(c => c.cpf === cpf || c.email.toLowerCase() === email.toLowerCase())) {
        showMessage('CPF ou Email já cadastrado.', 'error');
        return;
    }
    
    // Carregar propriedades do cliente baseado no CPF
    let clientProperties = [];
    if (typeof getPropertiesByCPF !== 'undefined') {
        const sales = getPropertiesByCPF(cpf);
        if (sales && sales.length > 0) {
            clientProperties = sales.map(sale => {
                if (typeof saleToClientProperty !== 'undefined') {
                    return saleToClientProperty(sale);
                }
                return {
                    id: sale.id,
                    propertyId: sale.propertyId,
                    title: sale.propertyTitle,
                    price: sale.salePrice,
                    purchaseDate: sale.saleDate,
                    status: 'vendido'
                };
            });
        }
    }
    
    const newClient = {
        id: Date.now(),
        name,
        cpf,
        email,
        phone,
        password,
        address: '',
        properties: clientProperties,
        documents: [],
        history: [],
        createdAt: new Date().toISOString()
    };
    
    clients.push(newClient);
    localStorage.setItem('clients', JSON.stringify(clients));
    
    currentClient = { ...newClient };
    delete currentClient.password;
    localStorage.setItem('currentClient', JSON.stringify(currentClient));
    
    showMessage('Cadastro realizado com sucesso!', 'success');
    showClientDashboard();
    
    // Adicionar evento ao histórico
    addClientHistory('Cadastro realizado no sistema', 'system');
}

// Mostrar dashboard do cliente
function showClientDashboard() {
    document.querySelectorAll('.client-tab').forEach(t => t.style.display = 'none');
    document.getElementById('clientDashboard').style.display = 'block';
    
    // Atualizar informações
    document.getElementById('clientWelcomeName').textContent = `Bem-vindo, ${currentClient.name}!`;
    document.getElementById('clientWelcomeEmail').textContent = currentClient.email;
    
    // Carregar dados
    loadClientProperties();
    loadClientDocuments();
    loadClientHistory();
    loadClientProfile();
    
    showDashboardTab('properties');
}

// Mostrar tab do dashboard
function showDashboardTab(tab) {
    document.querySelectorAll('.dashboard-tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.dashboard-tab-btn').forEach(btn => btn.classList.remove('active'));
    
    const tabs = ['properties', 'documents', 'repairs', 'manual', 'newsletter', 'history', 'profile'];
    document.getElementById(`client${tab.charAt(0).toUpperCase() + tab.slice(1)}Tab`).classList.add('active');
    document.querySelectorAll('.dashboard-tab-btn')[tabs.indexOf(tab)].classList.add('active');
    
    // Carregar dados específicos da tab
    if (tab === 'repairs') {
        loadClientRepairs();
    }
}

// Funções auxiliares para o manual
function showWarrantyInfo() {
    showClientManual();
    setTimeout(() => {
        const warrantySection = document.querySelector('[id^="section-"]');
        if (warrantySection) {
            warrantySection.scrollIntoView({ behavior: 'smooth' });
        }
    }, 500);
}

function showFAQ() {
    showClientManual();
    setTimeout(() => {
        const faqSection = Array.from(document.querySelectorAll('[id^="section-"]')).find(section => 
            section.querySelector('.faq-item')
        );
        if (faqSection) {
            faqSection.scrollIntoView({ behavior: 'smooth' });
        }
    }, 500);
}

function showMaintenanceGuide() {
    showClientManual();
    setTimeout(() => {
        const maintenanceSection = Array.from(document.querySelectorAll('[id^="section-"]')).find(section => 
            section.querySelector('.maintenance-item')
        );
        if (maintenanceSection) {
            maintenanceSection.scrollIntoView({ behavior: 'smooth' });
        }
    }, 500);
}

// Carregar imóveis do cliente
function loadClientProperties() {
    const clientProperties = currentClient.properties || [];
    const propertiesList = document.getElementById('clientPropertiesList');
    
    if (clientProperties.length === 0) {
        propertiesList.innerHTML = '<p>Você ainda não possui imóveis cadastrados.</p>';
        return;
    }
    
    propertiesList.innerHTML = clientProperties.map(prop => `
        <div class="client-property-card">
            <h5>${prop.title || 'Imóvel'}</h5>
            <p><strong>Status:</strong> ${prop.status || 'Em análise'}</p>
            <p><strong>Valor:</strong> R$ ${(prop.price || 0).toLocaleString('pt-BR')}</p>
            <p><strong>Data de Aquisição:</strong> ${formatDate(prop.purchaseDate)}</p>
            ${prop.openPortion ? `<p><strong>Parcela Aberta:</strong> R$ ${prop.openPortion.toLocaleString('pt-BR')}</p>` : ''}
        </div>
    `).join('');
}

// Carregar documentos do cliente
function loadClientDocuments() {
    const documents = currentClient.documents || [];
    const documentsList = document.getElementById('clientDocumentsList');
    
    if (documents.length === 0) {
        documentsList.innerHTML = '<p>Nenhum documento disponível no momento.</p>';
        return;
    }
    
    documentsList.innerHTML = documents.map(doc => `
        <div class="client-document-card">
            <h5>${doc.name}</h5>
            <p><strong>Tipo:</strong> ${doc.type}</p>
            <p><strong>Data:</strong> ${formatDate(doc.date)}</p>
            <a href="${doc.url}" target="_blank" class="btn btn-primary">Baixar</a>
        </div>
    `).join('');
}

// Carregar histórico do cliente
function loadClientHistory() {
    const history = currentClient.history || [];
    const historyList = document.getElementById('clientHistoryList');
    
    if (history.length === 0) {
        historyList.innerHTML = '<p>Nenhum histórico disponível.</p>';
        return;
    }
    
    historyList.innerHTML = history.reverse().map(item => `
        <div class="client-history-item">
            <div class="history-icon">
                <i class="fas ${getHistoryIcon(item.type)}"></i>
            </div>
            <div class="history-content">
                <h5>${item.title}</h5>
                <p>${item.description}</p>
                <small>${formatDate(item.date)}</small>
            </div>
        </div>
    `).join('');
}

// Obter ícone do histórico
function getHistoryIcon(type) {
    const icons = {
        'system': 'fa-cog',
        'property': 'fa-home',
        'document': 'fa-file',
        'payment': 'fa-money-bill',
        'contact': 'fa-phone',
        'meeting': 'fa-calendar',
        'default': 'fa-circle'
    };
    return icons[type] || icons.default;
}

// Adicionar evento ao histórico
function addClientHistory(title, type, description = '') {
    if (!currentClient) return;
    
    const clients = JSON.parse(localStorage.getItem('clients') || '[]');
    const clientIndex = clients.findIndex(c => c.id === currentClient.id);
    
    if (clientIndex === -1) return;
    
    if (!clients[clientIndex].history) {
        clients[clientIndex].history = [];
    }
    
    clients[clientIndex].history.push({
        title,
        type,
        description,
        date: new Date().toISOString()
    });
    
    localStorage.setItem('clients', JSON.stringify(clients));
    
    // Atualizar cliente atual
    currentClient = clients[clientIndex];
    delete currentClient.password;
    localStorage.setItem('currentClient', JSON.stringify(currentClient));
    
    loadClientHistory();
}

// Carregar perfil do cliente
function loadClientProfile() {
    document.getElementById('profileName').value = currentClient.name || '';
    document.getElementById('profileCPF').value = formatCPF(currentClient.cpf || '');
    document.getElementById('profileEmail').value = currentClient.email || '';
    document.getElementById('profilePhone').value = formatPhone(currentClient.phone || '');
    document.getElementById('profileAddress').value = currentClient.address || '';
}

// Atualizar perfil do cliente
function updateClientProfile(event) {
    event.preventDefault();
    
    const clients = JSON.parse(localStorage.getItem('clients') || '[]');
    const clientIndex = clients.findIndex(c => c.id === currentClient.id);
    
    if (clientIndex === -1) return;
    
    clients[clientIndex].name = document.getElementById('profileName').value;
    clients[clientIndex].email = document.getElementById('profileEmail').value;
    clients[clientIndex].phone = document.getElementById('profilePhone').value.replace(/\D/g, '');
    clients[clientIndex].address = document.getElementById('profileAddress').value;
    
    localStorage.setItem('clients', JSON.stringify(clients));
    
    currentClient = clients[clientIndex];
    delete currentClient.password;
    localStorage.setItem('currentClient', JSON.stringify(currentClient));
    
    showMessage('Perfil atualizado com sucesso!', 'success');
    addClientHistory('Perfil atualizado', 'system', 'Dados pessoais foram atualizados');
}

// Logout do cliente
function logoutClient() {
    currentClient = null;
    localStorage.removeItem('currentClient');
    showMessage('Logout realizado com sucesso!', 'success');
    showClientTab('login');
}

// Formatar CPF
function formatCPF(cpf) {
    cpf = cpf.replace(/\D/g, '');
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

// Formatar telefone
function formatPhone(phone) {
    phone = phone.replace(/\D/g, '');
    if (phone.length === 11) {
        return phone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    } else if (phone.length === 10) {
        return phone.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    }
    return phone;
}

// Mostrar esqueci senha
function showForgotPassword() {
    showMessage('Entre em contato conosco para recuperar sua senha: (21) 99555-7010', 'info');
}

// Inicializar máscaras
document.addEventListener('DOMContentLoaded', function() {
    const cpfInput = document.getElementById('clientCPF');
    if (cpfInput) {
        cpfInput.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            value = value.replace(/(\d{3})(\d)/, '$1.$2');
            value = value.replace(/(\d{3})(\d)/, '$1.$2');
            value = value.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
            e.target.value = value;
        });
    }
    
    const phoneInput = document.getElementById('clientPhone');
    if (phoneInput) {
        phoneInput.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length <= 10) {
                value = value.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
            } else {
                value = value.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
            }
            e.target.value = value;
        });
    }
});

