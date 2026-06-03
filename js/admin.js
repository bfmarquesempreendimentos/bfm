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
    var adminUser = JSON.parse(localStorage.getItem('adminUser') || '{}');
    var nameEl = document.getElementById('adminUserName');
    if (nameEl) {
        nameEl.textContent = adminUser.name || 'Administrador';
        if (typeof isSuperAdmin === 'function' && isSuperAdmin()) {
            nameEl.title = adminUser.email + ' (Super Admin)';
        } else {
            nameEl.title = adminUser.email + ' (Admin)';
        }
    }
    // Load initial data
    loadDashboardData();
    setupAdminEventListeners();
    // Pré-carregar reparos (Cloud Function primeiro - evita falhas do Firestore no Mac)
    (function preloadRepairs() {
        function mergeAndSave(fromServer) {
            if (!fromServer || !fromServer.length) return;
            var local = JSON.parse(localStorage.getItem('repairRequests') || '[]');
            var byId = {};
            for (var j = 0; j < fromServer.length; j++) {
                var f = fromServer[j];
                var fid = f.id !== undefined ? f.id : (f.firestoreId || f.id);
                if (fid !== undefined && fid !== null) byId[fid] = f;
            }
            for (var i = 0; i < local.length; i++) {
                var lid = local[i].id;
                if (lid !== undefined && lid !== null && !byId[lid]) byId[lid] = local[i];
            }
            local = [];
            for (var k in byId) { if (byId.hasOwnProperty(k)) local.push(byId[k]); }
            localStorage.setItem('repairRequests', JSON.stringify(local));
        }
        var url = 'https://us-central1-site-interativo-b-f-marques.cloudfunctions.net/getRepairs?t=' + Date.now();
        fetch(url, { cache: 'no-store', credentials: 'omit' }).then(function(res) { return res.ok ? res.json() : []; }).then(function(data) {
            if (data && Array.isArray(data) && data.length > 0) {
                mergeAndSave(data);
                return;
            }
            if (typeof getAllRepairRequestsFromFirestore === 'function' && typeof firebaseAvailable === 'function' && firebaseAvailable()) {
                return getAllRepairRequestsFromFirestore().then(mergeAndSave).catch(function() {});
            }
        }).catch(function() {
            if (typeof getAllRepairRequestsFromFirestore === 'function' && typeof firebaseAvailable === 'function' && firebaseAvailable()) {
                getAllRepairRequestsFromFirestore().then(mergeAndSave).catch(function() {});
            }
        });
    })();
    const hash = (window.location.hash || '').replace('#', '');
    const urlParams = new URLSearchParams(window.location.search);
    const openRepairId = urlParams.get('openRepair');
    const section = hash && document.getElementById(hash) ? hash : (openRepairId ? 'repairs' : 'dashboard');
    showSection(section);
    if (openRepairId && typeof openRepairFromLink === 'function') {
        setTimeout(() => openRepairFromLink(openRepairId), 300);
    }
}

// Check admin authentication
function isAdminAuthenticated() {
    // In a real application, check for proper admin token/session
    const adminUser = localStorage.getItem('adminUser');
    return adminUser !== null;
}

// Verifica se o usuário logado é super admin (pode excluir cadastros)
function isSuperAdmin() {
    const adminUser = JSON.parse(localStorage.getItem('adminUser') || '{}');
    const superEmails = (typeof CONFIG !== 'undefined' && CONFIG?.auth?.superAdminEmails) || ['brunoferreiramarques@gmail.com'];
    return superEmails.includes(adminUser.email);
}

// Redirect to login
function redirectToLogin() {
    window.location.href = 'admin-login.html';
}

// Admin logout
function adminLogout() {
    if (confirm('Tem certeza que deseja sair?')) {
        localStorage.removeItem('adminUser');
        try { sessionStorage.removeItem('adminSession'); } catch (e) {}
        window.location.href = 'admin-login.html?logout=1&t=' + Date.now();
    }
}

function getAdminApiCredentials() {
    try {
        var s = sessionStorage.getItem('adminSession');
        if (s) {
            var o = JSON.parse(s);
            if (o && o.email && o.password) return { email: o.email, password: o.password };
        }
    } catch (e) {}
    return { email: '', password: '' };
}

function runMigrateLegacySaleSlots() {
    var creds = getAdminApiCredentials();
    if (!creds.email || !creds.password) {
        showMessage('Faça login novamente no painel para executar a migração.', 'error');
        return;
    }
    if (!confirm('Isso atualiza no Firestore todas as vendas sem saleSlotKey (legado). Continuar?')) return;
    adminPostJson('/adminMigrateLegacySaleSlots', { adminEmail: creds.email, adminPassword: creds.password })
        .then(function(r) {
            var msg = 'Migração concluída: ' + (r.updated || 0) + ' atualizadas, ' + (r.skippedAlreadyHadSlot || 0) + ' já tinham chave.';
            showMessage(msg, 'success');
            return loadSalesData();
        })
        .catch(function(err) {
            showMessage(err.message || 'Erro na migração.', 'error');
        });
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
}

// Load sales data — API admin (Firestore direto bloqueado para clientes)
async function loadSalesData() {
    loadSalesPropertyOptions();
    setupSaleFormMasks();
    const photosGroup = document.getElementById('saleContractPhotosGroup');
    if (photosGroup) photosGroup.style.display = (typeof isSuperAdmin === 'function' && isSuperAdmin()) ? 'none' : 'block';
    var creds = getAdminApiCredentials();
    if (creds.email && creds.password) {
        try {
            var data = await adminPostJson('/adminPropertySalesList', { adminEmail: creds.email, adminPassword: creds.password });
            if (data && Array.isArray(data.sales)) {
                localStorage.setItem('propertySales', JSON.stringify(data.sales));
                if (typeof loadPropertySales === 'function') loadPropertySales();
            }
        } catch (e) {
            console.warn('Erro ao carregar vendas:', e);
            showMessage('Não foi possível carregar vendas. Faça login novamente no painel (email e senha) para renovar a sessão segura.', 'error');
        }
    } else {
        showMessage('Para carregar vendas, saia e entre no painel novamente com email e senha (sessão segura).', 'warning');
    }
    renderSalesTable();
    updateSaleFormModeUi();
}

// Formata CPF progressivamente ao digitar: 000.000.000-00
function formatCPFMask(v) {
    if (!v) return '';
    if (v.length <= 3) return v;
    if (v.length <= 6) return v.slice(0, 3) + '.' + v.slice(3);
    if (v.length <= 9) return v.slice(0, 3) + '.' + v.slice(3, 6) + '.' + v.slice(6);
    return v.slice(0, 3) + '.' + v.slice(3, 6) + '.' + v.slice(6, 9) + '-' + v.slice(9, 11);
}

// Formata CNPJ progressivamente: 00.000.000/0001-00
function formatCNPJMask(v) {
    if (!v) return '';
    if (v.length <= 2) return v;
    if (v.length <= 5) return v.slice(0, 2) + '.' + v.slice(2);
    if (v.length <= 8) return v.slice(0, 2) + '.' + v.slice(2, 5) + '.' + v.slice(5);
    if (v.length <= 12) return v.slice(0, 2) + '.' + v.slice(2, 5) + '.' + v.slice(5, 8) + '/' + v.slice(8);
    return v.slice(0, 2) + '.' + v.slice(2, 5) + '.' + v.slice(5, 8) + '/' + v.slice(8, 12) + '-' + v.slice(12, 14);
}

// Formata telefone progressivamente: (00) 00000-0000 ou (00) 0000-0000
function formatPhoneMask(v) {
    if (!v) return '';
    if (v.length <= 2) return v.length === 2 ? '(' + v + ') ' : '(' + v;
    if (v.length <= 7) return '(' + v.slice(0, 2) + ') ' + v.slice(2);
    return '(' + v.slice(0, 2) + ') ' + v.slice(2, 7) + '-' + v.slice(7, 11);
}

// Formata valor em reais: 1.234.567,89 (últimos 2 dígitos = centavos)
function formatPriceMask(v) {
    if (!v) return '';
    v = String(v).replace(/\D/g, '');
    v = v.replace(/^0+/, '') || '0';
    if (v.length === 1) return '0,0' + v;
    if (v.length === 2) return '0,' + v;
    const intPart = v.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return intPart + ',' + v.slice(-2);
}

// Máscaras do formulário de vendas: CPF/CNPJ, telefone e valor - formatação ao digitar
function setupSaleFormMasks() {
    const cpfInput = document.getElementById('saleClientCPF');
    const phoneInput = document.getElementById('saleClientPhone');
    const priceInput = document.getElementById('salePrice');
    if (cpfInput && !cpfInput.dataset.maskAttached) {
        cpfInput.dataset.maskAttached = '1';
        cpfInput.addEventListener('input', function() {
            let v = this.value.replace(/\D/g, '');
            if (v.length > 14) v = v.slice(0, 14);
            this.value = v.length <= 11 ? formatCPFMask(v) : formatCNPJMask(v);
        });
        cpfInput.addEventListener('paste', function(e) {
            e.preventDefault();
            let v = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 14);
            this.value = v.length <= 11 ? formatCPFMask(v) : formatCNPJMask(v);
        });
    }
    if (phoneInput && !phoneInput.dataset.maskAttached) {
        phoneInput.dataset.maskAttached = '1';
        phoneInput.addEventListener('input', function() {
            let v = this.value.replace(/\D/g, '');
            if (v.length > 11) v = v.slice(0, 11);
            this.value = formatPhoneMask(v);
        });
        phoneInput.addEventListener('paste', function(e) {
            e.preventDefault();
            let v = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 11);
            this.value = formatPhoneMask(v);
        });
    }
    if (priceInput && !priceInput.dataset.maskAttached) {
        priceInput.dataset.maskAttached = '1';
        priceInput.addEventListener('input', function() {
            let v = this.value.replace(/\D/g, '');
            if (v.length > 15) v = v.slice(0, 15);
            this.value = formatPriceMask(v);
        });
        priceInput.addEventListener('paste', function(e) {
            e.preventDefault();
            let v = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 15);
            this.value = formatPriceMask(v);
        });
    }
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

function maskDocForSalesTable(doc) {
    var d = String(doc || '').replace(/\D/g, '');
    if (d.length === 11) return '***.***.' + d.slice(6, 9) + '-' + d.slice(9) + ' <span class="sales-doc-hint" title="Documento mascarado por privacidade">ⓘ</span>';
    if (d.length === 14) return '**.***.***/****-' + d.slice(12) + ' <span class="sales-doc-hint" title="Documento mascarado por privacidade">ⓘ</span>';
    return String(doc || '');
}

function formatCreatedBySale(sale) {
    var c = sale.createdBy;
    if (!c || typeof c !== 'object') return '—';
    return (c.name || c.email || '—') + (c.type ? ' (' + c.type + ')' : '');
}

function renderSalesTable() {
    const tbody = document.getElementById('salesTableBody');
    if (!tbody) return;
    
    const sales = getSalesData();
    if (sales.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10">Nenhuma venda cadastrada.</td></tr>';
        return;
    }
    
    tbody.innerHTML = sales.map(sale => {
        const id = sale.id;
        const idAttr = typeof id === 'string' ? `'${String(id).replace(/'/g, "\\'")}'` : id;
        return `
        <tr>
            <td title="${String(sale.clientCPF || '').replace(/"/g, '&quot;')}">${id}</td>
            <td>${sale.propertyTitle || 'Imóvel'}</td>
            <td>${sale.unitCode || '—'}</td>
            <td>${sale.clientName || ''}</td>
            <td>${maskDocForSalesTable(sale.clientCPF)}</td>
            <td>${sale.clientEmail || ''}</td>
            <td>R$ ${Number(sale.salePrice || 0).toLocaleString('pt-BR')}</td>
            <td>${formatDate(sale.saleDate)}</td>
            <td style="font-size:0.85rem;max-width:140px;">${formatCreatedBySale(sale)}</td>
            <td>
                <button type="button" class="btn-action btn-secondary" onclick="beginEditSale(${idAttr})" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-action btn-delete" onclick="deleteSale(${idAttr})" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `}).join('');
}

var editingSaleFirestoreId = null;

function updateSaleFormModeUi() {
    var titleEl = document.getElementById('saleFormTitle');
    var cancelBtn = document.getElementById('saleFormCancelEdit');
    var subLbl = document.getElementById('saleFormSubmitLabel');
    var sp = document.getElementById('saleProperty');
    var su = document.getElementById('saleUnitCode');
    if (titleEl) titleEl.textContent = editingSaleFirestoreId ? 'Editar venda' : 'Nova venda';
    if (cancelBtn) cancelBtn.style.display = editingSaleFirestoreId ? 'inline-flex' : 'none';
    if (subLbl) subLbl.textContent = editingSaleFirestoreId ? 'Salvar alterações' : 'Registrar venda';
    if (sp) sp.disabled = !!editingSaleFirestoreId;
    if (su) su.disabled = !!editingSaleFirestoreId;
}

function cancelSaleEdit() {
    editingSaleFirestoreId = null;
    var formEl = document.getElementById('saleForm');
    if (formEl) formEl.reset();
    var fp = document.getElementById('saleContractPhotos');
    if (fp) fp.value = '';
    updateSaleFormModeUi();
}

function beginEditSale(saleId) {
    var sales = getSalesData();
    var sale = null;
    var i;
    for (i = 0; i < sales.length; i++) {
        if (String(sales[i].id) === String(saleId)) {
            sale = sales[i];
            break;
        }
    }
    if (!sale) {
        showMessage('Venda não encontrada na lista.', 'error');
        return;
    }
    editingSaleFirestoreId = String(saleId);
    var sp = document.getElementById('saleProperty');
    if (sp) sp.value = String(sale.propertyId);
    var su = document.getElementById('saleUnitCode');
    if (su) su.value = sale.unitCode || '';
    var sn = document.getElementById('saleClientName');
    if (sn) sn.value = sale.clientName || '';
    var sc = document.getElementById('saleClientCPF');
    if (sc) sc.value = sale.clientCPF || '';
    var se = document.getElementById('saleClientEmail');
    if (se) se.value = sale.clientEmail || '';
    var sph = document.getElementById('saleClientPhone');
    if (sph) sph.value = sale.clientPhone || '';
    var spr = document.getElementById('salePrice');
    if (spr && sale.salePrice != null && typeof formatPriceMask === 'function') {
        var cents = Math.round(Number(sale.salePrice) * 100);
        spr.value = formatPriceMask(String(cents));
    } else if (spr) {
        spr.value = '';
    }
    var scn = document.getElementById('saleContractNumber');
    if (scn) scn.value = sale.contractNumber || '';
    var notes = document.getElementById('saleNotes');
    if (notes) notes.value = sale.notes || '';
    updateSaleFormModeUi();
    showSection('sales');
    showMessage('Altere os campos e salve. Unidade e empreendimento não podem ser alterados por aqui — exclua e cadastre de novo se necessário.', 'info');
}

async function handleSaleFormSubmission(e) {
    if (e && e.preventDefault) e.preventDefault();

    var creds = getAdminApiCredentials();
    if (!creds.email || !creds.password) {
        showMessage('Faça logout e login novamente no painel para registrar vendas com segurança.', 'error');
        return;
    }

    var rawValue = (document.getElementById('saleProperty') && document.getElementById('saleProperty').value) || '';
    var propertyId = /^\d+$/.test(rawValue) ? parseInt(rawValue, 10) : rawValue;
    var clientCPF = (document.getElementById('saleClientCPF') && document.getElementById('saleClientCPF').value || '').trim();

    if (!propertyId && propertyId !== 0) {
        showMessage('Selecione um imóvel.', 'error');
        return;
    }

    var cpfClean = clientCPF.replace(/\D/g, '');
    var validDoc = cpfClean.length === 11 ? (typeof isValidCPF === 'function' && isValidCPF(clientCPF)) : (cpfClean.length === 14 && typeof isValidCNPJ === 'function' && isValidCNPJ(clientCPF));
    if (!clientCPF || !validDoc) {
        showMessage('CPF/CNPJ inválido. CPF: 11 dígitos. CNPJ: 14 dígitos.', 'error');
        return;
    }

    var priceEl = document.getElementById('salePrice');
    var priceStr = (priceEl && priceEl.value || '').trim().replace(/\./g, '').replace(',', '.');
    var salePrice = parseFloat(priceStr) || 0;
    if (salePrice <= 0) {
        showMessage('Informe um valor de venda válido.', 'error');
        return;
    }

    var isSA = typeof isSuperAdmin === 'function' && isSuperAdmin();
    var photosInput = document.getElementById('saleContractPhotos');
    var contractPhotos = [];

    if (!isSA && photosInput && !editingSaleFirestoreId) {
        var files = photosInput.files || [];
        if (files.length === 0) {
            showMessage('É obrigatório anexar fotos do contrato de venda (escritura/Caixa).', 'error');
            return;
        }
        if (typeof uploadRepairAttachmentsToFirebase === 'function') {
            try {
                var uploaded = await uploadRepairAttachmentsToFirebase(Array.from(files), 'sale-contracts');
                contractPhotos = (uploaded || []).map(function(u) { return u.url; });
            } catch (err) {
                console.error('Erro ao enviar fotos:', err);
                showMessage('Erro ao enviar fotos do contrato. Tente novamente.', 'error');
                return;
            }
        } else {
            showMessage('Sistema de upload indisponível. Tente mais tarde.', 'error');
            return;
        }
    }

    if (editingSaleFirestoreId) {
        var patch = {
            clientName: (document.getElementById('saleClientName') && document.getElementById('saleClientName').value) || '',
            clientCPF: clientCPF,
            clientEmail: ((document.getElementById('saleClientEmail') && document.getElementById('saleClientEmail').value) || '').trim().toLowerCase(),
            clientPhone: (document.getElementById('saleClientPhone') && document.getElementById('saleClientPhone').value) || '',
            salePrice: salePrice,
            contractNumber: (document.getElementById('saleContractNumber') && document.getElementById('saleContractNumber').value) || '',
            notes: (document.getElementById('saleNotes') && document.getElementById('saleNotes').value) || '',
        };
        var updPayload = {
            adminEmail: creds.email,
            adminPassword: creds.password,
            action: 'update',
            saleFirestoreId: editingSaleFirestoreId,
            sale: patch,
        };
        if (typeof addUpdatedBy === 'function') addUpdatedBy(updPayload);
        try {
            var updRes = await adminPostJson('/adminPropertySaleMutate', updPayload);
            if (updRes && updRes.sale) {
                showMessage('Venda atualizada.', 'success');
                cancelSaleEdit();
                await loadSalesData();
            }
        } catch (err) {
            showMessage(err.message || 'Erro ao atualizar venda.', 'error');
        }
        return;
    }

    var unitRaw = (document.getElementById('saleUnitCode') && document.getElementById('saleUnitCode').value || '').trim();
    var slot = typeof getSaleSlotInfoForProperty === 'function' ? getSaleSlotInfoForProperty(propertyId, unitRaw) : { error: 'Sistema de unidades indisponível', saleSlotKey: null };
    if (slot.error) {
        showMessage(slot.error, 'error');
        return;
    }

    var property = Array.isArray(properties) && properties.filter(function(p) { return p.id === propertyId || String(p.id) === String(propertyId); })[0];

    var adminUser = {};
    try {
        adminUser = JSON.parse(localStorage.getItem('adminUser') || '{}');
    } catch (e2) {}

    var saleData = {
        propertyId: propertyId,
        propertyTitle: property && property.title ? property.title : 'Imóvel',
        unitCode: slot.unitCode,
        saleSlotKey: slot.saleSlotKey,
        clientName: (document.getElementById('saleClientName') && document.getElementById('saleClientName').value) || '',
        clientCPF: clientCPF,
        clientEmail: ((document.getElementById('saleClientEmail') && document.getElementById('saleClientEmail').value) || '').trim().toLowerCase(),
        clientPhone: (document.getElementById('saleClientPhone') && document.getElementById('saleClientPhone').value) || '',
        salePrice: salePrice,
        contractNumber: (document.getElementById('saleContractNumber') && document.getElementById('saleContractNumber').value) || '',
        contractPhotos: contractPhotos.length > 0 ? contractPhotos : undefined,
        contractPhotosSkippedBySuperAdmin: !!(isSA && contractPhotos.length === 0),
        brokerName: adminUser.name || null,
        brokerEmail: adminUser.email || null,
        notes: (document.getElementById('saleNotes') && document.getElementById('saleNotes').value) || '',
    };
    if (typeof addCreatedBy === 'function') addCreatedBy(saleData);

    var syncEl = document.getElementById('saleSyncUnitStatus');
    var syncUnit = !!(syncEl && syncEl.checked);

    try {
        var result = await adminPostJson('/adminPropertySaleMutate', {
            adminEmail: creds.email,
            adminPassword: creds.password,
            action: 'create',
            sale: saleData,
            syncUnitStatus: syncUnit && !!slot.unitCode,
        });
        if (result && result.sale) {
            if (syncUnit && slot.unitCode && typeof setUnitStatusOverride === 'function') {
                setUnitStatusOverride(propertyId, slot.unitCode, 'assinado');
            }
            showMessage('Venda registrada com sucesso!', 'success');
            var formEl2 = (e && e.target) || document.getElementById('saleForm');
            if (formEl2) {
                formEl2.reset();
                var fp2 = document.getElementById('saleContractPhotos');
                if (fp2) fp2.value = '';
            }
            await loadSalesData();
            await registerClientFromSaleAndSendCredentials(saleData, result.sale);
        }
    } catch (err2) {
        var msg = (err2 && err2.message) ? err2.message : 'Erro ao registrar venda.';
        showMessage(msg, 'error');
    }
}

async function registerClientFromSaleAndSendCredentials(saleData, saleResult) {
    var email = (saleData.clientEmail || '').trim();
    if (!email) return;
    if (!firebaseAvailable() || typeof createClientAccountFromSale !== 'function') return;

    var propertyFromSale = typeof saleToClientProperty === 'function' ? saleToClientProperty(saleResult) : {
        id: saleResult.id,
        propertyId: saleResult.propertyId,
        title: saleResult.propertyTitle || 'Imóvel',
        price: saleResult.salePrice,
        purchaseDate: saleResult.saleDate,
        status: 'vendido',
        unitCode: saleResult.unitCode
    };

    var generatedPassword = typeof generateRandomPassword === 'function' ? generateRandomPassword() : Math.random().toString(36).slice(-10);
    var clientName = saleData.clientName || 'Cliente';
    var clientCpf = (saleData.clientCPF || '').replace(/\D/g, '');
    var clientPhone = (saleData.clientPhone || '').replace(/\D/g, '');

    var r = await createClientAccountFromSale(email, clientName, clientCpf, clientPhone, generatedPassword, propertyFromSale);

    if (typeof sendClientCredentialsEmail !== 'function') return;

    var creds = getAdminApiCredentials();

    if (r.created) {
        await sendClientCredentialsEmail(clientName, email, generatedPassword, true);
        showMessage('Credenciais enviadas por email ao cliente. Ele precisará alterar a senha no primeiro acesso.', 'success');
    } else if (r.error && String(r.error).indexOf('email-already-in-use') >= 0) {
        if (creds.email && creds.password) {
            try {
                await adminPostJson('/adminMergeClientProperty', {
                    adminEmail: creds.email,
                    adminPassword: creds.password,
                    clientEmail: email,
                    propertyFromSale: propertyFromSale,
                });
            } catch (mergeErr) {
                console.warn('merge cliente:', mergeErr);
            }
        }
        await sendClientCredentialsEmail(clientName, email, null, false);
        showMessage('Cliente já cadastrado. Imóvel vinculado ao perfil (quando possível). Email enviado.', 'success');
    }
}

async function deleteSale(saleId) {
    if (!confirm('Deseja remover esta venda? O vínculo do imóvel será removido do perfil do cliente no servidor, quando existir.')) return;

    var creds = getAdminApiCredentials();
    if (!creds.email || !creds.password) {
        showMessage('Faça login novamente para excluir vendas.', 'error');
        return;
    }
    try {
        await adminPostJson('/adminPropertySaleMutate', {
            adminEmail: creds.email,
            adminPassword: creds.password,
            action: 'delete',
            saleFirestoreId: String(saleId),
        });
        var sales = getSalesData();
        var updated = sales.filter(function(sale) { return String(sale.id) !== String(saleId); });
        localStorage.setItem('propertySales', JSON.stringify(updated));
        if (typeof loadPropertySales === 'function') loadPropertySales();
        showMessage('Venda removida com sucesso!', 'success');
        renderSalesTable();
    } catch (err) {
        showMessage(err.message || 'Erro ao remover venda.', 'error');
    }
}

// Show section
function showSection(sectionId) {
    var navItems = document.querySelectorAll('.nav-item');
    var i;
    for (i = 0; i < navItems.length; i++) {
        navItems[i].classList.remove('active');
    }
    var navLink = document.querySelector('.nav-item a[href="#' + sectionId + '"]') ||
        document.querySelector('[onclick*="showSection(\'' + sectionId + '\')"]');
    if (navLink && navLink.parentNode && navLink.parentNode.classList &&
            navLink.parentNode.classList.contains('nav-item')) {
        navLink.parentNode.classList.add('active');
    }

    var sections = document.querySelectorAll('.admin-section');
    for (i = 0; i < sections.length; i++) {
        sections[i].classList.remove('active');
    }
    var target = document.getElementById(sectionId);
    if (target) target.classList.add('active');
    
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
        case 'repairs':
            if (typeof loadAdminRepairs === 'function') loadAdminRepairs();
            break;
        case 'analytics':
            if (typeof loadAnalytics === 'function') loadAnalytics();
            break;
        case 'whatsapp-leads':
            if (typeof loadWhatsAppLeads === 'function') loadWhatsAppLeads();
            break;
    }
}

var ADMIN_FUNCTIONS_BASE = (typeof CONFIG !== 'undefined' && CONFIG.cloudFunctions && CONFIG.cloudFunctions.baseURL)
    ? CONFIG.cloudFunctions.baseURL
    : 'https://us-central1-site-interativo-b-f-marques.cloudfunctions.net';

function hasLikelyPhone(phone) {
    var digits = String(phone || '').replace(/\D/g, '');
    return digits.length >= 10;
}

function syncAdminDashboardLocalData() {
    if (typeof loadPropertiesFromStorage === 'function') {
        loadPropertiesFromStorage();
    }
    if ((!properties || properties.length === 0) && typeof loadProperties === 'function') {
        loadProperties();
    }
    if (typeof initializeReservationSystem === 'function') {
        initializeReservationSystem();
    }
    if (typeof loadPropertySales === 'function') {
        loadPropertySales();
    }
}

function adminFetchJson(path) {
    if (typeof ApiClient !== 'undefined' && ApiClient.get) {
        return ApiClient.get(path).catch(function() { return null; });
    }
    var sep = path.indexOf('?') >= 0 ? '&' : '?';
    return fetch(ADMIN_FUNCTIONS_BASE + path + sep + '_=' + Date.now(), { cache: 'no-store', credentials: 'omit' })
        .then(function(res) {
            if (!res.ok) return null;
            return res.text().then(function(txt) {
                if (!txt || !String(txt).trim()) return null;
                try {
                    return JSON.parse(txt);
                } catch (e) {
                    return null;
                }
            });
        })
        .catch(function() { return null; });
}

function adminPostJson(path, payload, extra) {
    if (typeof ApiClient !== 'undefined' && ApiClient.post) {
        return ApiClient.post(path, payload || {}, extra || {});
    }
    return fetch(ADMIN_FUNCTIONS_BASE + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
        cache: 'no-store',
        credentials: 'omit'
    }).then(function(res) {
        return res.text().then(function(txt) {
            var data = null;
            try { data = txt ? JSON.parse(txt) : null; } catch (_) { data = null; }
            if (!res.ok) {
                throw new Error((data && data.error) ? data.error : ('Erro ' + res.status));
            }
            return data || { success: true };
        });
    });
}

function formatDashboardRelativeTime(d) {
    var dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return '';
    var diff = Date.now() - dt.getTime();
    if (diff < 0) diff = 0;
    if (diff < 60000) return 'agora há pouco';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' min atrás';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' h atrás';
    if (diff < 172800000) return 'ontem';
    return dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function renderDashboardActivityList(items) {
    var container = document.getElementById('recentActivity');
    if (!container) return;
    if (!items || items.length === 0) {
        container.innerHTML = '<p class="empty-message">Nenhuma atividade recente registrada (reservas, vendas ou reparos).</p>';
        return;
    }
    container.innerHTML = items.map(function(activity) {
        return (
            '<div class="activity-item">' +
            '<div class="activity-icon ' + activity.type + '">' +
            '<i class="' + activity.icon + '"></i>' +
            '</div>' +
            '<div class="activity-text">' +
            '<p>' + activity.text + '</p>' +
            '<small>' + activity.time + '</small>' +
            '</div>' +
            '</div>'
        );
    }).join('');
}

function buildMergedDashboardActivity(repairsList, salesList) {
    var items = [];
    var i;
    if (typeof reservations !== 'undefined' && reservations.length) {
        var resCopy = reservations.slice().sort(function(a, b) {
            return new Date(b.createdAt) - new Date(a.createdAt);
        }).slice(0, 6);
        for (i = 0; i < resCopy.length; i++) {
            var rv = resCopy[i];
            var prop = typeof getPropertyById === 'function' ? getPropertyById(rv.propertyId) : null;
            var title = prop && prop.title ? prop.title : 'Imóvel #' + rv.propertyId;
            items.push({
                t: new Date(rv.createdAt).getTime(),
                type: 'reservation',
                icon: 'fas fa-calendar-check',
                text: 'Reserva: ' + title + (rv.clientName ? ' · ' + rv.clientName : ''),
                time: formatDashboardRelativeTime(rv.createdAt)
            });
        }
    }
    if (Array.isArray(salesList) && salesList.length) {
        var sCopy = salesList.slice().sort(function(a, b) {
            return new Date(b.saleDate || b.createdAt || 0) - new Date(a.saleDate || a.createdAt || 0);
        }).slice(0, 6);
        for (i = 0; i < sCopy.length; i++) {
            var s = sCopy[i];
            items.push({
                t: new Date(s.saleDate || s.createdAt || 0).getTime(),
                type: 'sale',
                icon: 'fas fa-handshake',
                text: 'Venda registrada: ' + (s.propertyTitle || 'Imóvel') + (s.clientName ? ' · ' + s.clientName : ''),
                time: formatDashboardRelativeTime(s.saleDate || s.createdAt)
            });
        }
    }
    if (Array.isArray(repairsList) && repairsList.length) {
        var rCopy = repairsList.slice().sort(function(a, b) {
            return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        }).slice(0, 6);
        for (i = 0; i < rCopy.length; i++) {
            var rp = rCopy[i];
            items.push({
                t: new Date(rp.createdAt || 0).getTime(),
                type: 'property',
                icon: 'fas fa-tools',
                text: 'Reparo: ' + (rp.propertyTitle || rp.description || 'Solicitação').substring(0, 80) +
                    (rp.clientName ? ' · ' + rp.clientName : ''),
                time: formatDashboardRelativeTime(rp.createdAt)
            });
        }
    }
    items.sort(function(a, b) { return b.t - a.t; });
    return items.slice(0, 12);
}

function applyRemoteDashboardWidgets(waStats, repairsOpen, salesCount, brokersActive, localBrokersFallback, bundleExtras) {
    var waEl = document.getElementById('dashboardWaLeads');
    var waSub = document.getElementById('dashboardWaLeadsSub');
    var repEl = document.getElementById('dashboardRepairsOpen');
    var salEl = document.getElementById('dashboardSalesRegistered');
    var elBrok = document.getElementById('totalBrokers');

    if (waEl) waEl.textContent = waStats && waStats.total != null ? String(waStats.total) : '0';
    if (waSub) {
        var bits = [];
        if (waStats && waStats.pendentesLeitura > 0) bits.push(waStats.pendentesLeitura + ' sem leitura');
        if (waStats && waStats.emAtendimento > 0) bits.push(waStats.emAtendimento + ' em atendimento');
        if (waStats && waStats.followUpElegivel > 0) bits.push(waStats.followUpElegivel + ' follow-up ativo');
        if (waStats && waStats.followUpExcluded > 0) bits.push(waStats.followUpExcluded + ' sem follow-up');
        if (bundleExtras && bundleExtras.funnelReservas > 0) bits.push(bundleExtras.funnelReservas + ' reservas');
        waSub.textContent = bits.join(' · ');
    }
    if (repEl) repEl.textContent = repairsOpen != null ? String(repairsOpen) : '0';
    if (salEl) salEl.textContent = salesCount != null ? String(salesCount) : '0';
    if (elBrok && brokersActive != null) elBrok.textContent = String(brokersActive);
    else if (elBrok) elBrok.textContent = String(localBrokersFallback);
}

function fetchDashboardSalesListForActivity() {
    var creds = getAdminApiCredentials();
    if (!creds.email || !creds.password) return Promise.resolve(null);
    return adminPostJson('/adminPropertySalesList', { adminEmail: creds.email, adminPassword: creds.password }).then(function(d) {
        return d && d.sales ? d.sales : null;
    }).catch(function() { return null; });
}

function fetchDashboardRemoteThenActivity(localBrokers) {
    adminFetchJson('/adminDashboardBundle').then(function(bundle) {
        var repairsList = null;
        var salesList = null;
        if (bundle && !bundle.error && bundle.wa) {
            applyRemoteDashboardWidgets(bundle.wa, bundle.repairsOpen, bundle.salesCount, bundle.brokersActive, localBrokers, bundle);
        } else {
            return Promise.all([
                adminFetchJson('/getBrokers'),
                adminFetchJson('/chatbotInbox?action=stats'),
                adminFetchJson('/getRepairs'),
                fetchDashboardSalesListForActivity()
            ]).then(function(results) {
                var brokersList = results[0];
                var waStats = results[1] || {};
                repairsList = results[2];
                salesList = results[3];
                var activeCount = localBrokers;
                if (Array.isArray(brokersList) && brokersList.length) {
                    activeCount = 0;
                    for (var b = 0; b < brokersList.length; b++) {
                        if (brokersList[b].isActive) activeCount++;
                    }
                }
                var repOpen = null;
                if (Array.isArray(repairsList)) {
                    repOpen = 0;
                    for (var r = 0; r < repairsList.length; r++) {
                        var st = String(repairsList[r].status || '').toLowerCase();
                        if (st !== 'concluido' && st !== 'cancelado') repOpen++;
                    }
                }
                var salesLen = Array.isArray(salesList) ? salesList.length : null;
                applyRemoteDashboardWidgets(waStats, repOpen, salesLen, activeCount, localBrokers);
                renderDashboardActivityList(buildMergedDashboardActivity(repairsList, salesList));
            });
        }
        return Promise.all([
            adminFetchJson('/getRepairs'),
            fetchDashboardSalesListForActivity()
        ]).then(function(rs) {
            renderDashboardActivityList(buildMergedDashboardActivity(rs[0], rs[1]));
        });
    }).catch(function() {
        applyRemoteDashboardWidgets({ total: 0 }, 0, 0, undefined, localBrokers);
        renderDashboardActivityList(buildMergedDashboardActivity(null, null));
    });
}

// Load dashboard data
function loadDashboardData() {
    syncAdminDashboardLocalData();

    if ((!properties || properties.length === 0) && typeof loadProperties === 'function') {
        loadProperties();
    }

    var agg = typeof getAggregatedUnitInventoryForDashboard === 'function'
        ? getAggregatedUnitInventoryForDashboard()
        : null;
    var stats = typeof getPropertyStatistics === 'function' ? getPropertyStatistics() : {
        total: 0, available: 0, reserved: 0, sold: 0, totalValue: 0, availablePortfolioValue: 0
    };
    var localBrokers = typeof getActiveBrokers === 'function' ? getActiveBrokers().length : 0;

    var elTotal = document.getElementById('totalProperties');
    var elAvail = document.getElementById('availableProperties');
    var elRes = document.getElementById('reservedProperties');
    var elSold = document.getElementById('soldProperties');
    var elBrok = document.getElementById('totalBrokers');
    var elVal = document.getElementById('totalValue');

    var empCount = stats.total;
    if (agg && agg.empreendimentos > 0) empCount = agg.empreendimentos;

    if (elTotal) elTotal.textContent = String(empCount);

    if (agg && agg.unidadesTotal > 0) {
        if (elAvail) elAvail.textContent = String(agg.disponivel);
        if (elRes) elRes.textContent = String(agg.reservado);
        if (elSold) elSold.textContent = String(agg.assinado);
        if (elVal) elVal.textContent = 'R$ ' + (agg.valorDisponiveis || 0).toLocaleString('pt-BR');
    } else {
        if (elAvail) elAvail.textContent = String(stats.available);
        if (elRes) elRes.textContent = String(stats.reserved);
        if (elSold) elSold.textContent = String(stats.sold);
        var portVal = typeof stats.availablePortfolioValue === 'number' ? stats.availablePortfolioValue : 0;
        if (!portVal && typeof stats.totalValue === 'number') portVal = stats.totalValue;
        if (elVal) elVal.textContent = 'R$ ' + portVal.toLocaleString('pt-BR');
    }

    if (elBrok) elBrok.textContent = String(localBrokers);

    loadExpiringReservations();

    fetchDashboardRemoteThenActivity(localBrokers);
}

// Atividade de exemplo (fallback se necessário)
function loadRecentActivity() {
    renderDashboardActivityList(buildMergedDashboardActivity(null, null));
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
                    <p>${property && property.title ? property.title : 'Imóvel não encontrado'}</p>
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

var _brokerCampaignPreview = null;

function isAdminPanelLoggedIn() {
    try {
        return !!localStorage.getItem('adminUser');
    } catch (e) {
        return false;
    }
}

// Load brokers data
async function loadBrokersData() {
    const tbody = document.getElementById('brokersTableBody');
    if (!tbody) return;
    const btnAdd = document.getElementById('btnAddBroker');
    if (btnAdd) btnAdd.style.display = (typeof isSuperAdmin === 'function' && isSuperAdmin()) ? '' : 'none';
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">Carregando corretores...</td></tr>';

    await prepareBrokersPanelIfNeeded(false);

    if (typeof loadBrokersFromFirestore === 'function') {
        await loadBrokersFromFirestore();
    }

    renderPendingBrokersSection();

    const allBrokers = getAllBrokers().filter(function(b) { return !!b.isActive; });
    var testSelect = document.getElementById('brokerCampaignTestSelect');
    if (testSelect) {
        var activeBrokers = allBrokers.filter(function(b) {
            return !!b.isActive && hasLikelyPhone(b.phone);
        });
        if (activeBrokers.length === 0) {
            activeBrokers = allBrokers.filter(function(b) { return !!b.isActive; });
        }
        var opts = ['<option value="">Selecione um corretor ativo</option>'];
        activeBrokers.forEach(function(b) {
            var adminTag = b.isAdmin ? ' [Admin]' : '';
            opts.push('<option value="' + String(b.id).replace(/"/g, '&quot;') + '">' +
                (b.name || b.email || ('Corretor ' + b.id)) + adminTag + ' - ' + (b.phone || 'sem telefone') +
                '</option>');
        });
        if (activeBrokers.length === 0) {
            opts.push('<option value="" disabled>Nenhum corretor ativo encontrado</option>');
        }
        testSelect.innerHTML = opts.join('');
    }
    
    const brokerId = (id) => typeof id === 'string' ? `'${id.replace(/'/g, "\\'")}'` : id;
    if (allBrokers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">Nenhum corretor ativo. Aprove cadastros pendentes ou atualize a lista.</td></tr>';
        return;
    }
    tbody.innerHTML = allBrokers.map(function(broker) {
        var campOn = !broker.whatsappCampaignOptOut;
        var phoneOk = typeof hasLikelyPhone === 'function' ? hasLikelyPhone(broker.phone) : !!(broker.phone && String(broker.phone).replace(/\D/g, '').length >= 10);
        var rowClass = campOn && phoneOk ? '' : ' class="broker-row-muted"';
        var actions = '<select class="broker-action-select" onchange="brokerRowAction(this, ' + brokerId(broker.id) + ')" aria-label="Ações do corretor">' +
            '<option value="">Ações</option>' +
            '<option value="edit">Editar</option>' +
            '<option value="toggle_campaign">' + (campOn ? 'Retirar da campanha' : 'Incluir na campanha') + '</option>' +
            '<option value="deactivate">Desativar corretor</option>';
        if (typeof isSuperAdmin === 'function' && isSuperAdmin()) {
            actions += '<option value="delete">Excluir cadastro</option>';
        }
        actions += '</select>';
        return '<tr' + rowClass + '>' +
            '<td><strong>' + (broker.name || '—') + '</strong></td>' +
            '<td>' + (broker.email || '') + '</td>' +
            '<td>' + (broker.phone || '—') + '</td>' +
            '<td>' + (broker.creci || '—') + '</td>' +
            '<td><span class="status-badge status-' + (campOn ? 'ativo' : 'inativo') + '">' + (campOn ? 'Recebe' : 'Opt-out') + '</span></td>' +
            '<td>' + formatDate(broker.createdAt) + '</td>' +
            '<td>' + actions + '</td>' +
            '</tr>';
    }).join('');
}

function renderPendingBrokersSection() {
    var section = document.getElementById('brokersPendingSection');
    var tbody = document.getElementById('brokersPendingTableBody');
    var countEl = document.getElementById('brokersPendingCount');
    if (!section || !tbody) return;

    var pending = [];
    if (typeof getPendingBrokers === 'function') {
        pending = getPendingBrokers().filter(function(b) { return !b.isAdmin; });
    }

    if (countEl) countEl.textContent = String(pending.length);

    if (pending.length === 0) {
        section.style.display = 'none';
        tbody.innerHTML = '';
        return;
    }

    section.style.display = '';
    var brokerId = function(id) { return typeof id === 'string' ? "'" + String(id).replace(/'/g, "\\'") + "'" : id; };
    tbody.innerHTML = pending.map(function(broker) {
        return '<tr class="broker-row-pending">' +
            '<td><strong>' + (broker.name || '—') + '</strong></td>' +
            '<td>' + (broker.email || '') + '</td>' +
            '<td>' + (broker.phone || '—') + '</td>' +
            '<td>' + (broker.creci || '—') + '</td>' +
            '<td>' + formatDate(broker.createdAt) + '</td>' +
            '<td class="brokers-pending-actions">' +
            '<button type="button" class="btn btn-success btn-sm" onclick="approveBroker(' + brokerId(broker.id) + ')">' +
            '<i class="fas fa-check" aria-hidden="true"></i> Aprovar</button> ' +
            '<button type="button" class="btn btn-secondary btn-sm" onclick="editBroker(' + brokerId(broker.id) + ')">' +
            '<i class="fas fa-edit" aria-hidden="true"></i> Editar</button> ' +
            (typeof isSuperAdmin === 'function' && isSuperAdmin()
                ? '<button type="button" class="btn btn-danger btn-sm" onclick="deleteBroker(' + brokerId(broker.id) + ')">' +
                  '<i class="fas fa-trash" aria-hidden="true"></i> Excluir</button>'
                : '') +
            '</td></tr>';
    }).join('');
}

function brokerRowAction(selectEl, id) {
    var action = selectEl ? selectEl.value : '';
    if (selectEl) selectEl.value = '';
    if (!action || !id) return;
    if (action === 'edit') {
        editBroker(id);
        return;
    }
    if (action === 'toggle_campaign') {
        var b = typeof findBrokerById === 'function' ? findBrokerById(id) : null;
        toggleBrokerCampaignOptOut(id, !(b && b.whatsappCampaignOptOut));
        return;
    }
    if (action === 'deactivate') {
        deactivateBroker(id);
        return;
    }
    if (action === 'delete') {
        deleteBroker(id);
    }
}

function renderBrokerProductionMigration(preview) {
    var box = document.getElementById('brokerCampaignProductionBox');
    var summaryEl = document.getElementById('brokerProductionSummary');
    var stepsEl = document.getElementById('brokerProductionSteps');
    var badgeEl = document.getElementById('brokerProductionStatusBadge');
    var mig = preview && preview.productionMigration ? preview.productionMigration : null;
    if (!box || !mig) {
        if (box) box.hidden = true;
        return;
    }
    box.hidden = false;
    box.className = 'broker-production-box' + (mig.productionReady ? ' broker-production-box--ready' : '');
    if (summaryEl) summaryEl.textContent = mig.summary || '';
    if (badgeEl) {
        badgeEl.textContent = mig.productionReady
            ? 'Produção OK'
            : (mig.isTestAccount ? 'Conta TESTE' : 'Pendente (' + (mig.pendingSteps || '?') + ')');
    }
    if (stepsEl) {
        var html = '';
        var steps = mig.steps || [];
        var i;
        for (i = 0; i < steps.length; i++) {
            var st = steps[i];
            html += '<li class="' + (st.done ? 'is-done' : '') + '">';
            if (st.link) {
                html += '<a href="' + st.link + '" target="_blank" rel="noopener">' + escapeHtml(st.label) + '</a>';
            } else {
                html += escapeHtml(st.label);
            }
            html += '</li>';
        }
        stepsEl.innerHTML = html;
    }
}

function renderBrokerCampaignKpis(preview) {
    _brokerCampaignPreview = preview || null;
    var ready = preview ? (preview.readyToSend != null ? preview.readyToSend : preview.eligible) : 0;
    var active = preview ? (preview.totalActiveNotOptOut || 0) : 0;
    var optOut = preview ? (preview.optOut || 0) : 0;
    var noPhone = preview ? (preview.invalidPhone || 0) : 0;

    var elReady = document.getElementById('brokerKpiReady');
    var elActive = document.getElementById('brokerKpiActive');
    var elOpt = document.getElementById('brokerKpiOptOut');
    var elPhone = document.getElementById('brokerKpiNoPhone');
    if (elReady) { elReady.textContent = String(ready); elReady.setAttribute('data-value', String(ready)); }
    if (elActive) elActive.textContent = String(active);
    if (elOpt) elOpt.textContent = String(optOut);
    if (elPhone) elPhone.textContent = String(noPhone);

    var btn = document.getElementById('brokerCampaignBtnSendNow');
    if (btn) btn.disabled = !(preview && preview.isReady && ready > 0);

    var tplHint = document.getElementById('brokerCampaignTemplateHint');
    if (tplHint) {
        if (preview && preview.hasTemplate && preview.templateValid === false) {
            tplHint.textContent = preview.templateHint || 'Template inválido na Meta (erro 132001). Corrija o nome abaixo.';
            tplHint.style.color = '#b45309';
        } else if (preview && preview.templateHint) {
            tplHint.textContent = preview.templateHint;
            tplHint.style.color = preview.templateValid ? '#047857' : '';
        } else {
            tplHint.textContent = 'Nome exato na Meta: só minúsculas e _. Obrigatório se a Bia nunca falou com o corretor.';
            tplHint.style.color = '';
        }
    }

    var hint = document.getElementById('brokerCampaignPreviewStats');
    if (hint) {
        if (preview && preview.hasTemplate && preview.templateValid === false) {
            hint.textContent = 'Corrija o template Meta antes de disparar. ' + (preview.templateHint || '');
        } else if (preview && preview.whatsappTestAccount) {
            hint.textContent = (preview.whatsappTestAccountHint || 'Conta WhatsApp de TESTE na Meta.') +
                ' Abra o checklist “Migrar para produção” acima para liberar envio a todos os corretores.';
        } else if (preview && preview.isReady && ready > 0) {
            hint.textContent = 'Pronto: ' + ready + ' corretor(es) — 1 mensagem com nome, destaque, links do empreendimento e do site, notícia do dia + até 2 fotos e 1 vídeo.';
            if (preview.campaignWeek && preview.campaignWeek.featuredPropertyTitle) {
                hint.textContent += ' Destaque: ' + preview.campaignWeek.featuredPropertyTitle;
                if (preview.campaignWeek.featuredPrice) hint.textContent += ' (' + preview.campaignWeek.featuredPrice + ')';
                if (preview.campaignWeek.featuredPropertyUrl) hint.textContent += ' — ' + preview.campaignWeek.featuredPropertyUrl;
            }
            if (!preview.hasTemplate) {
                hint.textContent += ' Sem template: só entrega se o corretor falou com a Bia nas últimas 24h.';
            }
        } else if (preview && preview.duplicateRecordsInDb > 0) {
            hint.textContent = 'Há duplicatas ativas. Abra Manutenção → Preparar base novamente.';
        } else if (ready === 0) {
            hint.textContent = 'Nenhum destinatário elegível. Confira telefone (DDD+9) e coluna Campanha = Recebe.';
        } else {
            hint.textContent = preview && preview.nextWeeklyNote ? preview.nextWeeklyNote : '';
        }
    }
    renderBrokerProductionMigration(preview);
}

function syncBrokerCampaignWeeklyCheckboxes(sourceEl) {
    var top = document.getElementById('brokerCampaignEnabledTop');
    var inner = document.getElementById('brokerCampaignEnabled');
    var checked = !!(sourceEl && sourceEl.checked);
    if (top && sourceEl !== top) top.checked = checked;
    if (inner && sourceEl !== inner) inner.checked = checked;
    updateBrokerCampaignWeeklyBarUi(checked);
}

function onBrokerCampaignWeeklyToggleChange(el) {
    syncBrokerCampaignWeeklyCheckboxes(el);
}

function updateBrokerCampaignWeeklyBarUi(enabled) {
    var bar = document.querySelector('.broker-campaign-weekly-bar');
    var statusEl = document.getElementById('brokerCampaignWeeklyStatus');
    if (bar) {
        if (enabled) bar.classList.remove('is-off');
        else bar.classList.add('is-off');
    }
    if (statusEl) {
        statusEl.textContent = enabled
            ? 'Ligada — próximo envio automático: segunda-feira 08h'
            : 'Desligada — só envia com Disparar agora ou Testar';
    }
}

function fillBrokerCampaignPropertySelect(propertyList, selectedId) {
    var sel = document.getElementById('brokerCampaignFeaturedProperty');
    if (!sel) return;
    var current = selectedId != null && selectedId !== '' ? String(selectedId) : sel.value;
    var html = '<option value="">Automático (rotação por semana)</option>';
    var i;
    var list = propertyList || [];
    for (i = 0; i < list.length; i++) {
        html += '<option value="' + list[i].id + '">' +
            escapeHtml(String(list[i].title)) + ' — ' + escapeHtml(String(list[i].price || '')) +
            '</option>';
    }
    sel.innerHTML = html;
    if (current) sel.value = current;
}

function updateBrokerCampaignWeekPreviewLine(preview) {
    var el = document.getElementById('brokerCampaignWeekPreview');
    if (!el || !preview) return;
    var cw = preview.campaignWeek;
    if (!cw) {
        el.textContent = '';
        return;
    }
    var txt = 'Prévia desta configuração: ';
    if (cw.featuredManual) txt += 'destaque manual — ';
    txt += (cw.featuredPropertyTitle || '—');
    if (cw.featuredPrice) txt += ' (' + cw.featuredPrice + ')';
    if (cw.featuredPropertyUrl) txt += '. Link: ' + cw.featuredPropertyUrl;
    txt += '. Notícia: ' + (cw.marketCustom ? 'personalizada' : 'automática') +
        ' — ' + (cw.marketSnippetTitle || '');
    el.textContent = txt;
}

function applyBrokerCampaignConfigFields(cfg) {
    if (!cfg) return;
    var check = document.getElementById('brokerCampaignEnabled');
    var checkTop = document.getElementById('brokerCampaignEnabledTop');
    if (check) check.checked = !!cfg.enabled;
    if (checkTop) checkTop.checked = !!cfg.enabled;
    updateBrokerCampaignWeeklyBarUi(!!cfg.enabled);
    var title = document.getElementById('brokerCampaignTitle');
    var siteUrl = document.getElementById('brokerCampaignSiteUrl');
    var contact = document.getElementById('brokerCampaignContact');
    var cta = document.getElementById('brokerCampaignCta');
    var tips = document.getElementById('brokerCampaignTips');
    var tpl = document.getElementById('brokerCampaignTemplate');
    var marketTitle = document.getElementById('brokerCampaignMarketTitle');
    var marketText = document.getElementById('brokerCampaignMarketText');
    if (title && cfg.weeklyTitle) title.value = cfg.weeklyTitle;
    if (siteUrl && cfg.siteUrl) siteUrl.value = cfg.siteUrl;
    if (contact && cfg.whatsappContato) contact.value = cfg.whatsappContato;
    if (cta && cfg.ctaText) cta.value = cfg.ctaText;
    if (tpl) tpl.value = cfg.templateName || 'campanha_corretor_msg';
    if (tips && Array.isArray(cfg.usefulTips)) tips.value = cfg.usefulTips.join('\n');
    if (marketTitle) marketTitle.value = cfg.marketNewsTitle || '';
    if (marketText) marketText.value = cfg.marketNewsText || '';
    if (cfg.campaignProperties && cfg.campaignProperties.length) {
        fillBrokerCampaignPropertySelect(cfg.campaignProperties, cfg.featuredPropertyId);
    } else {
        var featSelOnly = document.getElementById('brokerCampaignFeaturedProperty');
        if (featSelOnly) {
            featSelOnly.value = (cfg.featuredPropertyId != null && cfg.featuredPropertyId !== '')
                ? String(cfg.featuredPropertyId) : '';
        }
    }
    updateBrokerCampaignWeekPreviewLine({ campaignWeek: cfg.campaignWeek });
}

function loadBrokerCampaignPreview() {
    return adminFetchJson('/brokerCampaignPreview').then(function(preview) {
        renderBrokerCampaignKpis(preview);
        if (preview && preview.campaignProperties) {
            fillBrokerCampaignPropertySelect(
                preview.campaignProperties,
                preview.featuredPropertyId != null ? preview.featuredPropertyId : ''
            );
        }
        updateBrokerCampaignWeekPreviewLine(preview);
        var wabaEl = document.getElementById('brokerCampaignWabaId');
        var biaEl = document.getElementById('brokerCampaignBiaPhoneId');
        var wabaHint = document.getElementById('brokerCampaignWabaHint');
        if (wabaEl && preview && preview.wabaId && !wabaEl.value) wabaEl.value = preview.wabaId;
        if (biaEl && preview) {
            biaEl.value = preview.biaPhoneNumberId || preview.cloudPhoneNumberId || '';
            if (preview.biaPhoneDisplay) {
                biaEl.value += ' — ' + preview.biaPhoneDisplay;
            }
        }
        if (wabaHint && preview) {
            var hintTxt = '';
            if (preview.envMisconfiguredAsWaba && !preview.biaPhoneNumberId) {
                hintTxt = 'Ajuste o secret WHATSAPP_PHONE_NUMBER_ID no Firebase (Phone number ID da Meta). ';
            }
            if (preview.syncHint) hintTxt += preview.syncHint + ' ';
            if (preview.wabaId && preview.phoneMatch === false) {
                hintTxt += (preview.templateHint || 'Envie qualquer mensagem para a Bia no WhatsApp e clique Salvar WABA de novo.');
                wabaHint.style.color = '#b45309';
            } else if (preview.biaPhoneNumberId) {
                hintTxt += 'Conta WABA ' + preview.wabaId + '. Número da Bia: ' + preview.biaPhoneNumberId + '.';
                wabaHint.style.color = '#047857';
            } else if (preview.wabaId) {
                hintTxt += 'Salve o WABA e envie uma mensagem para a Bia para detectar o número.';
                wabaHint.style.color = '#b45309';
            } else {
                hintTxt += 'Cole o ID da conta (WABA) do WhatsApp Manager e clique Salvar WABA.';
                wabaHint.style.color = '';
            }
            wabaHint.textContent = hintTxt;
        }
        return preview;
    }).catch(function() {
        var hint = document.getElementById('brokerCampaignPreviewStats');
        if (hint) hint.textContent = 'Não foi possível carregar o resumo.';
        return null;
    });
}

function prepareBrokersPanelIfNeeded(force) {
    var statusEl = document.getElementById('brokerCampaignPrepareStatus');
    var creds = typeof getAdminApiCredentials === 'function' ? getAdminApiCredentials() : null;
    if (!creds || !creds.email || !creds.password) {
        if (statusEl) statusEl.textContent = 'Entre com email e senha do admin para preparar a campanha.';
        return loadBrokerCampaignPreview();
    }
    if (!force) {
        try {
            if (sessionStorage.getItem('brokerCampaignPrepared') === '1') {
                if (statusEl) statusEl.textContent = 'Base preparada.';
                return loadBrokerCampaignPreview().then(function() {
                    return adminFetchJson('/brokerCampaignConfig').then(applyBrokerCampaignConfigFields);
                });
            }
        } catch (e) {}
    }
    if (statusEl) statusEl.textContent = 'Preparando base automaticamente...';
    return adminPostJson('/brokerCampaignPrepare', {
        adminEmail: creds.email,
        adminPassword: creds.password,
        purgeArchived: true,
        forceCleanup: !!force
    }, { timeoutMs: 300000 }).then(function(r) {
        try { sessionStorage.setItem('brokerCampaignPrepared', '1'); } catch (e) {}
        if (r && r.preview) renderBrokerCampaignKpis(r.preview);
        if (statusEl) {
            var msg = 'Pronto. Pode usar Disparar agora quando quiser.';
            if (r && r.cleanup && r.cleanup.archivedPurged > 0) {
                msg += ' (' + r.cleanup.archivedPurged + ' arquivados removidos.)';
            } else if (r && r.cleanup && r.cleanup.duplicatesDeactivated > 0) {
                msg += ' (' + r.cleanup.duplicatesDeactivated + ' duplicatas desativadas.)';
            }
            statusEl.textContent = msg;
        }
        return adminFetchJson('/brokerCampaignConfig').then(applyBrokerCampaignConfigFields);
    }).catch(function(err) {
        if (statusEl) statusEl.textContent = 'Erro na preparação: ' + (err.message || '');
        return loadBrokerCampaignPreview();
    });
}

function prepareBrokersPanelManual(force) {
    try { sessionStorage.removeItem('brokerCampaignPrepared'); } catch (e) {}
    prepareBrokersPanelIfNeeded(true);
}

function showBrokerCampaignResult(result, isError) {
    var sent = result && result.sent ? result.sent : 0;
    var errors = result && result.errors ? result.errors : 0;
    var skipped = result && result.skipped ? result.skipped : 0;
    var eligible = result && result.eligible !== undefined ? result.eligible : null;
    var msgType = 'success';
    var txt = 'Disparo concluído. Enviados: ' + sent + ', erros: ' + errors + ', pulados (telefone inválido): ' + skipped + '.';
    if (eligible !== null) txt += ' Elegíveis: ' + eligible + '.';
    if (result && result.templateName) txt += ' Template: ' + result.templateName + '.';
    if (result && result.campaignWeek && result.campaignWeek.featuredPropertyTitle) {
        txt += ' Destaque: ' + result.campaignWeek.featuredPropertyTitle + '.';
    }
    if (result && result.sentDetails && result.sentDetails.length && result.sentDetails[0].featuredTitle) {
        txt += ' Fotos/vídeo: ' + (result.sentDetails[0].mediaSent || 0) + ' mídia(s) enviada(s).';
    }
    if (result && result.issues && result.issues.length) {
        var errBits = [];
        var ei;
        for (ei = 0; ei < result.issues.length && errBits.length < 3; ei++) {
            var iss = result.issues[ei];
            if (iss.status === 'error') {
                errBits.push((iss.name || iss.phone || 'corretor') + ': ' + (iss.error || iss.reason || 'erro'));
            }
        }
        if (errBits.length) txt += ' Exemplos de erro: ' + errBits.join(' | ');
    }
    if (skipped > 0 && sent === 0 && errors === 0) {
        txt += ' Nenhuma mensagem enviada: revise os telefones dos corretores ativos (DDD + 9 dígitos).';
    } else if (errors > 0 && sent === 0) {
        txt += ' Se aparecer código 132001, o template não existe na Meta — escolha um nome da lista (minúsculas) ou crie um template Marketing aprovado.';
        if (!(result && result.templateName)) {
            txt += ' Sem template válido a Meta bloqueia quem nunca falou com a Bia.';
        }
    } else if (skipped > 0) {
        txt += ' Corretores pulados precisam de telefone no formato 21987654321.';
    }
    if (sent > 0 && result && result.sentDetails && result.sentDetails.length) {
        var row = result.sentDetails[0];
        txt += ' Destino: ' + (row.phone || '?');
        if (row.phoneCadastro && row.phoneCadastro !== row.phone) {
            txt += ' (cadastro: ' + row.phoneCadastro + ')';
        }
        txt += '.';
        if (row.name) txt += ' Corretor: ' + row.name + '.';
        if (row.mode) txt += ' Modo: ' + row.mode + '.';
        if (row.waMessageId) txt += ' ID Meta: ' + row.waMessageId + '.';
        if (row.deliveryStatus) txt += ' Entrega Meta: ' + row.deliveryStatus + '.';
        if (row.deliveryNote) txt += ' ' + row.deliveryNote;
        if (row.status === 'accepted' || row.deliveryStatus === 'pending') {
            msgType = 'warning';
            txt += ' API aceitou, mas o WhatsApp pode não ter entregue (conta de teste, número sem WhatsApp ou webhook de status).';
        }
        if (row.deliveryStatus === 'failed') {
            msgType = 'error';
        }
        if (row.mode === 'text') {
            txt += ' Texto livre não entrega a quem nunca falou com a Bia — configure WABA e campanha_corretor_msg.';
            msgType = 'warning';
        }
    }
    if (result && result.sentDetails && result.sentDetails.length && result.sentDetails[0].status === 'accepted') {
        msgType = 'warning';
    }
    if (isError) msgType = 'error';
    else if (errors > 0) msgType = 'warning';
    else if (result && result.deliveryWarning) msgType = 'warning';
    else if (sent === 0 && errors > 0) msgType = 'error';
    if (result && result.deliveryWarning) {
        txt = result.deliveryWarning + ' ' + txt;
    }
    if (typeof showMessage === 'function') showMessage(txt, msgType);
    loadBrokerCampaignPreview();
}

function setBrokerCampaignButtonsBusy(busy) {
    var ids = ['brokerCampaignBtnSendNow', 'brokerCampaignBtnTest'];
    for (var i = 0; i < ids.length; i++) {
        var btn = document.getElementById(ids[i]);
        if (btn) btn.disabled = !!busy;
    }
}

function pollBrokerCampaignRun(runId, attempt) {
    if (attempt > 150) {
        setBrokerCampaignButtonsBusy(false);
        if (typeof showMessage === 'function') {
            showMessage('O disparo ainda está em processamento no servidor. Atualize a página em alguns minutos.', 'warning');
        }
        return;
    }
    adminFetchJson('/brokerCampaignRunStatus?runId=' + encodeURIComponent(runId)).then(function(st) {
        if (!st || st.status === 'queued' || st.status === 'running') {
            var waitEl = document.getElementById('brokerCampaignPreviewStats');
            if (waitEl) {
                waitEl.textContent = 'Disparo em andamento... (' + (attempt + 1) + 's) Aguarde.';
            }
            setTimeout(function() { pollBrokerCampaignRun(runId, attempt + 1); }, 2000);
            return;
        }
        setBrokerCampaignButtonsBusy(false);
        if (st.status === 'error') {
            if (typeof showMessage === 'function') showMessage('Erro no disparo: ' + (st.error || 'falha no servidor'), 'error');
            loadBrokerCampaignPreview();
            return;
        }
        showBrokerCampaignResult(st, false);
    }).catch(function(err) {
        setBrokerCampaignButtonsBusy(false);
        if (typeof showMessage === 'function') showMessage('Erro ao acompanhar disparo: ' + (err.message || ''), 'error');
    });
}

function loadBrokerCampaignTemplatesDatalist() {
    var listEl = document.getElementById('brokerCampaignTemplateList');
    if (!listEl) return;
    adminFetchJson('/brokerCampaignTemplates').then(function(data) {
        var templates = (data && data.templates) ? data.templates : [];
        var html = '';
        var seen = {};
        var i;
        for (i = 0; i < templates.length; i++) {
            var n = templates[i].name;
            if (!n || seen[n]) continue;
            seen[n] = true;
            html += '<option value="' + escapeHtml(n) + '"></option>';
        }
        listEl.innerHTML = html;
    }).catch(function() {});
}

function loadBrokerCampaignConfig() {
    loadBrokerCampaignTemplatesDatalist();
    prepareBrokersPanelIfNeeded(false);
}

function brokerCampaignRequestPayload(extra) {
    var p = extra || {};
    var creds = typeof getAdminApiCredentials === 'function' ? getAdminApiCredentials() : null;
    if (creds && creds.email) {
        p.adminEmail = creds.email;
        p.adminPassword = creds.password || '';
    }
    return p;
}

function collectBrokerCampaignConfigPayload() {
    var check = document.getElementById('brokerCampaignEnabledTop') || document.getElementById('brokerCampaignEnabled');
    var title = document.getElementById('brokerCampaignTitle');
    var siteUrl = document.getElementById('brokerCampaignSiteUrl');
    var contact = document.getElementById('brokerCampaignContact');
    var cta = document.getElementById('brokerCampaignCta');
    var tips = document.getElementById('brokerCampaignTips');
    var tpl = document.getElementById('brokerCampaignTemplate');
    var feat = document.getElementById('brokerCampaignFeaturedProperty');
    var marketTitle = document.getElementById('brokerCampaignMarketTitle');
    var marketText = document.getElementById('brokerCampaignMarketText');
    var usefulTips = [];
    if (tips && tips.value) {
        usefulTips = tips.value.split('\n').map(function(t) { return String(t || '').trim(); }).filter(Boolean);
    }
    var featVal = feat ? String(feat.value || '').trim() : '';
    return {
        enabled: !!(check && check.checked),
        weeklyTitle: title ? title.value : '',
        siteUrl: siteUrl ? siteUrl.value : '',
        whatsappContato: contact ? contact.value : '',
        templateName: tpl ? String(tpl.value || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') : '',
        templateLanguage: 'pt_BR',
        ctaText: cta ? cta.value : '',
        usefulTips: usefulTips,
        featuredPropertyId: featVal === '' ? '' : Number(featVal),
        marketNewsTitle: marketTitle ? marketTitle.value : '',
        marketNewsText: marketText ? marketText.value : ''
    };
}

function saveBrokerCampaignConfig() {
    var top = document.getElementById('brokerCampaignEnabledTop');
    var inner = document.getElementById('brokerCampaignEnabled');
    if (top && inner) inner.checked = top.checked;
    adminPostJson('/brokerCampaignConfig', collectBrokerCampaignConfigPayload()).then(function(res) {
        if (res && res.config) applyBrokerCampaignConfigFields(res.config);
        loadBrokerCampaignPreview();
        if (typeof showMessage === 'function') {
            showMessage('Configuração da campanha salva.', 'success');
        }
        updateBrokerCampaignWeeklyBarUi(top ? top.checked : !!(inner && inner.checked));
        return loadBrokerCampaignPreview();
    }).catch(function(err) {
        if (typeof showMessage === 'function') showMessage('Erro ao salvar campanha: ' + (err.message || ''), 'error');
    });
}

function saveBrokerCampaignConfigSilent() {
    return adminPostJson('/brokerCampaignConfig', collectBrokerCampaignConfigPayload());
}

function discoverBrokerCampaignWaba() {
    adminPostJson('/brokerCampaignDiscoverWaba', brokerCampaignRequestPayload({})).then(function(data) {
        var wabaEl = document.getElementById('brokerCampaignWabaId');
        if (wabaEl && data && data.wabaId) wabaEl.value = data.wabaId;
        var msg = data && data.wabaId
            ? ('Conta detectada: ' + data.wabaId + '. Templates na Meta: ' + ((data.templates && data.templates.length) || 0) + '.')
            : ('Não detectou WABA. ' + (data && data.templateError ? data.templateError : 'Cole o ID manualmente do WhatsApp Manager.'));
        if (typeof showMessage === 'function') showMessage(msg, data && data.wabaId ? 'success' : 'warning');
        loadBrokerCampaignPreview();
    }).catch(function(err) {
        if (typeof showMessage === 'function') showMessage('Erro ao detectar WABA: ' + (err.message || ''), 'error');
    });
}

function saveBrokerCampaignWaba() {
    var wabaEl = document.getElementById('brokerCampaignWabaId');
    var wabaId = wabaEl ? String(wabaEl.value || '').replace(/\D/g, '') : '';
    if (!wabaId) {
        if (typeof showMessage === 'function') showMessage('Informe o ID da conta WhatsApp (WABA).', 'error');
        return;
    }
    adminPostJson('/brokerCampaignSaveWaba', brokerCampaignRequestPayload({ wabaId: wabaId })).then(function(data) {
        var tplCount = (data && data.templates) ? data.templates.length : 0;
        var msg = 'WABA salvo: ' + wabaId + '.';
        if (data && data.templatesOk) msg += ' Templates aprovados: ' + tplCount + '.';
        if (data && data.campanhaCorretorLanguages && data.campanhaCorretorLanguages.length) {
            msg += ' Idioma campanha_corretor_msg: ' + data.campanhaCorretorLanguages.join(', ') + '.';
        }
        if (data && data.syncHint) msg += ' ' + data.syncHint;
        if (data && data.biaPhoneNumberId) msg += ' Número da Bia: ' + data.biaPhoneNumberId + '.';
        if (data && data.phoneMatch === false) {
            msg += ' Envie uma mensagem para a Bia no WhatsApp e clique Salvar WABA de novo.';
            if (data.phoneLinkWarning) msg += ' ' + data.phoneLinkWarning;
        }
        else if (data && data.error) msg += ' Aviso: ' + data.error;
        var ok = data && data.templatesOk && data.phoneMatch !== false;
        var biaEl = document.getElementById('brokerCampaignBiaPhoneId');
        if (biaEl && data && data.biaPhoneNumberId) {
            biaEl.value = data.biaPhoneNumberId + (data.biaPhoneDisplay ? ' — ' + data.biaPhoneDisplay : '');
        }
        if (typeof showMessage === 'function') showMessage(msg, ok ? 'success' : 'warning');
        loadBrokerCampaignPreview();
    }).catch(function(err) {
        if (typeof showMessage === 'function') showMessage('Erro ao salvar WABA: ' + (err.message || ''), 'error');
    });
}

function sendBrokerCampaignNow() {
    var ready = _brokerCampaignPreview ? (_brokerCampaignPreview.readyToSend || _brokerCampaignPreview.eligible || 0) : 0;
    if (!ready) {
        if (typeof showMessage === 'function') showMessage('Nenhum corretor elegível para disparo.', 'error');
        return;
    }
    if (!confirm('Disparar AGORA para ' + ready + ' corretor(es) ativos com campanha ligada e telefone válido?')) return;
    setBrokerCampaignButtonsBusy(true);
    var waitEl = document.getElementById('brokerCampaignPreviewStats');
    if (waitEl) waitEl.textContent = 'Enviando mensagens... Aguarde até aparecer o resultado.';
    if (typeof showMessage === 'function') showMessage('Enviando campanha agora. Aguarde até 2 minutos...', 'info');
    saveBrokerCampaignConfigSilent().then(function() {
        return adminPostJson('/brokerCampaignSendNow', brokerCampaignRequestPayload({ type: 'manual' }), { timeoutMs: 300000 });
    }).then(function(result) {
        setBrokerCampaignButtonsBusy(false);
        showBrokerCampaignResult(result, false);
        try { sessionStorage.setItem('brokerCampaignPrepared', '1'); } catch (e) {}
    }).catch(function(err) {
        setBrokerCampaignButtonsBusy(false);
        if (typeof showMessage === 'function') showMessage('Erro no disparo: ' + (err.message || ''), 'error');
        loadBrokerCampaignPreview();
    });
}

function sendBrokerCampaignTestSingle() {
    var sel = document.getElementById('brokerCampaignTestSelect');
    var brokerId = sel ? String(sel.value || '').trim() : '';
    if (!brokerId) {
        if (typeof showMessage === 'function') showMessage('Selecione um corretor para teste.', 'error');
        return;
    }
    if (!confirm('Enviar teste agora apenas para o corretor selecionado?')) return;
    setBrokerCampaignButtonsBusy(true);
    saveBrokerCampaignConfigSilent().then(function() {
        return adminPostJson('/brokerCampaignSendNow', brokerCampaignRequestPayload({
            type: 'manual_test_single',
            brokerId: brokerId
        }), { timeoutMs: 300000 });
    }).then(function(result) {
        setBrokerCampaignButtonsBusy(false);
        showBrokerCampaignResult(result, false);
    }).catch(function(err) {
        setBrokerCampaignButtonsBusy(false);
        if (typeof showMessage === 'function') showMessage('Erro no teste: ' + (err.message || ''), 'error');
    });
}

function toggleBrokerCampaignOptOut(brokerId, optOut) {
    var willOptOut = !!optOut;
    var msg = willOptOut
        ? 'Retirar este corretor da campanha semanal de WhatsApp?'
        : 'Reativar este corretor na campanha semanal de WhatsApp?';
    if (!confirm(msg)) return;
    adminPostJson('/brokerCampaignOptOut', {
        brokerId: brokerId,
        optOut: willOptOut
    }).then(function() {
        if (typeof updateBrokerInFirestore === 'function' && typeof brokerId === 'string') {
            updateBrokerInFirestore(brokerId, { whatsappCampaignOptOut: willOptOut }).catch(function(){});
        }
        var found = (typeof findBrokerById === 'function') ? findBrokerById(brokerId) : null;
        if (found) found.whatsappCampaignOptOut = willOptOut;
        if (typeof showMessage === 'function') showMessage('Preferência da campanha atualizada.', 'success');
        loadBrokerCampaignPreview();
        if (typeof loadBrokersData === 'function') loadBrokersData();
    }).catch(function(err) {
        if (typeof showMessage === 'function') showMessage('Erro ao atualizar preferência: ' + (err.message || ''), 'error');
    });
}

// Show add broker modal (apenas superAdmin pode adicionar corretor manualmente)
function showAddBrokerModal() {
    if (typeof isSuperAdmin === 'function' && !isSuperAdmin()) {
        if (typeof showMessage === 'function') showMessage('Apenas o super administrador pode adicionar corretores manualmente. Aprove corretores que já solicitaram cadastro.', 'error');
        return;
    }
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
        email: (formData.get('email') || '').trim().toLowerCase(),
        phone: formData.get('phone') || '',
        creci: formData.get('creci') || '',
        isActive: formData.get('isActive') === 'true'
    };
    
    if (!editingBroker) {
        brokerData.password = formData.get('password');
        brokerData.id = brokers.length + 1;
        brokerData.createdAt = new Date();
        if (typeof addCreatedBy === 'function') addCreatedBy(brokerData);
        if (brokers.find(function(b){ return (b.email || '').toLowerCase() === brokerData.email; })) {
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
        if (brokers.find(function(b){ return (b.email || '').toLowerCase() === brokerData.email && String(b.id) !== String(editingBroker.id); })) {
            alert('Este email já está cadastrado para outro corretor.');
            return;
        }
        Object.assign(editingBroker, brokerData);
        if (typeof addUpdatedBy === 'function') addUpdatedBy(editingBroker);
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
