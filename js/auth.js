// Authentication system for brokers

// Credenciais centralizadas - em produção, sobrescreva via config ou variáveis de ambiente
var DEMO_PASSWORD = (typeof CONFIG !== 'undefined' && CONFIG.auth && CONFIG.auth.demoPassword) ? CONFIG.auth.demoPassword : '123456';

var brokers = [
    { id: 1, name: 'João Silva', email: 'joao@construtora.com', phone: '(21) 99999-9999', creci: '12345-F', password: DEMO_PASSWORD, isActive: true, createdAt: new Date('2024-01-15') },
    { id: 2, name: 'Maria Santos', email: 'maria@construtora.com', phone: '(21) 88888-8888', creci: '67890-F', password: DEMO_PASSWORD, isActive: true, createdAt: new Date('2024-02-10') },
    { id: 3, name: 'Eduardo', email: 'sac1consultoria@gmail.com', phone: '', creci: '', password: DEMO_PASSWORD, isActive: true, createdAt: new Date('2024-01-01') }
];

var ADMIN_BROKER = {
    email: (typeof CONFIG !== 'undefined' && CONFIG.auth && CONFIG.auth.adminEmail) ? CONFIG.auth.adminEmail : 'brunoferreiramarques@gmail.com',
    password: DEMO_PASSWORD,
    name: 'Admin B F Marques',
    cpf: '',
    phone: '',
    creci: '',
    isActive: true,
    isAdmin: true
};

// Persistencia local dos corretores
function loadBrokersFromStorage() {
    const savedBrokers = localStorage.getItem('brokers');
    if (!savedBrokers) return;
    try {
        const parsed = JSON.parse(savedBrokers);
        if (Array.isArray(parsed) && parsed.length > 0) {
            brokers = parsed.map(broker => ({
                ...broker,
                createdAt: broker.createdAt ? new Date(broker.createdAt) : new Date()
            }));
        }
    } catch (error) {
        console.warn('Erro ao carregar corretores salvos:', error);
    }
}

function saveBrokersToStorage() {
    localStorage.setItem('brokers', JSON.stringify(brokers));
}

async function loadBrokersFromFirestore() {
    if (typeof getBrokersFromFirestore !== 'function') return false;
    try {
        const fromDb = await getBrokersFromFirestore();
        const local = JSON.parse(localStorage.getItem('brokers') || '[]').map(b => ({
            ...b,
            createdAt: b.createdAt ? new Date(b.createdAt) : new Date()
        }));
        const byEmail = {};
        local.forEach(b => { byEmail[(b.email || '').toLowerCase()] = b; });
        fromDb.forEach(b => { byEmail[(b.email || '').toLowerCase()] = b; });
        brokers = Object.values(byEmail).sort((a, b) =>
            new Date(b.createdAt) - new Date(a.createdAt));
        ensureAdminBroker();
        saveBrokersToStorage();
        return true;
    } catch (err) { if (typeof console !== 'undefined' && console.error) console.error('Erro ao carregar corretores do Firestore:', err); }
    return false;
}

loadBrokersFromStorage();
ensureAdminBroker();
setTimeout(function() { loadBrokersFromFirestore(); }, 800);

function ensureAdminBroker() {
    const exists = brokers.some(b => b.email === ADMIN_BROKER.email);
    if (!exists) {
        const admin = {
            id: brokers.length + 1,
            name: ADMIN_BROKER.name,
            cpf: ADMIN_BROKER.cpf,
            email: ADMIN_BROKER.email,
            phone: ADMIN_BROKER.phone,
            creci: ADMIN_BROKER.creci,
            password: ADMIN_BROKER.password,
            isActive: true,
            isAdmin: true,
            createdAt: new Date()
        };
        brokers.push(admin);
        saveBrokersToStorage();
        if (typeof saveBrokerToFirestore === 'function') {
            saveBrokerToFirestore(admin).catch(function() {});
        }
    }
}

// Open login modal
function openLoginModal() {
    const modal = document.getElementById('loginModal');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    
    // Show login form, hide register form
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    
    modal.style.display = 'block';
    
    // Setup form event listeners
    setupAuthForms();
}

// Close login modal
function closeLoginModal() {
    document.getElementById('loginModal').style.display = 'none';
}

// Setup authentication forms
function setupAuthForms() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    
    // Remove existing event listeners
    const newLoginForm = loginForm.cloneNode(true);
    const newRegisterForm = registerForm.cloneNode(true);
    
    loginForm.parentNode.replaceChild(newLoginForm, loginForm);
    registerForm.parentNode.replaceChild(newRegisterForm, registerForm);
    
    // Add new event listeners
    newLoginForm.addEventListener('submit', handleLogin);
    newRegisterForm.addEventListener('submit', handleRegister);
    // Email sempre minúsculo no login
    const loginEmail = newLoginForm.querySelector('#email');
    if (loginEmail) {
        loginEmail.addEventListener('blur', function() {
            const v = (this.value || '').trim().toLowerCase();
            if (v) this.value = v;
        });
    }
}

// Handle login form submission
function handleLogin(e) {
    e.preventDefault();
    
    const email = (e.target.email.value || '').trim().toLowerCase();
    const password = e.target.password.value;
    
    // Validate input
    if (!email || !password) {
        showAuthMessage('Por favor, preencha todos os campos.', 'error');
        return;
    }
    
    // Find broker (email comparado sem diferenciar maiúsculas/minúsculas)
    const broker = brokers.find(b => (b.email || '').toLowerCase() === email && b.password === password && b.isActive);
    
    if (broker) {
        // Login successful
        currentUser = {
            id: broker.id,
            name: broker.name,
            email: broker.email,
            phone: broker.phone,
            creci: broker.creci,
            type: 'broker'
        };
        
        // Save to localStorage
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        
        // Update UI
        updateUIForLoggedUser();
        closeLoginModal();
        showMessage('Login realizado com sucesso!', 'success');
        
        // Redirect to broker dashboard if it exists
        if (typeof showBrokerDashboard === 'function') {
            showBrokerDashboard();
        }
    } else {
        showAuthMessage('Email ou senha incorretos.', 'error');
    }
}

// Handle register form submission
async function handleRegister(e) {
    e.preventDefault();
    
    const name = e.target.name.value;
    const cpf = e.target.cpf?.value || '';
    const email = (e.target.email.value || '').trim().toLowerCase();
    const phone = e.target.phone.value;
    const creci = e.target.creci.value;
    const password = e.target.password.value;
    const confirmPassword = e.target.confirmPassword.value;
    
    // Validate input
    if (!name || !cpf || !email || !phone || !password || !confirmPassword) {
        showRegisterFeedback(false, 'Por favor, preencha nome, CPF, email, telefone e senha.');
        return;
    }
    
    if (password !== confirmPassword) {
        showRegisterFeedback(false, 'As senhas não coincidem.');
        return;
    }
    
    if (password.length < 6) {
        showRegisterFeedback(false, 'A senha deve ter pelo menos 6 caracteres.');
        return;
    }
    
    // Check if email already exists (case-insensitive)
    if (brokers.find(b => (b.email || '').toLowerCase() === email)) {
        showRegisterFeedback(false, 'Este email já está cadastrado.');
        return;
    }
    
    // Check if CRECI already exists
    if (creci && brokers.find(b => b.creci === creci)) {
        showRegisterFeedback(false, 'Este CRECI já está cadastrado.');
        return;
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showRegisterFeedback(false, 'Por favor, insira um email válido.');
        return;
    }
    
    // Validate phone format
    const phoneRegex = /^\(\d{2}\)\s\d{4,5}-\d{4}$/;
    if (!phoneRegex.test(phone)) {
        showRegisterFeedback(false, 'Por favor, insira um telefone no formato (21) 99999-9999 ou (21) 9999-9999.');
        return;
    }

    if (!isValidCPF(cpf)) {
        showRegisterFeedback(false, 'CPF inválido. Verifique o número digitado.');
        return;
    }
    
    const createdAt = new Date();
    var newBroker = {
        id: brokers.length + 1,
        name: name,
        cpf: cpf.replace(/\D/g, ''),
        email: email,
        phone: phone,
        creci: creci || '',
        password: password,
        isActive: false,
        createdAt: createdAt
    };
    newBroker.createdBy = { type: 'Corretor', email: email, name: name, at: new Date().toISOString() };
    brokers.push(newBroker);
    saveBrokersToStorage();

    let saved = false;
    if (typeof registerBrokerAPI === 'function') {
        try {
            const id = await registerBrokerAPI(newBroker);
            if (id) { newBroker.id = id; saved = true; }
        } catch (err) { console.warn('API falhou, tentando Firestore:', err); }
    }
    if (!saved && typeof saveBrokerToFirestore === 'function') {
        try {
            const docId = await saveBrokerToFirestore(newBroker);
            if (docId) { newBroker.id = docId; saved = true; }
        } catch (err) { console.error('Firestore falhou:', err); }
    }
    
    try {
        const notifBody = `
            <h2>🏠 Novo Corretor Solicitou Acesso</h2>
            <p><strong>Nome:</strong> ${name}</p>
            <p><strong>CPF:</strong> ${cpf}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Telefone:</strong> ${phone}</p>
            <p><strong>CRECI:</strong> ${creci || 'Não informado'}</p>
            <p><strong>Data:</strong> ${new Date().toLocaleString('pt-BR')}</p>
            <hr>
            <p>⚠️ Este corretor está <strong>aguardando aprovação</strong>. Acesse o painel administrativo para ativar o acesso.</p>
        `;
        if (typeof sendEmail === 'function') {
            sendEmail('bfmarquesempreendimentos@gmail.com', 'Novo Corretor Solicita Acesso - ' + name, notifBody);
        }
    } catch (e) { console.error('Erro ao enviar notificação:', e); }

    showRegisterFeedback(true, 'Seu cadastro foi enviado com sucesso! Aguarde a aprovação do administrador para acessar o sistema.');
    
    // Clear form
    e.target.reset();
}

// Show login form
function showLoginForm() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const forgotForm = document.getElementById('forgotPasswordForm');
    if (loginForm) loginForm.style.display = 'block';
    if (registerForm) registerForm.style.display = 'none';
    if (forgotForm) forgotForm.style.display = 'none';
}

// Show register form
function showRegisterForm() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const forgotForm = document.getElementById('forgotPasswordForm');
    if (loginForm) loginForm.style.display = 'none';
    if (registerForm) registerForm.style.display = 'block';
    if (forgotForm) forgotForm.style.display = 'none';

    // Setup phone mask
    const phoneInput = document.getElementById('regPhone');
    if (phoneInput) {
        phoneInput.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length >= 2) {
                value = value.replace(/^(\d{2})(\d{0,5})(\d{0,4}).*/, '($1) $2-$3');
            }
            e.target.value = value;
        });
    }
    // Email sempre minúsculo (evita falha em envio automático)
    const emailInput = document.getElementById('regEmail');
    if (emailInput) {
        emailInput.addEventListener('blur', function() {
            const v = (this.value || '').trim().toLowerCase();
            if (v) this.value = v;
        });
    }
}

// Show authentication messages (fallback para login form)
function showAuthMessage(text, type = 'success') {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm || loginForm.style.display !== 'block') return;
    
    const existingMessages = document.querySelectorAll('.auth-message');
    existingMessages.forEach(msg => msg.remove());
    
    const message = document.createElement('div');
    message.className = `message auth-message ${type}`;
    message.textContent = text;
    
    const modalContent = document.querySelector('#loginModal .modal-content');
    if (modalContent) modalContent.insertBefore(message, modalContent.firstChild);
    
    setTimeout(() => { message.remove(); }, 5000);
}

// Tela sobreposta de feedback após cadastro (sucesso ou erro)
function showRegisterFeedback(success, message) {
    const modal = document.getElementById('loginModal');
    const modalContent = modal?.querySelector('.modal-content');
    if (!modalContent) return;
    
    let overlay = document.getElementById('authFeedbackOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'authFeedbackOverlay';
        overlay.className = 'auth-feedback-overlay';
        modalContent.style.position = 'relative';
        modalContent.appendChild(overlay);
    }
    
    const icon = success ? 'fa-check-circle' : 'fa-exclamation-circle';
    const title = success ? 'Cadastro realizado!' : 'Ops! Algo deu errado';
    
    overlay.innerHTML = `
        <div class="auth-feedback-box auth-feedback-${success ? 'success' : 'error'}">
            <i class="fas ${icon} auth-feedback-icon"></i>
            <h3>${title}</h3>
            <p>${message}</p>
            <button type="button" class="btn btn-primary auth-feedback-btn" onclick="closeRegisterFeedback(${success})">
                ${success ? 'Entendi' : 'Tentar novamente'}
            </button>
        </div>
    `;
    overlay.classList.add('auth-feedback-visible');
}

function closeRegisterFeedback(wasSuccess) {
    const overlay = document.getElementById('authFeedbackOverlay');
    if (overlay) {
        overlay.classList.remove('auth-feedback-visible');
    }
    if (wasSuccess) {
        showLoginForm();
    }
}

// Check if user is authenticated
function isAuthenticated() {
    return currentUser !== null;
}

// Check if user is broker
function isBroker() {
    return currentUser && currentUser.type === 'broker';
}

// Get current user
function getCurrentUser() {
    return currentUser;
}

// Password strength checker
function checkPasswordStrength(password) {
    let strength = 0;
    const checks = {
        length: password.length >= 8,
        lowercase: /[a-z]/.test(password),
        uppercase: /[A-Z]/.test(password),
        numbers: /\d/.test(password),
        special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
    };
    
    strength = Object.values(checks).filter(Boolean).length;
    
    return {
        score: strength,
        checks,
        text: ['Muito fraca', 'Fraca', 'Regular', 'Boa', 'Muito boa'][strength] || 'Muito fraca'
    };
}

// Add password strength indicator
function addPasswordStrengthIndicator() {
    const passwordInputs = document.querySelectorAll('#regPassword, #password');
    
    passwordInputs.forEach(input => {
        if (input.nextElementSibling && input.nextElementSibling.classList.contains('password-strength')) {
            return; // Already added
        }
        
        const strengthIndicator = document.createElement('div');
        strengthIndicator.className = 'password-strength';
        strengthIndicator.style.cssText = `
            margin-top: 5px;
            font-size: 0.8rem;
            display: none;
        `;
        
        input.parentNode.insertBefore(strengthIndicator, input.nextSibling);
        
        input.addEventListener('input', function() {
            if (this.value.length > 0) {
                const strength = checkPasswordStrength(this.value);
                strengthIndicator.style.display = 'block';
                strengthIndicator.innerHTML = `
                    <div style="display: flex; gap: 2px; margin-bottom: 3px;">
                        ${Array(5).fill(0).map((_, i) => 
                            `<div style="height: 4px; flex: 1; background: ${i < strength.score ? getStrengthColor(strength.score) : '#ddd'}; border-radius: 2px;"></div>`
                        ).join('')}
                    </div>
                    <span style="color: ${getStrengthColor(strength.score)};">${strength.text}</span>
                `;
            } else {
                strengthIndicator.style.display = 'none';
            }
        });
    });
}

// Get strength color
function getStrengthColor(score) {
    const colors = ['#e74c3c', '#e67e22', '#f39c12', '#27ae60', '#2ecc71'];
    return colors[score - 1] || '#e74c3c';
}

// Validar CPF
function isValidCPF(cpf) {
    let clean = cpf.replace(/\D/g, '');
    if (clean.length !== 11) return false;
    if (/^(\d)\1+$/.test(clean)) return false;
    
    let sum = 0;
    for (let i = 0; i < 9; i++) {
        sum += parseInt(clean.charAt(i), 10) * (10 - i);
    }
    let check = (sum * 10) % 11;
    if (check === 10 || check === 11) check = 0;
    if (check !== parseInt(clean.charAt(9), 10)) return false;
    
    sum = 0;
    for (let i = 0; i < 10; i++) {
        sum += parseInt(clean.charAt(i), 10) * (11 - i);
    }
    check = (sum * 10) % 11;
    if (check === 10 || check === 11) check = 0;
    return check === parseInt(clean.charAt(10), 10);
}

// Validar CNPJ
function isValidCNPJ(cnpj) {
    let clean = cnpj.replace(/\D/g, '');
    if (clean.length !== 14) return false;
    if (/^(\d)\1+$/.test(clean)) return false;
    const weights1 = [5,4,3,2,9,8,7,6,5,4,3,2];
    const weights2 = [6,5,4,3,2,9,8,7,6,5,4,3,2];
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += parseInt(clean.charAt(i), 10) * weights1[i];
    let check = sum % 11;
    check = check < 2 ? 0 : 11 - check;
    if (check !== parseInt(clean.charAt(12), 10)) return false;
    sum = 0;
    for (let i = 0; i < 13; i++) sum += parseInt(clean.charAt(i), 10) * weights2[i];
    check = sum % 11;
    check = check < 2 ? 0 : 11 - check;
    return check === parseInt(clean.charAt(13), 10);
}

// ─── Meu Perfil (corretor edita seus dados) ───
function openBrokerProfileModal() {
    if (!currentUser || !isBroker()) return;
    const broker = brokers.find(b => String(b.id) === String(currentUser.id));
    if (!broker) {
        if (typeof showMessage === 'function') showMessage('Perfil não encontrado.', 'error');
        return;
    }
    let modal = document.getElementById('brokerProfileModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'brokerProfileModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:420px;">
                <span class="close" onclick="closeBrokerProfileModal()">&times;</span>
                <h2><i class="fas fa-user-edit"></i> Meu Perfil</h2>
                <p class="form-hint" style="margin-bottom:16px;">Atualize seus dados. O email será salvo sempre em minúsculas.</p>
                <form id="brokerProfileForm">
                    <div class="form-group">
                        <label>Nome</label>
                        <input type="text" id="brokerProfileName" required>
                    </div>
                    <div class="form-group">
                        <label>Email</label>
                        <input type="email" id="brokerProfileEmail" required placeholder="será salvo em minúsculas">
                    </div>
                    <div class="form-group">
                        <label>Telefone</label>
                        <input type="tel" id="brokerProfilePhone" placeholder="(21) 99999-9999">
                    </div>
                    <div class="form-group">
                        <label>CRECI</label>
                        <input type="text" id="brokerProfileCreci" placeholder="Opcional">
                    </div>
                    <button type="submit" class="btn btn-primary">Salvar alterações</button>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('#brokerProfileForm').onsubmit = (e) => { e.preventDefault(); handleBrokerProfileSubmit(); return false; };
        modal.querySelector('#brokerProfileEmail').addEventListener('blur', function() {
            const v = (this.value || '').trim().toLowerCase();
            if (v) this.value = v;
        });
    }
    document.getElementById('brokerProfileName').value = broker.name || '';
    document.getElementById('brokerProfileEmail').value = broker.email || '';
    document.getElementById('brokerProfilePhone').value = broker.phone || '';
    document.getElementById('brokerProfileCreci').value = broker.creci || '';
    modal.style.display = 'block';
}

function closeBrokerProfileModal() {
    const modal = document.getElementById('brokerProfileModal');
    if (modal) modal.style.display = 'none';
}

async function handleBrokerProfileSubmit() {
    if (!currentUser || !isBroker()) return;
    const name = document.getElementById('brokerProfileName')?.value?.trim();
    const email = (document.getElementById('brokerProfileEmail')?.value || '').trim().toLowerCase();
    const phone = document.getElementById('brokerProfilePhone')?.value || '';
    const creci = document.getElementById('brokerProfileCreci')?.value || '';
    if (!name || !email) {
        if (typeof showMessage === 'function') showMessage('Nome e email são obrigatórios.', 'error');
        return;
    }
    const other = brokers.find(b => (b.email || '').toLowerCase() === email && String(b.id) !== String(currentUser.id));
    if (other) {
        if (typeof showMessage === 'function') showMessage('Este email já está em uso por outro corretor.', 'error');
        return;
    }
    const broker = brokers.find(b => String(b.id) === String(currentUser.id));
    if (!broker) return;
    broker.name = name;
    broker.email = email;
    broker.phone = phone;
    broker.creci = creci;
    currentUser.name = name;
    currentUser.email = email;
    currentUser.phone = phone;
    currentUser.creci = creci;
    saveBrokersToStorage();
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    if (typeof updateBrokerInFirestore === 'function' && typeof broker.id === 'string') {
        try {
            await updateBrokerInFirestore(broker.id, { name, email, phone, creci });
        } catch (e) { console.error(e); }
    }
    closeBrokerProfileModal();
    updateUIForLoggedUser();
    if (typeof showMessage === 'function') showMessage('Perfil atualizado com sucesso!', 'success');
}

function showBrokerMenu() {
    if (!currentUser || !isBroker()) return;
    let menu = document.getElementById('brokerUserMenu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'brokerUserMenu';
        menu.className = 'broker-user-menu-dropdown';
        menu.innerHTML = `
            <a href="#" onclick="event.preventDefault();openBrokerProfileModal();document.getElementById('brokerUserMenu').classList.remove('show');"><i class="fas fa-user-edit"></i> Meu Perfil</a>
            <a href="#" onclick="event.preventDefault();document.getElementById('brokerUserMenu').classList.remove('show');if(confirm('Deseja fazer logout?'))logout();"><i class="fas fa-sign-out-alt"></i> Sair</a>
        `;
        document.body.appendChild(menu);
        document.addEventListener('click', function(ev) {
            if (!menu.contains(ev.target) && !ev.target.closest('.btn-login')) menu.classList.remove('show');
        });
    }
    const btn = document.querySelector('.btn-login');
    if (btn) {
        const rect = btn.getBoundingClientRect();
        menu.style.top = (rect.bottom + 4) + 'px';
        menu.style.left = rect.left + 'px';
        menu.classList.toggle('show');
    }
}

// Initialize auth system
document.addEventListener('DOMContentLoaded', function() {
    // Add password strength indicators after a short delay
    setTimeout(addPasswordStrengthIndicator, 100);
});

// Forgot password - Área do Cliente (usa prompt simples)
function showForgotPassword() {
    const email = prompt('Digite seu email para recuperação de senha:');
    if (email) {
        const broker = brokers.find(b => (b.email || '').toLowerCase() === (email || '').trim().toLowerCase());
        if (broker) {
            alert('Um link de recuperação foi enviado para seu email.');
        } else {
            alert('Email não encontrado em nossa base de dados.');
        }
    }
}

// Esqueci minha senha - Área do Corretor (fluxo completo com email)
function showBrokerForgotPassword() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const forgotForm = document.getElementById('forgotPasswordForm');
    if (loginForm) loginForm.style.display = 'none';
    if (registerForm) registerForm.style.display = 'none';
    if (forgotForm) {
        forgotForm.style.display = 'block';
        forgotForm.reset();
        const emailInput = document.getElementById('forgotEmail');
        const loginEmail = document.getElementById('email');
        if (emailInput && loginEmail && loginEmail.value) emailInput.value = loginEmail.value;
        forgotForm.onsubmit = (e) => { e.preventDefault(); handleBrokerForgotPasswordSubmit(); return false; };
    }
}

async function handleBrokerForgotPasswordSubmit() {
    const emailInput = document.getElementById('forgotEmail');
    const email = emailInput?.value?.trim();
    if (!email) {
        if (typeof showMessage === 'function') showMessage('Digite seu email.', 'error');
        return;
    }
    const broker = brokers.find(b => String(b.email).toLowerCase() === String(email).toLowerCase());
    if (!broker) {
        if (typeof showMessage === 'function') showMessage('Email não encontrado em nossa base de dados.', 'error');
        else alert('Email não encontrado em nossa base de dados.');
        return;
    }
    if (!broker.isActive) {
        const tel = (typeof CONFIG !== 'undefined' && CONFIG?.company?.phone) ? CONFIG.company.phone : '(21) 99759-0814';
        const msg = `Seu cadastro ainda está aguardando aprovação. Não é possível solicitar redefinição de senha neste momento. Aguarde a aprovação do administrador ou entre em contato pelo telefone ${tel}.`;
        if (typeof showMessage === 'function') showMessage(msg, 'error');
        else alert(msg);
        return;
    }
    const token = 'RESET' + Date.now() + Math.random().toString(36).substr(2, 16).toUpperCase();
    let saved = false;
    if (typeof savePasswordResetToken === 'function') {
        try {
            await savePasswordResetToken(String(broker.id), broker.email, token);
            saved = true;
        } catch (e) { console.error(e); }
    }
    const basePath = window.location.pathname.replace(/\/[^/]*$/, '') || '';
    const baseUrl = window.location.origin + basePath;
    const resetUrl = baseUrl + '/reset-password.html?token=' + encodeURIComponent(token);
    const subject = 'Redefinir senha - B F Marques Empreendimentos';
    const body = `
        <h2>Olá, ${broker.name || broker.email}!</h2>
        <p>Você solicitou a redefinição da sua senha na Área do Corretor.</p>
        <p>Clique no link abaixo para criar uma nova senha (válido por 1 hora):</p>
        <p><a href="${resetUrl}" style="display:inline-block;background:#3498db;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;margin:10px 0;">Redefinir minha senha</a></p>
        <p>Ou copie e cole no navegador:</p>
        <p style="word-break:break-all;color:#666;">${resetUrl}</p>
        <p>Se você não solicitou esta alteração, ignore este email.</p>
        <p>Atenciosamente,<br><strong>B F Marques Empreendimentos</strong></p>
    `;
    const recipientEmail = (broker.email || '').trim();
    if (!recipientEmail) {
        if (typeof showMessage === 'function') showMessage('Email do corretor não encontrado. Entre em contato pelo telefone (21) 99759-0814.', 'error');
        return;
    }
    const waMsg = `Olá! Enviamos um link para redefinir sua senha no seu email. Verifique a caixa de entrada e a pasta de spam. B F Marques.`;
    if (typeof sendBrokerNotification === 'function') {
        try { await sendBrokerNotification(broker, subject, body, waMsg); } catch (e) { console.error('Erro ao enviar notificação:', e); }
    } else if (typeof sendEmail === 'function') {
        try { await sendEmail(recipientEmail, subject, body); } catch (e) { console.error('Erro ao enviar email:', e); }
    }
    showLoginForm();
    if (typeof showMessage === 'function') {
        showMessage('Se o email estiver cadastrado, você receberá um link para redefinir sua senha. Verifique também a pasta de spam.', 'success');
    } else {
        alert('Se o email estiver cadastrado, você receberá um link para redefinir sua senha. Verifique também a pasta de spam.');
    }
}

// Admin functions (for managing brokers)
function findBrokerById(id) {
    const sid = String(id);
    return brokers.find(b => String(b.id) === sid);
}

async function approveBroker(brokerId) {
    const broker = findBrokerById(brokerId);
    if (broker) {
        broker.isActive = true;
        if (typeof updateBrokerInFirestore === 'function' && typeof brokerId === 'string') {
            try { await updateBrokerInFirestore(brokerId, { isActive: true }); } catch (e) { console.error(e); }
        }
        saveBrokersToStorage();
        if (typeof showMessage === 'function') showMessage(`Corretor ${broker.name} aprovado com sucesso!`, 'success');
        if (typeof loadBrokersData === 'function') loadBrokersData();
        if (broker.email && (typeof sendBrokerNotification === 'function' || typeof sendEmail === 'function')) {
            const subject = 'Acesso Aprovado - B F Marques Empreendimentos';
            const siteUrl = (typeof CONFIG !== 'undefined' && CONFIG?.company?.siteUrl) || 'https://bfmarquesempreendimentos.github.io/bfm';
            const body = `
                <h2>Olá, ${broker.name}!</h2>
                <p>Seu cadastro como corretor foi <strong>aprovado</strong> pela administração.</p>
                <p>Você já pode acessar o sistema e começar a realizar reservas, vendas e visualizar os detalhes dos imóveis.</p>
                <p><strong>Acesse o site:</strong> <a href="${siteUrl}">${siteUrl}</a></p>
                <p>Atenciosamente,<br><strong>B F Marques Empreendimentos</strong></p>
            `;
            const waMsg = `Olá, ${broker.name}! 🎉 Seu cadastro como corretor foi APROVADO. Você já pode acessar o sistema: ${siteUrl}`;
            try {
                if (typeof sendBrokerNotification === 'function') await sendBrokerNotification(broker, subject, body, waMsg);
                else await sendEmail(broker.email, subject, body);
            } catch (e) { console.error('Erro ao enviar notificação de aprovação:', e); }
        }
    }
}

async function deleteBroker(brokerId) {
    if (typeof isSuperAdmin === 'function' && !isSuperAdmin()) {
        if (typeof showMessage === 'function') showMessage('Você não tem permissão para excluir cadastros.', 'error');
        return;
    }
    const broker = findBrokerById(brokerId);
    if (!broker) return;
    if (broker.isAdmin) {
        if (typeof showMessage === 'function') showMessage('Não é possível remover o administrador.', 'error');
        return;
    }
    const confirmed = confirm(
        `Tem certeza que deseja REMOVER permanentemente o cadastro do corretor?\n\n` +
        `Nome: ${broker.name || broker.email}\nEmail: ${broker.email}\n\n` +
        `Esta ação não pode ser desfeita.`
    );
    if (!confirmed) return;
    brokers = brokers.filter(b => String(b.id) !== String(brokerId));
    if (typeof saveBrokersToStorage === 'function') saveBrokersToStorage();
    if (typeof deleteBrokerFromFirestore === 'function' && typeof brokerId === 'string') {
        try { await deleteBrokerFromFirestore(brokerId); } catch (e) { console.error(e); }
    }
    if (typeof showMessage === 'function') showMessage(`Corretor removido com sucesso.`, 'success');
    if (typeof loadBrokersData === 'function') loadBrokersData();
}

async function deactivateBroker(brokerId) {
    const broker = findBrokerById(brokerId);
    if (broker) {
        broker.isActive = false;
        if (typeof updateBrokerInFirestore === 'function' && typeof brokerId === 'string') {
            try { await updateBrokerInFirestore(brokerId, { isActive: false }); } catch (e) { console.error(e); }
        }
        saveBrokersToStorage();
        if (typeof showMessage === 'function') showMessage(`Corretor ${broker.name} desativado.`, 'warning');
        if (typeof loadBrokersData === 'function') loadBrokersData();
    }
}

function getAllBrokers() {
    return brokers;
}

function getActiveBrokers() {
    return brokers.filter(b => b.isActive);
}

function getPendingBrokers() {
    return brokers.filter(b => !b.isActive);
}

