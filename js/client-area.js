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
    document.querySelectorAll('.client-tab').forEach(t => { t.classList.remove('active'); t.style.display = 'none'; });
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    const tabsEl = document.querySelector('.client-area-tabs');
    const loginTab = document.getElementById('clientLoginTab');
    const forgotTab = document.getElementById('clientForgotTab');
    const changePwdTab = document.getElementById('clientChangePasswordTab');
    
    if (tab === 'login') {
        if (loginTab) { loginTab.classList.add('active'); loginTab.style.display = 'block'; }
        if (tabsEl) tabsEl.style.display = '';
        const btns = document.querySelectorAll('.client-area-tabs .tab-btn');
        if (btns[0]) btns[0].classList.add('active');
    } else if (tab === 'forgot') {
        if (forgotTab) { forgotTab.classList.add('active'); forgotTab.style.display = 'block'; }
        if (tabsEl) tabsEl.style.display = 'none';
    } else if (tab === 'changePassword' && changePwdTab) {
        if (changePwdTab) { changePwdTab.classList.add('active'); changePwdTab.style.display = 'block'; }
        if (tabsEl) tabsEl.style.display = 'none';
    }
    
    const dash = document.getElementById('clientDashboard');
    if (dash) dash.style.display = 'none';
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
            if (profile.mustChangePassword) {
                showMessage('Altere sua senha para continuar.', 'info');
                showClientTab('changePassword');
            } else {
                showMessage('Login realizado com sucesso!', 'success');
                showClientDashboard();
            }
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
    
    // Verificar se CPF/email tem propriedade vendida (sempre verifica localStorage como fallback)
    let hasSale = false;
    if (typeof hasPropertySale === 'function') {
        hasSale = hasPropertySale(cpf);
    }
    if (!hasSale && typeof getPropertySalesByEmail === 'function' && typeof firebaseAvailable === 'function' && firebaseAvailable()) {
        const salesByEmail = await getPropertySalesByEmail(email);
        hasSale = salesByEmail && salesByEmail.length > 0;
    }
    if (!hasSale) {
        showMessage('CPF/Email não encontrado em nossas vendas. Registre a venda no painel admin primeiro ou entre em contato conosco.', 'error');
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

            try {
                const notifBody = `
                    <h2>👤 Novo Cliente Cadastrado</h2>
                    <p><strong>Nome:</strong> ${name}</p>
                    <p><strong>CPF:</strong> ${cpf}</p>
                    <p><strong>Email:</strong> ${email}</p>
                    <p><strong>Telefone:</strong> ${phone}</p>
                    <p><strong>Data:</strong> ${new Date().toLocaleString('pt-BR')}</p>
                    <hr>
                    <p>O cliente se cadastrou na Área do Cliente do site.</p>
                `;
                if (typeof sendEmail === 'function') {
                    sendEmail('bfmarquesempreendimentos@gmail.com', 'Novo Cliente Cadastrado - ' + name, notifBody);
                }
                if (typeof sendClientRegistrationConfirmationEmail === 'function') {
                    sendClientRegistrationConfirmationEmail(profile).catch(e => console.error('Erro email boas-vindas:', e));
                }
            } catch (e) { console.error('Erro ao enviar notificação:', e); }

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
    
    var newClient = {
        id: Date.now(),
        name: name,
        cpf: cpf,
        email: email,
        phone: phone,
        password: password,
        address: '',
        properties: clientProperties,
        documents: [],
        history: [],
        createdAt: new Date().toISOString()
    };
    newClient.createdBy = { type: 'Cliente', email: email, name: name, at: new Date().toISOString() };
    clients.push(newClient);
    localStorage.setItem('clients', JSON.stringify(clients));

    try {
        const notifBody = `
            <h2>👤 Novo Cliente Cadastrado</h2>
            <p><strong>Nome:</strong> ${name}</p>
            <p><strong>CPF:</strong> ${cpf}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Telefone:</strong> ${phone}</p>
            <p><strong>Data:</strong> ${new Date().toLocaleString('pt-BR')}</p>
            <hr>
            <p>O cliente se cadastrou na Área do Cliente do site.</p>
        `;
        if (typeof sendEmail === 'function') {
            sendEmail('bfmarquesempreendimentos@gmail.com', 'Novo Cliente Cadastrado - ' + name, notifBody);
        }
        if (typeof sendClientRegistrationConfirmationEmail === 'function') {
            const clientForEmail = { name, email, cpf, phone };
            sendClientRegistrationConfirmationEmail(clientForEmail).catch(e => console.error('Erro email boas-vindas:', e));
        }
    } catch (e) { console.error('Erro ao enviar notificação:', e); }

    currentClient = { ...newClient };
    delete currentClient.password;
    localStorage.setItem('currentClient', JSON.stringify(currentClient));
    
    showMessage('Cadastro realizado com sucesso!', 'success');
    showClientDashboard();
    
    // Adicionar evento ao histórico
    addClientHistory('Cadastro realizado no sistema', 'system');
}

// Alterar senha no primeiro acesso
async function handleFirstLoginChangePassword(event) {
    event.preventDefault();
    const newPwd = document.getElementById('newPassword')?.value || '';
    const confirmPwd = document.getElementById('confirmNewPassword')?.value || '';
    if (newPwd.length < 6) {
        showMessage('A senha deve ter no mínimo 6 caracteres.', 'error');
        return;
    }
    if (newPwd !== confirmPwd) {
        showMessage('As senhas não coincidem.', 'error');
        return;
    }
    if (!getFirebaseAuth || !firebaseAvailable()) {
        showMessage('Erro ao alterar senha. Tente novamente.', 'error');
        return;
    }
    const auth = getFirebaseAuth();
    const user = auth.currentUser;
    if (!user) {
        showMessage('Sessão expirada. Faça login novamente.', 'error');
        showClientTab('login');
        return;
    }
    try {
        await user.updatePassword(newPwd);
        if (currentClient?.uid && typeof saveClientProfile === 'function') {
            await saveClientProfile(currentClient.uid, { mustChangePassword: false });
        }
        currentClient = currentClient ? { ...currentClient, mustChangePassword: false } : currentClient;
        localStorage.setItem('currentClient', JSON.stringify(currentClient));
        showMessage('Senha alterada com sucesso!', 'success');
        document.getElementById('clientChangePasswordForm')?.reset();
        showClientDashboard();
    } catch (err) {
        console.error('Erro ao alterar senha:', err);
        showMessage(err.message || 'Erro ao alterar senha. Tente novamente.', 'error');
    }
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

// Esqueci minha senha - Área do Cliente (fluxo completo com email)
function showClientForgotPassword() {
    showClientTab('forgot');
    const form = document.getElementById('clientForgotPasswordForm');
    if (form) {
        form.reset();
        const emailInput = document.getElementById('clientForgotEmail');
        const loginEmail = document.getElementById('clientLogin');
        if (emailInput && loginEmail && loginEmail.value) emailInput.value = loginEmail.value;
        form.onsubmit = (e) => { e.preventDefault(); handleClientForgotPasswordSubmit(); return false; };
    }
}

async function handleClientForgotPasswordSubmit() {
    const emailInput = document.getElementById('clientForgotEmail');
    const email = emailInput?.value?.trim();
    if (!email) {
        showMessage('Digite seu email.', 'error');
        return;
    }
    const basePath = window.location.pathname.replace(/\/[^/]*$/, '') || '';
    const baseUrl = window.location.origin + basePath;
    
    // 1. Tentar Firebase Auth (clientes que se cadastraram com Firebase)
    if (typeof getFirebaseAuth === 'function' && typeof firebaseAvailable === 'function' && firebaseAvailable()) {
        try {
            const auth = getFirebaseAuth();
            await auth.sendPasswordResetEmail(email);
            showClientTab('login');
            showMessage('Se o email estiver cadastrado, você receberá um link para redefinir sua senha. Verifique também a pasta de spam.', 'success');
            return;
        } catch (err) {
            if (err.code !== 'auth/user-not-found') {
                console.warn('Firebase sendPasswordResetEmail:', err);
            }
        }
    }
    
    // 2. Clientes em localStorage
    const clients = JSON.parse(localStorage.getItem('clients') || '[]');
    const client = clients.find(c => String(c.email).toLowerCase() === String(email).toLowerCase());
    if (!client) {
        showMessage('Email não encontrado. Se você se cadastrou com Firebase, verifique sua caixa de entrada.', 'error');
        return;
    }
    
    const token = 'RESET' + Date.now() + Math.random().toString(36).substr(2, 16).toUpperCase();
    if (typeof savePasswordResetToken === 'function') {
        try {
            await savePasswordResetToken(String(client.id), client.email, token, 'client');
        } catch (e) { console.error(e); }
    }
    
    const resetUrl = baseUrl + '/reset-password.html?token=' + encodeURIComponent(token) + '&type=client';
    const subject = 'Redefinir senha - B F Marques Empreendimentos';
    const body = `
        <h2>Olá, ${client.name || client.email}!</h2>
        <p>Você solicitou a redefinição da sua senha na Área do Cliente.</p>
        <p>Clique no link abaixo para criar uma nova senha (válido por 1 hora):</p>
        <p><a href="${resetUrl}" style="display:inline-block;background:#3498db;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;margin:10px 0;">Redefinir minha senha</a></p>
        <p>Ou copie e cole no navegador:</p>
        <p style="word-break:break-all;color:#666;">${resetUrl}</p>
        <p>Se você não solicitou esta alteração, ignore este email.</p>
        <p>Atenciosamente,<br><strong>B F Marques Empreendimentos</strong></p>
    `;
    if (typeof sendEmail === 'function') {
        try { await sendEmail(client.email, subject, body); } catch (e) { console.error('Erro ao enviar email:', e); }
    }
    
    showClientTab('login');
    showMessage('Se o email estiver cadastrado, você receberá um link para redefinir sua senha. Verifique também a pasta de spam.', 'success');
}

// Pré-carregar propertySales do servidor (Mac/fresh device - localStorage vazio)
function preloadClientDataFromServer() {
    var url = 'https://us-central1-site-interativo-b-f-marques.cloudfunctions.net/getPropertySales?t=' + Date.now();
    if (typeof fetch === 'function') {
        fetch(url).then(function(r) { return r.ok ? r.json() : []; }).then(function(sales) {
            if (sales && Array.isArray(sales) && sales.length > 0) {
                localStorage.setItem('propertySales', JSON.stringify(sales));
                if (typeof loadPropertySales === 'function') loadPropertySales();
            }
        }).catch(function() {
            if (typeof getAllPropertySalesFromFirestore === 'function' && typeof firebaseAvailable === 'function' && firebaseAvailable()) {
                getAllPropertySalesFromFirestore().then(function(s) {
                    if (s && s.length > 0) { localStorage.setItem('propertySales', JSON.stringify(s)); if (typeof loadPropertySales === 'function') loadPropertySales(); }
                }).catch(function() {});
            }
        });
    }
}

// Inicializar máscaras e restaurar sessão
document.addEventListener('DOMContentLoaded', function() {
    preloadClientDataFromServer();
    var saved = localStorage.getItem('currentClient');
    if (saved && document.getElementById('clientDashboard')) {
        try {
            currentClient = JSON.parse(saved);
            if (currentClient && currentClient.email) showClientDashboard();
        } catch (e) {}
    }
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

