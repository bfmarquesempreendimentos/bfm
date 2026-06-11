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
    if (!isAdminAuthenticated()) {
        redirectToLogin();
        return;
    }
    var legacyCreds = getAdminApiCredentials();
    if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().onAuthStateChanged(function(user) {
            if (user) return;
            if (legacyCreds.email && legacyCreds.password) return;
            if (localStorage.getItem('adminUser')) {
                redirectToLogin();
            }
        });
    } else if (!legacyCreds.email || !legacyCreds.password) {
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
    applyAdminReservationPermissions();
    setTimeout(function() {
        if (typeof initFcmPush === 'function') initFcmPush('admin');
    }, 2500);
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
        adminFetchJson('/getRepairs').then(function(data) {
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
    if (adminUser.role === 'super') return true;
    const superEmails = (typeof CONFIG !== 'undefined' && CONFIG?.auth?.superAdminEmails) || ['brunoferreiramarques@gmail.com'];
    return superEmails.includes(adminUser.email);
}

function getAdminUserRole() {
    var adminUser = JSON.parse(localStorage.getItem('adminUser') || '{}');
    if (adminUser.role) return adminUser.role;
    if (typeof isSuperAdmin === 'function' && isSuperAdmin()) return 'super';
    return 'comercial';
}

function adminCan(permission) {
    var roles = (typeof CONFIG !== 'undefined' && CONFIG.adminRoles) ? CONFIG.adminRoles : {
        super: ['*'],
        comercial: ['sales', 'leads', 'campaign', 'units', 'brokers', 'repairs_read', 'reservations'],
        posvenda: ['repairs', 'clients', 'leads_read', 'units_read', 'reservations_read'],
        financeiro: ['sales_read', 'repairs_read', 'dashboard', 'reservations_read']
    };
    var role = getAdminUserRole();
    var list = roles[role] || [];
    if (list.indexOf('*') >= 0) return true;
    if (list.indexOf(permission) >= 0) return true;
    if (permission === 'reservations_read' && list.indexOf('reservations') >= 0) return true;
    return false;
}

function applyAdminReservationPermissions() {
    var canWrite = adminCan('reservations');
    var canRead = adminCan('reservations_read') || canWrite;
    var btnNew = document.getElementById('btnNewReservation');
    var btnSync = document.getElementById('btnSyncInventoryReservations');
    var btnPdf = document.querySelector('[onclick="importReservasFromPdf()"]');
    if (btnNew) btnNew.style.display = canWrite ? '' : 'none';
    if (btnSync) btnSync.style.display = canWrite ? '' : 'none';
    if (btnPdf) btnPdf.style.display = canWrite ? '' : 'none';
    var navRes = document.querySelector('[onclick*="showSection(\'reservations\'"]');
    if (navRes && !canRead) navRes.style.display = 'none';
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
        try {
            if (typeof firebase !== 'undefined' && firebase.auth) {
                firebase.auth().signOut().catch(function() {});
            }
        } catch (e) {}
        window.location.href = 'admin-login.html?logout=1&t=' + Date.now();
    }
}

/** Token Firebase do admin (preferido) ou credenciais legadas (transição). */
function getAdminIdToken() {
    return new Promise(function(resolve) {
        try {
            if (typeof firebase === 'undefined' || !firebase.auth) {
                resolve(null);
                return;
            }
            var auth = firebase.auth();
            if (auth.currentUser) {
                auth.currentUser.getIdToken().then(resolve).catch(function() { resolve(null); });
                return;
            }
            var settled = false;
            var unsub = auth.onAuthStateChanged(function(user) {
                if (settled) return;
                settled = true;
                if (typeof unsub === 'function') unsub();
                if (!user) {
                    resolve(null);
                    return;
                }
                user.getIdToken().then(resolve).catch(function() { resolve(null); });
            });
            setTimeout(function() {
                if (settled) return;
                settled = true;
                if (typeof unsub === 'function') unsub();
                resolve(null);
            }, 4000);
        } catch (e) {
            resolve(null);
        }
    });
}

function hasAdminFirebaseAuth() {
    try {
        return !!(typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser);
    } catch (e) {
        return false;
    }
}

function ensureAdminApiReady() {
    if (hasAdminFirebaseAuth()) return true;
    var creds = getAdminApiCredentials();
    return !!(creds.email && creds.password);
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
    if (!ensureAdminApiReady()) {
        showMessage('Faça login novamente no painel para executar a migração.', 'error');
        return;
    }
    if (!confirm('Isso atualiza no Firestore todas as vendas sem saleSlotKey (legado). Continuar?')) return;
    adminPostJson('/adminMigrateLegacySaleSlots', {})
        .then(function(r) {
            var msg = 'Migração concluída: ' + (r.updated || 0) + ' atualizadas, ' + (r.skippedAlreadyHadSlot || 0) + ' já tinham chave.';
            showMessage(msg, 'success');
            return loadSalesData();
        })
        .catch(function(err) {
            showMessage(err.message || 'Erro na migração.', 'error');
        });
}

/** Uma vez após Onda 6: hasheia senhas plaintext dos corretores no Firestore. */
function runMigrateBrokerPasswords() {
    if (!confirm('Converter senhas em texto puro dos corretores para hash seguro? Execute só uma vez após a Onda 6.')) return;
    adminPostJson('/adminMigrateBrokerPasswords', {})
        .then(function(r) {
            var migrated = r.migrated || 0;
            var skipped = r.skipped || 0;
            var total = r.total || 0;
            var msg;
            if (migrated === 0 && skipped === total && total > 0) {
                msg = 'Todas as ' + total + ' senhas já estão protegidas com hash. Nada a migrar.';
            } else {
                msg = 'Senhas: ' + migrated + ' migradas, ' + skipped + ' ignoradas (de ' + total + ' corretores).';
            }
            showMessage(msg, migrated > 0 ? 'success' : 'info');
        })
        .catch(function(err) {
            showMessage(err.message || 'Erro na migração de senhas.', 'error');
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
    var token = await getAdminIdToken();
    var creds = getAdminApiCredentials();
    if (!token && !(creds.email && creds.password)) {
        showMessage('Sessão expirada. Saia e entre novamente no painel administrativo.', 'warning');
        renderSalesTable();
        updateSaleFormModeUi();
        return;
    }
    try {
        var data = await adminPostJson('/adminPropertySalesList', {});
        if (data && Array.isArray(data.sales)) {
            localStorage.setItem('propertySales', JSON.stringify(data.sales));
            if (typeof loadPropertySales === 'function') loadPropertySales();
        }
    } catch (e) {
        console.warn('Erro ao carregar vendas:', e);
        showMessage('Não foi possível carregar vendas. Verifique sua sessão e tente novamente.', 'error');
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
        if (property.id === 1 || property.hideFromSite) return;
        var hasUnits = typeof getPropertyUnitsRaw === 'function' && getPropertyUnitsRaw(property.id);
        if (!hasUnits || !hasUnits.units || !hasUnits.units.length) return;
        const option = document.createElement('option');
        option.value = property.id;
        option.textContent = property.title;
        select.appendChild(option);
    });
    setupSalePropertyUnitPicker();
}

function setupSalePropertyUnitPicker() {
    var select = document.getElementById('saleProperty');
    if (!select || select.getAttribute('data-unit-picker-ready') === '1') {
        if (select) updateSalePropertyUnitField();
        return;
    }
    select.setAttribute('data-unit-picker-ready', '1');
    select.addEventListener('change', updateSalePropertyUnitField);
    updateSalePropertyUnitField();
}

function formatSaleUnitPriceLabel(price) {
    var n = Number(price);
    if (isNaN(n) || n <= 0) return '';
    return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function showSaleUnitInputMode(useSelect) {
    var unitInput = document.getElementById('saleUnitCode');
    var unitSelect = document.getElementById('saleUnitSelect');
    var datalist = document.getElementById('saleUnitCodeList');
    if (unitInput) unitInput.style.display = useSelect ? 'none' : '';
    if (unitSelect) unitSelect.style.display = useSelect ? '' : 'none';
}

function getSaleUnitCodeValue() {
    var unitSelect = document.getElementById('saleUnitSelect');
    var unitInput = document.getElementById('saleUnitCode');
    if (unitSelect && unitSelect.style.display !== 'none') {
        return (unitSelect.value || '').trim();
    }
    return (unitInput && unitInput.value || '').trim();
}

function updateSalePropertyUnitField() {
    var select = document.getElementById('saleProperty');
    var unitInput = document.getElementById('saleUnitCode');
    var unitSelect = document.getElementById('saleUnitSelect');
    var unitLabel = document.getElementById('saleUnitCodeLabel');
    var hintEl = document.getElementById('saleUnitCodeHint');
    if (!select || !unitInput) return;

    var rawValue = select.value || '';
    var propertyId = /^\d+$/.test(rawValue) ? parseInt(rawValue, 10) : rawValue;
    if (!propertyId && propertyId !== 0) {
        unitInput.value = '';
        unitInput.disabled = false;
        unitInput.placeholder = 'Ex: APTO 102, casa 09 (obrigatório se houver várias unidades)';
        if (unitSelect) {
            unitSelect.innerHTML = '<option value="">Selecione a unidade</option>';
            unitSelect.value = '';
        }
        showSaleUnitInputMode(false);
        if (unitLabel) unitLabel.textContent = 'Unidade';
        if (hintEl) hintEl.textContent = 'Empreendimentos com uma única unidade são preenchidos automaticamente.';
        return;
    }

    var raw = typeof getPropertyUnitsRaw === 'function' ? getPropertyUnitsRaw(propertyId) : null;
    var data = typeof getPropertyUnits === 'function' ? getPropertyUnits(propertyId) : raw;
    var datalist = document.getElementById('saleUnitCodeList');
    if (datalist) {
        datalist.innerHTML = '';
    }

    if (!raw || !raw.units || !raw.units.length) {
        unitInput.value = '';
        unitInput.disabled = true;
        unitInput.placeholder = 'Sem unidades cadastradas para este imóvel';
        if (unitSelect) {
            unitSelect.innerHTML = '<option value="">Selecione a unidade</option>';
            unitSelect.value = '';
        }
        showSaleUnitInputMode(false);
        if (unitLabel) unitLabel.textContent = 'Unidade';
        if (hintEl) hintEl.textContent = 'Cadastre as unidades em js/property-units.js ou escolha outro empreendimento.';
        return;
    }

    if (raw.units.length === 1) {
        var single = data && data.units && data.units[0] ? data.units[0] : raw.units[0];
        unitInput.value = single.code;
        unitInput.disabled = true;
        unitInput.placeholder = single.code;
        if (unitSelect) {
            unitSelect.innerHTML = '<option value="">Selecione a unidade</option>';
            unitSelect.value = '';
        }
        showSaleUnitInputMode(false);
        if (unitLabel) unitLabel.textContent = 'Unidade (única)';
        var stTxt = typeof getUnitStatusText === 'function' ? getUnitStatusText(single.status) : '';
        var priceTxt = formatSaleUnitPriceLabel(single.price);
        if (hintEl) {
            hintEl.textContent = 'Preenchida automaticamente: ' + single.code +
                (stTxt ? ' — ' + stTxt : '') +
                (priceTxt ? ' · ' + priceTxt : '') + '.';
        }
        return;
    }

    var units = data && data.units ? data.units : raw.units;
    var prevCode = getSaleUnitCodeValue();
    if (unitSelect) {
        unitSelect.innerHTML = '<option value="">Selecione a unidade</option>';
        var i;
        for (i = 0; i < units.length; i++) {
            var u = units[i];
            var opt = document.createElement('option');
            opt.value = u.code;
            var statusLabel = typeof getUnitStatusText === 'function' ? getUnitStatusText(u.status) : String(u.status || '');
            var priceLabel = formatSaleUnitPriceLabel(u.price);
            opt.textContent = u.code + ' — ' + statusLabel + (priceLabel ? ' · ' + priceLabel : '');
            unitSelect.appendChild(opt);
        }
        if (prevCode) unitSelect.value = prevCode;
    }
    unitInput.value = '';
    unitInput.disabled = false;
    showSaleUnitInputMode(true);
    if (unitLabel) unitLabel.textContent = 'Unidade *';
    unitInput.placeholder = 'Selecione ou digite: ex. APTO 102, casa 07, cs 7';
    var codes = typeof listUnitCodesForProperty === 'function' ? listUnitCodesForProperty(propertyId) : [];
    if (datalist) {
        for (i = 0; i < codes.length; i++) {
            var dlOpt = document.createElement('option');
            dlOpt.value = codes[i];
            datalist.appendChild(dlOpt);
        }
    }
    var disponivel = 0;
    var assinado = 0;
    for (i = 0; i < units.length; i++) {
        var st = String(units[i].status || '').toLowerCase();
        if (st === 'disponivel') disponivel++;
        else if (st === 'assinado') assinado++;
    }
    if (hintEl) {
        hintEl.textContent = 'Obrigatório — ' + units.length + ' unidades (' +
            disponivel + ' disponível, ' + assinado + ' assinado). Status e preço na lista.';
    }
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
    var sus = document.getElementById('saleUnitSelect');
    if (titleEl) titleEl.textContent = editingSaleFirestoreId ? 'Editar venda' : 'Nova venda';
    if (cancelBtn) cancelBtn.style.display = editingSaleFirestoreId ? 'inline-flex' : 'none';
    if (subLbl) subLbl.textContent = editingSaleFirestoreId ? 'Salvar alterações' : 'Registrar venda';
    if (sp) sp.disabled = !!editingSaleFirestoreId;
    if (su) su.disabled = !!editingSaleFirestoreId;
    if (sus) sus.disabled = !!editingSaleFirestoreId;
}

function cancelSaleEdit() {
    editingSaleFirestoreId = null;
    var formEl = document.getElementById('saleForm');
    if (formEl) formEl.reset();
    var fp = document.getElementById('saleContractPhotos');
    if (fp) fp.value = '';
    updateSaleFormModeUi();
    if (typeof updateSalePropertyUnitField === 'function') updateSalePropertyUnitField();
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
    if (typeof updateSalePropertyUnitField === 'function') updateSalePropertyUnitField();
    var sus = document.getElementById('saleUnitSelect');
    if (sus && sus.style.display !== 'none' && sale.unitCode) sus.value = sale.unitCode;
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

    if (!ensureAdminApiReady()) {
        showMessage('Sessão expirada. Saia e entre novamente no painel.', 'error');
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
    
    var unitRaw = typeof getSaleUnitCodeValue === 'function'
        ? getSaleUnitCodeValue()
        : ((document.getElementById('saleUnitCode') && document.getElementById('saleUnitCode').value) || '').trim();
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

    if (r.created) {
        await sendClientCredentialsEmail(clientName, email, generatedPassword, true);
        showMessage('Credenciais enviadas por email ao cliente. Ele precisará alterar a senha no primeiro acesso.', 'success');
    } else if (r.error && String(r.error).indexOf('email-already-in-use') >= 0) {
        try {
            await adminPostJson('/adminMergeClientProperty', {
                clientEmail: email,
                propertyFromSale: propertyFromSale,
            });
        } catch (mergeErr) {
            console.warn('merge cliente:', mergeErr);
        }
        await sendClientCredentialsEmail(clientName, email, null, false);
        showMessage('Cliente já cadastrado. Imóvel vinculado ao perfil (quando possível). Email enviado.', 'success');
    }
}

async function deleteSale(saleId) {
    if (!confirm('Deseja remover esta venda? O vínculo do imóvel será removido do perfil do cliente no servidor, quando existir.')) return;

    if (!ensureAdminApiReady()) {
        showMessage('Sessão expirada. Saia e entre novamente no painel.', 'error');
        return;
    }
    try {
        await adminPostJson('/adminPropertySaleMutate', {
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
        case 'boletos':
            if (typeof loadAdminBoletos === 'function') loadAdminBoletos();
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
        case 'bia-learning':
            if (typeof loadBiaLearning === 'function') loadBiaLearning();
            break;
    }
}

function biaEscapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function biaFormatDate(iso) {
    if (!iso) return '';
    try {
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
}

function biaCallApi(action, extra) {
    if (!ensureAdminApiReady()) {
        return Promise.reject(new Error('Sessão expirada. Entre novamente no painel.'));
    }
    var payload = { action: action };
    if (extra) {
        var k;
        for (k in extra) { if (extra.hasOwnProperty(k)) payload[k] = extra[k]; }
    }
    return adminPostJson('/biaLearning', payload);
}

function loadBiaLearning() {
    var manualEl = document.getElementById('biaManualList');
    var lessonsEl = document.getElementById('biaLessonsList');
    var snippetsEl = document.getElementById('biaSnippetsList');
    if (manualEl) manualEl.innerHTML = '<p class="text-muted">Carregando...</p>';
    if (lessonsEl) lessonsEl.innerHTML = '';
    if (snippetsEl) snippetsEl.innerHTML = '';

    biaCallApi('list').then(function(data) {
        data = data || {};
        renderBiaManual(data.manual || []);
        renderBiaLessons(data.lessons || []);
        renderBiaSnippets(data.snippets || []);
    }).catch(function(err) {
        if (manualEl) manualEl.innerHTML = '<p class="text-muted">' + biaEscapeHtml(err.message || 'Erro ao carregar.') + '</p>';
    });
}

function renderBiaManual(manual) {
    var el = document.getElementById('biaManualList');
    var countEl = document.getElementById('biaManualCount');
    if (countEl) countEl.textContent = manual.length;
    if (!el) return;
    if (!manual.length) {
        el.innerHTML = '<p class="text-muted">Nenhuma regra definida ainda.</p>';
        return;
    }
    var html = '<ul class="bia-list">';
    var i;
    for (i = 0; i < manual.length; i++) {
        var m = manual[i] || {};
        var text = typeof m === 'string' ? m : (m.text || '');
        var at = typeof m === 'string' ? '' : (m.at || '');
        html += '<li class="bia-list-item">'
            + '<div class="bia-list-text">' + biaEscapeHtml(text) + '</div>'
            + '<div class="bia-list-meta">' + biaEscapeHtml(biaFormatDate(at)) + '</div>'
            + '<button type="button" class="btn btn-sm btn-danger" onclick="deleteBiaGuideline(\'' + biaEscapeHtml(at) + '\')">Remover</button>'
            + '</li>';
    }
    html += '</ul>';
    el.innerHTML = html;
}

function renderBiaLessons(lessons) {
    var el = document.getElementById('biaLessonsList');
    var countEl = document.getElementById('biaLessonsCount');
    if (countEl) countEl.textContent = lessons.length;
    if (!el) return;
    if (!lessons.length) {
        el.innerHTML = '<p class="text-muted">A Bia ainda não registrou erros. Ótimo sinal!</p>';
        return;
    }
    var html = '<ul class="bia-list">';
    var i;
    for (i = 0; i < lessons.length; i++) {
        var l = lessons[i] || {};
        html += '<li class="bia-list-item">'
            + '<div class="bia-list-text">' + biaEscapeHtml(l.text || '') + '</div>'
            + '<div class="bia-list-meta">Ocorrências: ' + (l.count || 1) + ' &middot; última: ' + biaEscapeHtml(biaFormatDate(l.lastAt)) + '</div>'
            + '<button type="button" class="btn btn-sm btn-danger" onclick="deleteBiaLesson(\'' + biaEscapeHtml(l.key || '') + '\')">Remover</button>'
            + '</li>';
    }
    html += '</ul>';
    el.innerHTML = html;
}

function renderBiaSnippets(snippets) {
    var el = document.getElementById('biaSnippetsList');
    var countEl = document.getElementById('biaSnippetsCount');
    if (countEl) countEl.textContent = snippets.length;
    if (!el) return;
    if (!snippets.length) {
        el.innerHTML = '<p class="text-muted">Nenhuma orientação registrada ainda.</p>';
        return;
    }
    var html = '<ul class="bia-list">';
    var i;
    for (i = 0; i < snippets.length; i++) {
        var s = snippets[i] || {};
        var who = s.admin ? (' &middot; por ' + biaEscapeHtml(s.admin)) : '';
        var ph = s.phone ? (' &middot; tel ' + biaEscapeHtml(s.phone)) : '';
        html += '<li class="bia-list-item">'
            + '<div class="bia-list-text">' + biaEscapeHtml(s.text || '') + '</div>'
            + '<div class="bia-list-meta">' + biaEscapeHtml(biaFormatDate(s.at)) + who + ph + '</div>'
            + '<button type="button" class="btn btn-sm btn-danger" onclick="deleteBiaSnippet(\'' + biaEscapeHtml(s.at || '') + '\')">Remover</button>'
            + '</li>';
    }
    html += '</ul>';
    el.innerHTML = html;
}

function addBiaGuideline() {
    var input = document.getElementById('biaGuidelineInput');
    if (!input) return;
    var text = (input.value || '').trim();
    if (text.length < 3) {
        alert('Escreva uma regra um pouco mais detalhada.');
        return;
    }
    biaCallApi('addGuideline', { text: text }).then(function(data) {
        input.value = '';
        renderBiaManual((data && data.manual) || []);
    }).catch(function(err) {
        alert(err.message || 'Erro ao adicionar regra.');
    });
}

function deleteBiaGuideline(at) {
    if (!confirm('Remover esta regra?')) return;
    biaCallApi('deleteGuideline', { at: at }).then(function(data) {
        renderBiaManual((data && data.manual) || []);
    }).catch(function(err) { alert(err.message || 'Erro.'); });
}

function deleteBiaLesson(key) {
    if (!confirm('Remover esta lição?')) return;
    biaCallApi('deleteLesson', { key: key }).then(function(data) {
        renderBiaLessons((data && data.lessons) || []);
    }).catch(function(err) { alert(err.message || 'Erro.'); });
}

function deleteBiaSnippet(at) {
    if (!confirm('Remover esta orientação?')) return;
    biaCallApi('deleteSnippet', { at: at }).then(function() {
        loadBiaLearning();
    }).catch(function(err) { alert(err.message || 'Erro.'); });
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

function adminAppendCreds(path) {
    var creds = getAdminApiCredentials();
    if (!creds.email || !creds.password) return path;
    var sep = path.indexOf('?') >= 0 ? '&' : '?';
    return path + sep + 'adminEmail=' + encodeURIComponent(creds.email) +
        '&adminPassword=' + encodeURIComponent(creds.password);
}

function adminFetchJson(path) {
    return getAdminIdToken().then(function(token) {
        var headers = { 'Content-Type': 'application/json' };
        var urlPath = path;
        if (token) {
            headers.Authorization = 'Bearer ' + token;
        } else {
            urlPath = adminAppendCreds(path);
        }
        if (typeof ApiClient !== 'undefined' && ApiClient.request) {
            return ApiClient.request(urlPath, { method: 'GET', headers: headers }).catch(function() { return null; });
        }
        var sep = urlPath.indexOf('?') >= 0 ? '&' : '?';
        return fetch(ADMIN_FUNCTIONS_BASE + urlPath + sep + '_=' + Date.now(), {
            cache: 'no-store',
            credentials: 'omit',
            headers: headers
        }).then(function(res) {
            if (!res.ok) return null;
            return res.text().then(function(txt) {
                if (!txt || !String(txt).trim()) return null;
                try { return JSON.parse(txt); } catch (e) { return null; }
            });
        }).catch(function() { return null; });
    });
}

function adminPostJson(path, payload, extra) {
    payload = payload || {};
    return getAdminIdToken().then(function(token) {
        var headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers.Authorization = 'Bearer ' + token;
            if (payload.idToken) delete payload.idToken;
        } else if (!payload.adminEmail || !payload.adminPassword) {
            var creds = getAdminApiCredentials();
            if (creds.email && creds.password) {
                if (!payload.adminEmail) payload.adminEmail = creds.email;
                if (!payload.adminPassword) payload.adminPassword = creds.password;
            }
        }
        if (typeof ApiClient !== 'undefined' && ApiClient.request) {
            return ApiClient.request(path, {
                method: 'POST',
                body: payload,
                headers: headers,
                timeoutMs: (extra && extra.timeoutMs) || 180000
            });
        }
        return fetch(ADMIN_FUNCTIONS_BASE + path, {
            method: 'POST',
            headers: headers,
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

function buildMergedDashboardActivity(repairsList, salesList, recentReservationsFromBundle) {
    var items = [];
    var i;
    if (Array.isArray(recentReservationsFromBundle) && recentReservationsFromBundle.length) {
        for (i = 0; i < recentReservationsFromBundle.length; i++) {
            var rv = recentReservationsFromBundle[i];
            items.push({
                t: new Date(rv.requestedAt || 0).getTime(),
                type: 'reservation',
                icon: 'fas fa-calendar-check',
                text: 'Reserva: ' + (rv.propertyTitle || 'Imóvel') + (rv.unitCode ? ' · ' + rv.unitCode : '') +
                    (rv.clientName ? ' · ' + rv.clientName : '') + ' (' + (rv.status || '') + ')',
                time: formatDashboardRelativeTime(rv.requestedAt)
            });
        }
    } else if (typeof reservations !== 'undefined' && reservations.length) {
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
        if (bundleExtras && bundleExtras.reservationsPending > 0) bits.push(bundleExtras.reservationsPending + ' reservas pendentes');
        if (bundleExtras && bundleExtras.reservationsActive > 0) bits.push(bundleExtras.reservationsActive + ' reservas ativas');
        if (bundleExtras && bundleExtras.funnelReservas > 0) bits.push(bundleExtras.funnelReservas + ' reservas (vendas)');
        waSub.textContent = bits.join(' · ');
    }
    if (repEl) repEl.textContent = repairsOpen != null ? String(repairsOpen) : '0';
    if (salEl) salEl.textContent = salesCount != null ? String(salesCount) : '0';
    if (elBrok && brokersActive != null) elBrok.textContent = String(brokersActive);
    else if (elBrok) elBrok.textContent = String(localBrokersFallback);
}

function fetchDashboardSalesListForActivity() {
    if (!ensureAdminApiReady()) return Promise.resolve(null);
    return adminPostJson('/adminPropertySalesList', {}).then(function(d) {
        return d && d.sales ? d.sales : null;
    }).catch(function() { return null; });
}

function fetchDashboardRemoteThenActivity(localBrokers) {
    adminFetchJson('/adminDashboardBundle').then(function(bundle) {
        var repairsList = null;
        var salesList = null;
        if (bundle && !bundle.error && bundle.wa) {
            applyRemoteDashboardWidgets(bundle.wa, bundle.repairsOpen, bundle.salesCount, bundle.brokersActive, localBrokers, bundle);
            if (typeof renderDashboardCharts === 'function') renderDashboardCharts(bundle);
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
            var recentRes = (bundle && bundle.recentReservations) ? bundle.recentReservations : null;
            renderDashboardActivityList(buildMergedDashboardActivity(rs[0], rs[1], recentRes));
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

// Load expiring reservations (dashboard — Firestore)
function loadExpiringReservations() {
    var container = document.getElementById('expiringReservations');
    if (!container) return;
    if (!ensureAdminApiReady()) {
        container.innerHTML = '<p class="empty-message">Faça login para ver reservas.</p>';
        return;
    }
    adminPostJson('/adminReservationsMutate', { action: 'list', needsDecision: true }).then(function(data) {
        var rows = (data && data.reservations) ? data.reservations : [];
        if (!rows.length) {
            container.innerHTML = '<p class="empty-message">Nenhuma reserva aguardando decisão ou vencendo em breve.</p>';
            return;
        }
        container.innerHTML = rows.map(function(reservation) {
            var title = reservation.propertyTitle || (getPropertyById(reservation.propertyId) || {}).title || 'Imóvel';
            var unit = reservation.unitCode ? ' — ' + reservation.unitCode : '';
            var rid = String(reservation.id).replace(/'/g, "\\'");
            var hint = reservation.renewalDue
                ? 'Prazo venceu — prorrogar ou liberar'
                : (typeof formatTimeRemaining === 'function' ? formatTimeRemaining(reservation.expiresAt) : '');
            return '<div class="activity-item">' +
                '<div class="activity-icon reservation"><i class="fas fa-' + (reservation.renewalDue ? 'exclamation-triangle' : 'clock') + '"></i></div>' +
                '<div class="activity-text"><p>' + title + unit + '</p><small>' + hint + '</small>' +
                '<div class="activity-actions" style="margin-top:6px;">' +
                '<button type="button" class="btn btn-sm btn-primary" onclick="extendReservationAdmin(\'' + rid + '\')">Prorrogar</button> ' +
                '<button type="button" class="btn btn-sm btn-secondary" onclick="releaseReservationAdmin(\'' + rid + '\')">Liberar</button>' +
                '</div></div></div>';
        }).join('');
    }).catch(function() {
        container.innerHTML = '<p class="empty-message">Nenhuma reserva aguardando decisão.</p>';
    });
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
        'pending': 'Pendente',
        'rejected': 'Rejeitada',
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

// Load reservations data (Firestore)
function populateReservationPropertyFilter() {
    var sel = document.getElementById('resFilterProperty');
    if (!sel || sel.dataset.populated === '1') return;
    var opts = ['<option value="">Todos empreendimentos</option>'];
    if (typeof properties !== 'undefined' && properties.length) {
        properties.forEach(function(p) {
            opts.push('<option value="' + p.id + '">' + (p.title || ('Empreendimento ' + p.id)) + '</option>');
        });
    }
    sel.innerHTML = opts.join('');
    sel.dataset.populated = '1';
}

function adminReservationActor() {
    if (typeof getCurrentActor === 'function') {
        var actor = getCurrentActor();
        if (actor) return { type: actor.type, email: actor.email, name: actor.name, at: new Date().toISOString() };
    }
    return 'admin';
}

function adminReservationMutate(payload) {
    if (!ensureAdminApiReady()) return Promise.reject(new Error('Faça login no painel.'));
    return adminPostJson('/adminReservationsMutate', payload);
}

function loadReservationsData() {
    var tbody = document.getElementById('reservationsTableBody');
    if (!tbody) return;
    applyAdminReservationPermissions();
    if (!adminCan('reservations_read') && !adminCan('reservations')) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;">Sem permissão para ver reservas.</td></tr>';
        return;
    }
    populateReservationPropertyFilter();
    if (!ensureAdminApiReady()) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;">Faça login para ver reservas.</td></tr>';
        return;
    }
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;">Carregando reservas...</td></tr>';
    var statusEl = document.getElementById('resFilterStatus');
    var propEl = document.getElementById('resFilterProperty');
    var expEl = document.getElementById('resFilterExpiring');
    var renewalEl = document.getElementById('resFilterRenewalDue');
    var payload = {
        action: 'list',
        status: statusEl ? statusEl.value : '',
        propertyId: propEl ? propEl.value : '',
        expiringSoon: expEl ? !!expEl.checked : false,
        renewalDue: renewalEl ? !!renewalEl.checked : false
    };
    adminReservationMutate(payload).then(function(data) {
        var rows = (data && data.reservations) ? data.reservations : [];
        if (typeof window !== 'undefined') {
            window._adminReservationsCache = rows.map(function(r) {
                return typeof normalizeReservationRow === 'function' ? normalizeReservationRow(r) : r;
            });
        }
        var stats = data && data.stats ? data.stats : {};
        var elP = document.getElementById('resKpiPending');
        var elA = document.getElementById('resKpiActive');
        var elE = document.getElementById('resKpiExpiring');
        var elR = document.getElementById('resKpiRenewal');
        if (elP) elP.textContent = stats.pending != null ? stats.pending : '0';
        if (elA) elA.textContent = stats.active != null ? stats.active : '0';
        if (elE) elE.textContent = stats.expiringToday != null ? stats.expiringToday : '0';
        if (elR) elR.textContent = stats.renewalDue != null ? stats.renewalDue : '0';
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;">Nenhuma reserva encontrada.</td></tr>';
            if (adminCan('reservations') && !sessionStorage.getItem('inventoryResSyncDone')) {
                sessionStorage.setItem('inventoryResSyncDone', '1');
                adminReservationMutate({ action: 'sync_from_inventory' }).then(function(syncData) {
                    if (syncData && syncData.imported > 0) {
                        showMessage('Importadas ' + syncData.imported + ' reservas do inventário (amarelo).', 'success');
                        loadReservationsData();
                    }
                }).catch(function() {});
            }
            return;
        }
        tbody.innerHTML = rows.map(function(reservation) {
            var rid = String(reservation.id).replace(/'/g, "\\'");
            var title = reservation.propertyTitle || (getPropertyById(reservation.propertyId) || {}).title || 'N/A';
            var brokerName = reservation.brokerName || 'N/A';
            var clientName = (reservation.client && reservation.client.name) || (reservation.clientInfo && reservation.clientInfo.name) || 'N/A';
            var requested = reservation.requestedAt ? formatDate(reservation.requestedAt) : '—';
            var expires = reservation.expiresAt ? formatDate(reservation.expiresAt) : (reservation.status === 'pending' ? 'Após aprovação' : '—');
            if (reservation.renewalDue) expires += ' (vencido — decidir)';
            var statusLabel = typeof reservationDisplayStatus === 'function'
                ? reservationDisplayStatus(reservation)
                : (typeof reservationStatusLabel === 'function' ? reservationStatusLabel(reservation.status) : getStatusText(reservation.status));
            var statusClass = reservation.renewalDue ? 'renewal-due' : reservation.status;
            var rowClass = reservation.renewalDue ? ' class="row-renewal-due"' : '';
            var actions = '<button class="btn-action btn-view" onclick="viewReservation(\'' + rid + '\')" title="Detalhes"><i class="fas fa-eye"></i></button>';
            if (adminCan('reservations')) {
                if (!reservation.brokerEmail || reservation.brokerName === 'A definir') {
                    actions += '<button class="btn-action btn-edit" onclick="assignBrokerToReservation(\'' + rid + '\')" title="Definir corretor"><i class="fas fa-user-tag"></i></button>';
                }
            }
            if (adminCan('reservations')) {
            if (reservation.status === 'pending') {
                actions += '<button class="btn-action btn-approve" onclick="approveReservationAdmin(\'' + rid + '\')" title="Aprovar"><i class="fas fa-check"></i></button>';
                actions += '<button class="btn-action btn-delete" onclick="rejectReservationAdmin(\'' + rid + '\')" title="Rejeitar"><i class="fas fa-times"></i></button>';
            }
            if (reservation.status === 'active') {
                actions += '<button class="btn-action btn-approve" onclick="extendReservationAdmin(\'' + rid + '\')" title="Prorrogar 3 dias úteis"><i class="fas fa-clock"></i></button>';
                actions += '<button class="btn-action btn-edit" onclick="markReservationSignedAdmin(\'' + rid + '\')" title="Marcar como assinado"><i class="fas fa-file-signature"></i></button>';
                actions += '<button class="btn-action btn-delete" onclick="releaseReservationAdmin(\'' + rid + '\')" title="Liberar unidade"><i class="fas fa-unlock"></i></button>';
            }
            if (reservation.status === 'signed') {
                actions += '<button class="btn-action btn-approve" onclick="openSaleFromReservation(\'' + rid + '\')" title="Cadastrar em Vendas"><i class="fas fa-shopping-cart"></i></button>';
            }
            }
            return '<tr' + rowClass + '>' +
                '<td>' + title + '</td>' +
                '<td>' + (reservation.unitCode || '—') + '</td>' +
                '<td>' + brokerName + '</td>' +
                '<td>' + clientName + '</td>' +
                '<td>' + requested + '</td>' +
                '<td>' + expires + '</td>' +
                '<td><span class="status-badge status-' + statusClass + '">' + statusLabel + '</span></td>' +
                '<td><div class="action-buttons">' + actions + '</div></td>' +
                '</tr>';
        }).join('');
    }).catch(function(err) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:#b91c1c;">' + (err.message || 'Erro ao carregar reservas.') + '</td></tr>';
    });
}

function viewReservation(reservationId) {
    var list = (typeof window !== 'undefined' && window._adminReservationsCache) ? window._adminReservationsCache : getAllReservations();
    var reservation = list.filter(function(r) { return String(r.id) === String(reservationId); })[0];
    if (!reservation) return;
    var client = reservation.clientInfo || reservation.client || {};
    var details = [
        'Empreendimento: ' + (reservation.propertyTitle || '—'),
        'Unidade: ' + (reservation.unitCode || '—'),
        'Corretor: ' + (reservation.brokerName || '—') + ' (' + (reservation.brokerEmail || '') + ')',
        'Cliente: ' + (client.name || '—'),
        'CPF: ' + (client.cpf || '—'),
        'Telefone: ' + (client.phone || '—'),
        'Email: ' + (client.email || '—'),
        'Status: ' + (typeof reservationStatusLabel === 'function' ? reservationStatusLabel(reservation.status) : reservation.status),
        'Solicitada em: ' + (reservation.requestedAt ? formatDate(reservation.requestedAt) : '—'),
        'Expira em: ' + (reservation.expiresAt ? formatDate(reservation.expiresAt) : '—'),
        client.notes ? ('Observações: ' + client.notes) : ''
    ].filter(Boolean).join('\n');
    alert(details);
}

function approveReservationAdmin(reservationId) {
    if (!confirm('Aprovar esta reserva? A unidade ficará reservada por 3 dias úteis.')) return;
    adminReservationMutate({ action: 'approve', reservationId: reservationId, approvedBy: adminReservationActor() })
        .then(function() {
            showMessage('Reserva aprovada com sucesso!', 'success');
            loadReservationsData();
            loadExpiringReservations();
        })
        .catch(function(err) { showMessage(err.message || 'Erro ao aprovar.', 'error'); });
}

function rejectReservationAdmin(reservationId) {
    var reason = prompt('Motivo da rejeição (opcional):') || '';
    adminReservationMutate({ action: 'reject', reservationId: reservationId, reason: reason, rejectedBy: adminReservationActor() })
        .then(function() {
            showMessage('Reserva rejeitada.', 'success');
            loadReservationsData();
        })
        .catch(function(err) { showMessage(err.message || 'Erro ao rejeitar.', 'error'); });
}

function extendReservationAdmin(reservationId) {
    if (!confirm('Prorrogar esta reserva por mais 3 dias úteis? A unidade continua reservada.')) return;
    adminReservationMutate({ action: 'extend', reservationId: reservationId })
        .then(function() {
            showMessage('Reserva prorrogada por 3 dias úteis.', 'success');
            loadReservationsData();
            loadExpiringReservations();
        })
        .catch(function(err) { showMessage(err.message || 'Erro ao prorrogar.', 'error'); });
}

function releaseReservationAdmin(reservationId) {
    if (!confirm('Liberar esta unidade? Ela voltará a ficar disponível (verde) no site.')) return;
    adminReservationMutate({ action: 'release', reservationId: reservationId, cancelledBy: adminReservationActor() })
        .then(function() {
            showMessage('Unidade liberada.', 'success');
            loadReservationsData();
            loadExpiringReservations();
        })
        .catch(function(err) { showMessage(err.message || 'Erro ao liberar.', 'error'); });
}

function cancelReservationAdmin(reservationId) {
    releaseReservationAdmin(reservationId);
}

function syncReservationsFromInventory() {
    if (!adminCan('reservations')) {
        showMessage('Sem permissão para importar reservas.', 'error');
        return;
    }
    if (!confirm('Importar todas as unidades marcadas como reservadas (amarelo) no inventário para o módulo de Reservas? Corretor ficará "A definir".')) return;
    adminReservationMutate({ action: 'sync_from_inventory' }).then(function(data) {
        var msg = 'Importadas: ' + (data.imported || 0);
        if (data.already) msg += ' · Já existiam: ' + data.already;
        if (data.skipped) msg += ' · Ignoradas: ' + data.skipped;
        showMessage(msg, 'success');
        loadReservationsData();
        loadExpiringReservations();
    }).catch(function(err) {
        showMessage(err.message || 'Erro ao importar.', 'error');
    });
}

function openAdminCreateReservationModal() {
    if (!adminCan('reservations')) {
        showMessage('Sem permissão para criar reservas.', 'error');
        return;
    }
    var modal = document.getElementById('adminReservationModal');
    var propSel = document.getElementById('adminResProperty');
    var brokerSel = document.getElementById('adminResBroker');
    if (!modal || !propSel) return;
    var propOpts = ['<option value="">Selecione...</option>'];
    if (typeof properties !== 'undefined' && properties.length) {
        properties.forEach(function(p) {
            if (p.hideFromSite && typeof getPropertyUnitsRaw === 'function' && !getPropertyUnitsRaw(p.id)) return;
            propOpts.push('<option value="' + p.id + '">' + (p.title || ('Empreendimento ' + p.id)) + '</option>');
        });
    }
    propSel.innerHTML = propOpts.join('');
    if (brokerSel) {
        brokerSel.innerHTML = '<option value="">Carregando corretores...</option>';
        populateAdminReservationBrokers(brokerSel);
    }
    populateAdminReservationUnits();
    modal.style.display = 'block';
}

function populateAdminReservationBrokers(selectEl) {
    if (!selectEl) return;
    function renderBrokers(list) {
        var brokerOpts = ['<option value="">A definir depois</option>'];
        var sorted = (list || []).slice().sort(function(a, b) {
            return String(a.name || a.email || '').localeCompare(String(b.name || b.email || ''));
        });
        for (var i = 0; i < sorted.length; i++) {
            if (sorted[i].isActive === false) continue;
            brokerOpts.push('<option value="' + sorted[i].id + '">' + (sorted[i].name || sorted[i].email) + '</option>');
        }
        selectEl.innerHTML = brokerOpts.join('');
    }
    if (typeof loadBrokersFromFirestore === 'function') {
        loadBrokersFromFirestore().then(function() {
            renderBrokers(typeof getAllBrokers === 'function' ? getAllBrokers() : []);
        }).catch(function() {
            renderBrokers(typeof getAllBrokers === 'function' ? getAllBrokers() : []);
        });
        return;
    }
    renderBrokers(typeof getAllBrokers === 'function' ? getAllBrokers() : []);
}

function closeAdminCreateReservationModal() {
    var modal = document.getElementById('adminReservationModal');
    if (modal) modal.style.display = 'none';
}

function populateAdminReservationUnits() {
    var propSel = document.getElementById('adminResProperty');
    var unitSel = document.getElementById('adminResUnit');
    if (!propSel || !unitSel) return;
    var pid = propSel.value;
    if (!pid || typeof getPropertyUnitsRaw !== 'function') {
        unitSel.innerHTML = '<option value="">Selecione o empreendimento</option>';
        return;
    }
    var raw = getPropertyUnitsRaw(Number(pid) || pid);
    if (!raw || !raw.units || !raw.units.length) {
        unitSel.innerHTML = '<option value="">Sem unidades cadastradas</option>';
        return;
    }
    var opts = [];
    for (var i = 0; i < raw.units.length; i++) {
        var u = raw.units[i];
        var label = u.code + ' — ' + (typeof getUnitStatusText === 'function' ? getUnitStatusText(u.status) : u.status);
        opts.push('<option value="' + u.code.replace(/"/g, '&quot;') + '">' + label + '</option>');
    }
    unitSel.innerHTML = opts.join('');
}

function submitAdminCreateReservation(e) {
    e.preventDefault();
    if (!adminCan('reservations')) {
        showMessage('Sem permissão.', 'error');
        return;
    }
    var propSel = document.getElementById('adminResProperty');
    var unitSel = document.getElementById('adminResUnit');
    var statusSel = document.getElementById('adminResStatus');
    var brokerSel = document.getElementById('adminResBroker');
    var clientName = document.getElementById('adminResClientName');
    var notes = document.getElementById('adminResNotes');
    var property = typeof getPropertyById === 'function' ? getPropertyById(Number(propSel.value)) : null;
    var payload = {
        action: 'admin_create',
        propertyId: Number(propSel.value),
        propertyTitle: property ? property.title : '',
        unitCode: unitSel.value,
        status: statusSel ? statusSel.value : 'active',
        client: { name: (clientName && clientName.value) ? clientName.value.trim() : 'Reserva administrativa' },
        notes: notes ? notes.value.trim() : ''
    };
    if (brokerSel && brokerSel.value) payload.brokerId = brokerSel.value;
    adminReservationMutate(payload).then(function() {
        showMessage('Reserva criada com sucesso!', 'success');
        closeAdminCreateReservationModal();
        loadReservationsData();
        loadExpiringReservations();
    }).catch(function(err) {
        showMessage(err.message || 'Erro ao criar reserva.', 'error');
    });
}

function assignBrokerToReservation(reservationId) {
    if (!adminCan('reservations')) {
        showMessage('Sem permissão.', 'error');
        return;
    }
    _assignBrokerReservationId = reservationId;
    _assignBrokerList = [];
    var modal = document.getElementById('assignBrokerModal');
    var sel = document.getElementById('assignBrokerSelect');
    var search = document.getElementById('assignBrokerSearch');
    if (!modal || !sel) return;
    if (search) search.value = '';
    sel.innerHTML = '<option value="">Carregando corretores...</option>';
    modal.style.display = 'block';

    function finish(list) {
        _assignBrokerList = (list || []).filter(function(b) { return b.isActive !== false; });
        _assignBrokerList.sort(function(a, b) {
            return String(a.name || a.email || '').localeCompare(String(b.name || b.email || ''));
        });
        renderAssignBrokerOptions(_assignBrokerList);
    }

    if (typeof loadBrokersFromFirestore === 'function') {
        loadBrokersFromFirestore().then(function() {
            finish(typeof getAllBrokers === 'function' ? getAllBrokers() : []);
        }).catch(function() {
            finish(typeof getAllBrokers === 'function' ? getAllBrokers() : []);
        });
        return;
    }
    finish(typeof getAllBrokers === 'function' ? getAllBrokers() : (typeof brokers !== 'undefined' ? brokers : []));
}

var _assignBrokerReservationId = null;
var _assignBrokerList = [];

function renderAssignBrokerOptions(list) {
    var sel = document.getElementById('assignBrokerSelect');
    if (!sel) return;
    if (!list || !list.length) {
        sel.innerHTML = '<option value="">Nenhum corretor ativo encontrado</option>';
        return;
    }
    var html = [];
    for (var i = 0; i < list.length; i++) {
        var b = list[i];
        var label = (b.name || b.email || 'Corretor') + (b.email ? ' — ' + b.email : '');
        html.push('<option value="' + String(b.id).replace(/"/g, '&quot;') + '">' + label + '</option>');
    }
    sel.innerHTML = html.join('');
}

function filterAssignBrokerOptions() {
    var search = document.getElementById('assignBrokerSearch');
    var q = search ? String(search.value || '').toLowerCase().trim() : '';
    if (!q) {
        renderAssignBrokerOptions(_assignBrokerList);
        return;
    }
    var filtered = _assignBrokerList.filter(function(b) {
        var text = ((b.name || '') + ' ' + (b.email || '') + ' ' + (b.creci || '')).toLowerCase();
        return text.indexOf(q) >= 0;
    });
    renderAssignBrokerOptions(filtered);
}

function closeAssignBrokerModal() {
    var modal = document.getElementById('assignBrokerModal');
    if (modal) modal.style.display = 'none';
    _assignBrokerReservationId = null;
}

function confirmAssignBroker() {
    var sel = document.getElementById('assignBrokerSelect');
    if (!sel || !sel.value || !_assignBrokerReservationId) {
        showMessage('Selecione um corretor.', 'warning');
        return;
    }
    adminReservationMutate({
        action: 'assign_broker',
        reservationId: _assignBrokerReservationId,
        brokerId: sel.value
    }).then(function() {
        showMessage('Corretor atribuído.', 'success');
        closeAssignBrokerModal();
        loadReservationsData();
    }).catch(function(err) {
        showMessage(err.message || 'Erro ao atribuir corretor.', 'error');
    });
}

function markReservationSignedAdmin(reservationId) {
    if (!adminCan('reservations')) {
        showMessage('Sem permissão.', 'error');
        return;
    }
    if (!confirm('Marcar esta reserva como assinada?\n\nA unidade ficará como "Assinado" no inventário e poderá ser cadastrada em Vendas.')) return;
    adminReservationMutate({
        action: 'mark_signed',
        reservationId: reservationId,
        signedBy: adminReservationActor()
    }).then(function(data) {
        showMessage('Reserva marcada como assinada.', 'success');
        loadReservationsData();
        loadExpiringReservations();
        if (confirm('Abrir o formulário de Vendas com os dados desta reserva?')) {
            var row = data && data.reservation ? data.reservation : null;
            openSaleFromReservation(reservationId, row);
        }
    }).catch(function(err) {
        showMessage(err.message || 'Erro ao marcar como assinado.', 'error');
    });
}

function openSaleFromReservation(reservationId, reservationRow) {
    var reservation = reservationRow;
    if (!reservation) {
        var list = (typeof window !== 'undefined' && window._adminReservationsCache) ? window._adminReservationsCache : [];
        reservation = list.filter(function(r) { return String(r.id) === String(reservationId); })[0];
    }
    if (!reservation) {
        showMessage('Reserva não encontrada.', 'error');
        return;
    }
    if (typeof loadSalesPropertyOptions === 'function') loadSalesPropertyOptions();
    showSection('sales');
    var propEl = document.getElementById('saleProperty');
    if (propEl) {
        propEl.value = String(reservation.propertyId);
        if (typeof updateSalePropertyUnitField === 'function') updateSalePropertyUnitField();
    }
    var unitCode = reservation.unitCode || '';
    var unitSelect = document.getElementById('saleUnitSelect');
    var unitInput = document.getElementById('saleUnitCode');
    if (unitSelect && unitSelect.style.display !== 'none') {
        unitSelect.value = unitCode;
    } else if (unitInput) {
        unitInput.value = unitCode;
    }
    var client = reservation.client || reservation.clientInfo || {};
    var nameEl = document.getElementById('saleClientName');
    var cpfEl = document.getElementById('saleClientCPF');
    var emailEl = document.getElementById('saleClientEmail');
    var phoneEl = document.getElementById('saleClientPhone');
    var priceEl = document.getElementById('salePrice');
    var notesEl = document.getElementById('saleNotes');
    if (nameEl) nameEl.value = client.name && client.name !== 'Migrado do inventário' ? client.name : '';
    if (cpfEl) cpfEl.value = client.cpf || '';
    if (emailEl) emailEl.value = client.email || '';
    if (phoneEl) phoneEl.value = client.phone || '';
    if (priceEl && reservation.unitPrice != null) {
        priceEl.value = Number(reservation.unitPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (notesEl) {
        var noteBits = [];
        if (reservation.brokerName) noteBits.push('Corretor: ' + reservation.brokerName);
        if (reservation.id) noteBits.push('Reserva: ' + reservation.id);
        notesEl.value = noteBits.join(' · ');
    }
    var syncEl = document.getElementById('saleSyncUnitStatus');
    if (syncEl) syncEl.checked = true;
    showMessage('Formulário de Vendas preenchido com os dados da reserva. Complete CPF/email e anexe o contrato.', 'info');
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
            '<td><strong>' + escapeHtml(broker.name || '—') + '</strong></td>' +
            '<td>' + escapeHtml(broker.email || '') + '</td>' +
            '<td>' + escapeHtml(broker.phone || '—') + '</td>' +
            '<td>' + escapeHtml(broker.creci || '—') + '</td>' +
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
            '<td><strong>' + escapeHtml(broker.name || '—') + '</strong></td>' +
            '<td>' + escapeHtml(broker.email || '') + '</td>' +
            '<td>' + escapeHtml(broker.phone || '—') + '</td>' +
            '<td>' + escapeHtml(broker.creci || '—') + '</td>' +
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
        } else if (preview && preview.isReady && ready > 0) {
            hint.textContent = 'Pronto para ' + ready + ' corretor(es). Destaque: ';
            if (preview.campaignWeek && preview.campaignWeek.featuredPropertyTitle) {
                hint.textContent += preview.campaignWeek.featuredPropertyTitle;
                if (preview.campaignWeek.featuredPrice) hint.textContent += ' (' + preview.campaignWeek.featuredPrice + ')';
            } else {
                hint.textContent += 'automático';
            }
        } else if (preview && preview.duplicateRecordsInDb > 0) {
            hint.textContent = 'Há duplicatas no cadastro. Clique Atualizar para reorganizar a base.';
        } else if (ready === 0) {
            hint.textContent = 'Nenhum destinatário elegível. Confira telefone (DDD+9) e coluna Campanha = Recebe.';
        } else {
            hint.textContent = preview && preview.nextWeeklyNote ? preview.nextWeeklyNote : '';
        }
    }
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
    var enabled = !!(el && el.checked);
    updateBrokerCampaignWeeklyBarUi(enabled);
    var statusEl = document.getElementById('brokerCampaignWeeklyStatus');
    if (statusEl) statusEl.textContent = 'Salvando...';
    adminPostJson('/brokerCampaignConfig', { enabled: enabled }).then(function(res) {
        if (res && res.config) applyBrokerCampaignConfigFields(res.config);
        updateBrokerCampaignWeeklyBarUi(enabled);
        if (typeof showMessage === 'function') {
            showMessage(enabled ? 'Campanha semanal ligada.' : 'Campanha semanal desligada.', 'success');
        }
        return loadBrokerCampaignPreview();
    }).catch(function(err) {
        if (el) el.checked = !enabled;
        syncBrokerCampaignWeeklyCheckboxes(el);
        updateBrokerCampaignWeeklyBarUi(!!(el && el.checked));
        if (typeof showMessage === 'function') {
            showMessage('Erro ao salvar interruptor: ' + (err.message || ''), 'error');
        }
    });
}

function updateBrokerCampaignWeeklyBarUi(enabled) {
    var wrap = document.querySelector('.broker-campaign-top__switch');
    var statusEl = document.getElementById('brokerCampaignWeeklyStatus');
    if (wrap) {
        if (enabled) wrap.classList.remove('is-off');
        else wrap.classList.add('is-off');
    }
    if (statusEl && statusEl.textContent !== 'Salvando...') {
        statusEl.textContent = enabled
            ? 'Ligada · próxima segunda 08h'
            : 'Desligada · só manual';
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
    var tplMulti = document.getElementById('brokerCampaignTemplateMulti');
    if (tplMulti) tplMulti.value = cfg.templateNameMulti || 'campanha_corretor_msg4';
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
    if (!ensureAdminApiReady()) {
        if (statusEl) statusEl.textContent = 'Entre no painel administrativo para preparar a campanha.';
        return loadBrokerCampaignPreview();
    }
    if (!force) {
        try {
            if (sessionStorage.getItem('brokerCampaignPrepared') === '1') {
                if (statusEl) statusEl.textContent = '';
                return loadBrokerCampaignPreview().then(function() {
                    return adminFetchJson('/brokerCampaignConfig').then(applyBrokerCampaignConfigFields);
                });
            }
        } catch (e) {}
    }
    if (statusEl) statusEl.textContent = '';
    return adminPostJson('/brokerCampaignPrepare', {
        purgeArchived: true,
        forceCleanup: !!force
    }, { timeoutMs: 300000 }).then(function(r) {
        try { sessionStorage.setItem('brokerCampaignPrepared', '1'); } catch (e) {}
        if (r && r.preview) renderBrokerCampaignKpis(r.preview);
        if (statusEl) statusEl.textContent = '';
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
        } else if (row.deliveryStatus === 'delivered' || row.deliveryStatus === 'read') {
            txt += ' Meta confirmou entrega no aparelho. Marketing pode aparecer em Atualizações/Promoções no WhatsApp — peça ao corretor buscar "B F Marques".';
        } else if (row.deliveryStatus === 'sent') {
            msgType = 'warning';
            txt += ' Enviado ao servidor WhatsApp; aguardando confirmação no celular.';
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
    var tplMulti = document.getElementById('brokerCampaignTemplateMulti');
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
        templateNameMulti: tplMulti ? String(tplMulti.value || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') : '',
        preferMultiVarTemplate: !!(tplMulti && String(tplMulti.value || '').trim()),
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

// Load reports — implementado em js/admin-reports.js

// Load settings data
function loadSettingsData() {
    // Load current settings
    const companyName = localStorage.getItem('companyName') || 'Construtora Premium';
    const contactEmail = localStorage.getItem('contactEmail') || 'contato@construtorapremium.com';
    const contactPhone = localStorage.getItem('contactPhone') || '(11) 99999-9999';
    const maxReservations = localStorage.getItem('maxReservations') || '5';
    
    document.getElementById('companyName').value = companyName;
    document.getElementById('contactEmail').value = contactEmail;
    document.getElementById('contactPhone').value = contactPhone;
    if (document.getElementById('maxReservations')) document.getElementById('maxReservations').value = maxReservations;
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
    
    localStorage.setItem('maxReservations', formData.get('maxReservations'));
    
    showMessage('Configurações de reserva salvas com sucesso!', 'success');
}

// Export properties
function exportProperties() {
    exportPropertiesToCSV();
}

// Export reservations
function exportReservations() {
    if (!ensureAdminApiReady()) {
        showMessage('Faça login para exportar.', 'error');
        return;
    }
    adminReservationMutate({ action: 'list' }).then(function(data) {
        var allReservations = (data && data.reservations) ? data.reservations : [];
        if (!allReservations.length) {
            showMessage('Não há reservas para exportar.', 'warning');
            return;
        }
        var csvData = allReservations.map(function(reservation) {
            var client = reservation.client || reservation.clientInfo || {};
            return {
                'ID': reservation.id,
                'Empreendimento': reservation.propertyTitle || 'N/A',
                'Unidade': reservation.unitCode || 'N/A',
                'Corretor': reservation.brokerName || 'N/A',
                'Email Corretor': reservation.brokerEmail || 'N/A',
                'Cliente': client.name || 'N/A',
                'Email Cliente': client.email || 'N/A',
                'Telefone Cliente': client.phone || 'N/A',
                'CPF Cliente': client.cpf || 'N/A',
                'Status': typeof reservationStatusLabel === 'function' ? reservationStatusLabel(reservation.status) : reservation.status,
                'Solicitada em': reservation.requestedAt ? formatDate(reservation.requestedAt) : '',
                'Expira em': reservation.expiresAt ? formatDate(reservation.expiresAt) : ''
            };
        });
        var headers = Object.keys(csvData[0]);
        var csvContent = headers.join(',') + '\n';
        csvData.forEach(function(row) {
            csvContent += headers.map(function(header) { return '"' + row[header] + '"'; }).join(',') + '\n';
        });
        var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        var link = document.createElement('a');
        var url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'reservas_' + new Date().toISOString().split('T')[0] + '.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showMessage('Arquivo CSV de reservas exportado com sucesso!', 'success');
    }).catch(function(err) {
        showMessage(err.message || 'Erro ao exportar.', 'error');
    });
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

// Generate sales report — implementado em js/admin-reports.js

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
        case 'unit_reservation_request':
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
        case 'unit_reservation_request':
            html = `
                <p><strong>Imóvel:</strong> ${data.propertyTitle}</p>
                ${data.unitCode ? '<p><strong>Unidade:</strong> ' + data.unitCode + '</p>' : ''}
                <p><strong>Corretor:</strong> ${data.brokerName}</p>
                <p><strong>Cliente:</strong> ${data.clientName}</p>
                <p><strong>CPF:</strong> ${data.clientCPF || '—'}</p>
                <p><strong>Telefone:</strong> ${data.clientPhone || '—'}</p>
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
        'unit_reservation_request': 'Solicitação de Reserva (Unidade)',
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
