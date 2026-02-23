// Authentication system for brokers

// Sample brokers data - replace with actual backend
let brokers = [
    {
        id: 1,
        name: 'João Silva',
        email: 'joao@construtora.com',
        phone: '(11) 99999-9999',
        creci: '12345-F',
        password: '123456', // In production, this should be hashed
        isActive: true,
        createdAt: new Date('2024-01-15')
    },
    {
        id: 2,
        name: 'Maria Santos',
        email: 'maria@construtora.com',
        phone: '(11) 88888-8888',
        creci: '67890-F',
        password: '123456',
        isActive: true,
        createdAt: new Date('2024-02-10')
    }
];

const ADMIN_BROKER = {
    email: 'brunoferreiramarques@gmail.com',
    password: '123456',
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
        local.forEach(b => { byEmail[b.email] = b; });
        fromDb.forEach(b => { byEmail[b.email] = b; });
        brokers = Object.values(byEmail).sort((a, b) =>
            new Date(b.createdAt) - new Date(a.createdAt));
        ensureAdminBroker();
        saveBrokersToStorage();
        return true;
    } catch (err) { console.error('Erro ao carregar corretores do Firestore:', err); }
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
}

// Handle login form submission
function handleLogin(e) {
    e.preventDefault();
    
    const email = e.target.email.value;
    const password = e.target.password.value;
    
    // Validate input
    if (!email || !password) {
        showAuthMessage('Por favor, preencha todos os campos.', 'error');
        return;
    }
    
    // Find broker
    const broker = brokers.find(b => b.email === email && b.password === password && b.isActive);
    
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
    const email = e.target.email.value;
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
    
    // Check if email already exists
    if (brokers.find(b => b.email === email)) {
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
        showRegisterFeedback(false, 'Por favor, insira um telefone no formato (11) 99999-9999.');
        return;
    }

    if (!isValidCPF(cpf)) {
        showRegisterFeedback(false, 'CPF inválido. Verifique o número digitado.');
        return;
    }
    
    const createdAt = new Date();
    const newBroker = {
        id: brokers.length + 1,
        name: name,
        cpf: cpf.replace(/\D/g, ''),
        email,
        phone: phone,
        creci: creci || '',
        password,
        isActive: false,
        createdAt: createdAt
    };
    
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
    
    console.log('New broker registered:', newBroker);

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
    
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
}

// Show register form
function showRegisterForm() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    
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

// Initialize auth system
document.addEventListener('DOMContentLoaded', function() {
    // Add password strength indicators after a short delay
    setTimeout(addPasswordStrengthIndicator, 100);
});

// Forgot password functionality
function showForgotPassword() {
    const email = prompt('Digite seu email para recuperação de senha:');
    if (email) {
        const broker = brokers.find(b => b.email === email);
        if (broker) {
            // In a real application, send recovery email
            alert('Um link de recuperação foi enviado para seu email.');
        } else {
            alert('Email não encontrado em nossa base de dados.');
        }
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
        if (broker.email && typeof sendEmail === 'function') {
            const subject = 'Acesso Aprovado - B F Marques Empreendimentos';
            const body = `
                <h2>Olá, ${broker.name}!</h2>
                <p>Seu cadastro como corretor foi <strong>aprovado</strong> pela administração.</p>
                <p>Você já pode acessar o sistema e começar a realizar reservas e vendas.</p>
                <p>Atenciosamente,<br><strong>B F Marques Empreendimentos</strong></p>
            `;
            try { await sendEmail(broker.email, subject, body); } catch (e) { console.error('Erro ao enviar email de aprovação:', e); }
        }
    }
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

