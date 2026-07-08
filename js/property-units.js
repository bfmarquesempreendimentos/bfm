// Property units — catálogo em js/property-units-catalog.js (fonte: data/property-units.json)
// Carregue property-units-catalog.js antes deste arquivo.

function getCodeBaseUnitStatus(propertyId, unitCode) {
    var raw = propertyUnits[propertyId] || propertyUnits[String(propertyId)];
    if (!raw || !raw.units) return null;
    var j, u;
    for (j = 0; j < raw.units.length; j++) {
        u = raw.units[j];
        if (u.code === unitCode) return u.status || 'disponivel';
    }
    return null;
}

/** Resolve status efetivo: override operacional prevalece sobre catálogo. */
function resolveUnitStatusClient(catalogStatus, overrideStatus) {
    if (overrideStatus != null && overrideStatus !== '') {
        return String(overrideStatus).toLowerCase();
    }
    return String(catalogStatus || 'disponivel').toLowerCase();
}

function reconcileAuthoritativeUnitStatuses() {
    try {
        var ov = getUnitStatusOverrides();
        var pid, raw, units, j, u, pidKey;
        for (pid in propertyUnits) {
            if (!Object.prototype.hasOwnProperty.call(propertyUnits, pid)) continue;
            raw = propertyUnits[pid];
            if (!raw || !raw.units) continue;
            pidKey = String(pid);
            if (!ov[pidKey]) ov[pidKey] = {};
            units = raw.units;
            for (j = 0; j < units.length; j++) {
                u = units[j];
                if (u.status && u.status !== 'disponivel') {
                    ov[pidKey][u.code] = u.status;
                }
            }
        }
        localStorage.setItem('unitStatusOverrides', JSON.stringify(ov));
    } catch (e) {}
}

// Unit status overrides (ex: importação do PDF) - persiste em localStorage
function getUnitStatusOverrides() {
    try {
        const s = localStorage.getItem('unitStatusOverrides');
        return s ? JSON.parse(s) : {};
    } catch { return {}; }
}
function setUnitStatusOverride(propertyId, unitCode, status) {
    const ov = getUnitStatusOverrides();
    if (!ov[propertyId]) ov[propertyId] = {};
    ov[propertyId][unitCode] = status;
    localStorage.setItem('unitStatusOverrides', JSON.stringify(ov));
    pushUnitStatusToServer(propertyId, unitCode, status);
}

(function clearStaleUnitOverridesIfNeeded() {
    try {
        if (typeof localStorage === 'undefined') return;
        var key = 'unitInventoryVersion';
        if (localStorage.getItem(key) !== UNIT_INVENTORY_VERSION) {
            localStorage.removeItem('unitStatusOverrides');
            localStorage.setItem(key, UNIT_INVENTORY_VERSION);
            reconcileAuthoritativeUnitStatuses();
            if (typeof fetchUnitStatusOverridesFromServer === 'function') {
                fetchUnitStatusOverridesFromServer();
            }
        }
    } catch (e) {}
})();

function pushReconcileStatusesToServerIfAdmin() {
    var creds = null;
    try {
        if (typeof getAdminApiCredentials === 'function') creds = getAdminApiCredentials();
        else {
            var raw = localStorage.getItem('adminUser');
            if (raw) {
                var u = JSON.parse(raw);
                creds = { email: u.email, password: u.password || '' };
            }
        }
    } catch (e) {}
    if (!creds || !creds.email || !creds.password || typeof fetch === 'undefined') return;
    var items = [];
    var pid, raw, units, j, u;
    for (pid in propertyUnits) {
        if (!Object.prototype.hasOwnProperty.call(propertyUnits, pid)) continue;
        raw = propertyUnits[pid];
        if (!raw || !raw.units) continue;
        units = raw.units;
        for (j = 0; j < units.length; j++) {
            u = units[j];
            if (u.status && u.status !== 'disponivel') {
                items.push({ propertyId: Number(pid) || pid, unitCode: u.code, status: u.status });
            }
        }
    }
    if (!items.length) return;
    /* pushReconcileStatusesToServerIfAdmin desativado: não sobrescrever overrides operacionais no Firestore */
}

function pushUnitStatusToServer(propertyId, unitCode, status) {
    var creds = null;
    try {
        if (typeof getAdminApiCredentials === 'function') creds = getAdminApiCredentials();
        else {
            var raw = localStorage.getItem('adminUser');
            if (raw) {
                var u = JSON.parse(raw);
                creds = { email: u.email, password: u.password || '' };
            }
        }
    } catch (e) {}
    if (typeof fetch === 'undefined') return;
    var baseUrl = (typeof getCloudFunctionsBaseUrl === 'function')
        ? getCloudFunctionsBaseUrl()
        : 'https://us-central1-site-interativo-b-f-marques.cloudfunctions.net';
    var url = baseUrl + '/adminSetUnitStatusOverrides';
    var postPayload = { items: [{ propertyId: propertyId, unitCode: unitCode, status: status }] };
    var doPost = function(headers, payload) {
        fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(payload) }).catch(function() {});
    };
    if (typeof getAdminIdToken === 'function') {
        getAdminIdToken().then(function(token) {
            var headers = { 'Content-Type': 'application/json' };
            if (token) {
                headers.Authorization = 'Bearer ' + token;
                doPost(headers, postPayload);
            } else if (creds && creds.email && creds.password) {
                postPayload.adminEmail = creds.email;
                postPayload.adminPassword = creds.password;
                doPost(headers, postPayload);
            }
        });
        return;
    }
    if (!creds || !creds.email || !creds.password) return;
    postPayload.adminEmail = creds.email;
    postPayload.adminPassword = creds.password;
    doPost({ 'Content-Type': 'application/json' }, postPayload);
}

function normalizeUnitSlotToken(raw) {
    if (raw == null || raw === '') return '';
    return String(raw).toLowerCase().replace(/\s+/g, ' ').trim();
}

function normAlnumUnit(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getPropertyUnitsRaw(propertyId) {
    if (propertyId == null || propertyId === '') return null;
    if (typeof SALES_EXCLUDED_PROPERTY_IDS !== 'undefined' && SALES_EXCLUDED_PROPERTY_IDS[Number(propertyId)]) return null;
    var pidNum = Number(propertyId);
    if (!isNaN(pidNum) && propertyUnits[pidNum]) return propertyUnits[pidNum];
    if (propertyUnits[propertyId]) return propertyUnits[propertyId];
    return propertyUnits[String(propertyId)] || null;
}

function listUnitCodesForProperty(propertyId) {
    var raw = getPropertyUnitsRaw(propertyId);
    if (!raw || !raw.units) return [];
    var out = [];
    var i;
    for (i = 0; i < raw.units.length; i++) out.push(raw.units[i].code);
    return out;
}

function fuzzyMatchUnitInList(units, unitInputRaw) {
    var input = normalizeUnitSlotToken(unitInputRaw);
    var inputA = normAlnumUnit(unitInputRaw);
    if (!inputA) return null;
    var i;
    var u;
    var matches = [];
    var tokens = input ? input.split(' ').filter(function(t) { return !!t; }) : [];

    if (/^\d+$/.test(inputA)) {
        for (i = 0; i < units.length; i++) {
            u = units[i];
            var uA = normAlnumUnit(u.code);
            if (uA === inputA || uA.slice(-inputA.length) === inputA) matches.push(u);
        }
        if (matches.length === 1) return matches[0];
        matches = [];
    }

    for (i = 0; i < units.length; i++) {
        u = units[i];
        var uNorm = normalizeUnitSlotToken(u.code);
        var uA2 = normAlnumUnit(u.code);
        if (uNorm === input || uA2 === inputA) return u;
        if (inputA.length >= 3 && (uA2.indexOf(inputA) >= 0 || inputA.indexOf(uA2) >= 0)) {
            matches.push(u);
            continue;
        }
        if (tokens.length) {
            var ok = true;
            var ti;
            for (ti = 0; ti < tokens.length; ti++) {
                var tokA = normAlnumUnit(tokens[ti]);
                if (uNorm.indexOf(tokens[ti]) < 0 && uA2.indexOf(tokA) < 0) {
                    ok = false;
                    break;
                }
            }
            if (ok) matches.push(u);
        }
    }

    if (matches.length === 1) return matches[0];
    return null;
}

function formatUnitCodesHint(units, max) {
    max = max != null ? max : 8;
    if (!units || !units.length) return '';
    var slice = units.slice(0, max);
    var codes = [];
    var i;
    for (i = 0; i < slice.length; i++) codes.push(slice[i].code);
    var hint = codes.join(', ');
    if (units.length > max) hint += '… (+' + (units.length - max) + ')';
    return hint;
}

/**
 * Chave única de venda por empreendimento + unidade (ou __single__ se há só uma unidade).
 * @returns {{ saleSlotKey: string, unitCode: string|null, single: boolean, error: string|null }}
 */
function getSaleSlotInfoForProperty(propertyId, unitInputRaw) {
    var raw = getPropertyUnitsRaw(propertyId);
    if (!raw || !raw.units || !raw.units.length) {
        return { saleSlotKey: null, unitCode: null, single: false, error: 'Empreendimento sem unidades cadastradas no sistema. Verifique js/property-units.js ou selecione outro imóvel.' };
    }
    var units = raw.units;
    if (units.length === 1) {
        return {
            saleSlotKey: String(propertyId) + '|__single__',
            unitCode: units[0].code,
            single: true,
            error: null
        };
    }
    var input = normalizeUnitSlotToken(unitInputRaw);
    if (!input) {
        return {
            saleSlotKey: null,
            unitCode: null,
            single: false,
            error: 'Informe a unidade vendida. Exemplos neste empreendimento: ' + formatUnitCodesHint(units, 6) + '.'
        };
    }
    var i;
    var u;
    for (i = 0; i < units.length; i++) {
        u = units[i];
        if (normalizeUnitSlotToken(u.code) === input) {
            return { saleSlotKey: String(propertyId) + '|' + normalizeUnitSlotToken(u.code), unitCode: u.code, single: false, error: null };
        }
    }
    var inputA = normAlnumUnit(unitInputRaw);
    for (i = 0; i < units.length; i++) {
        u = units[i];
        if (normAlnumUnit(u.code) === inputA) {
            return { saleSlotKey: String(propertyId) + '|' + normalizeUnitSlotToken(u.code), unitCode: u.code, single: false, error: null };
        }
    }
    var fuzzy = fuzzyMatchUnitInList(units, unitInputRaw);
    if (fuzzy) {
        return {
            saleSlotKey: String(propertyId) + '|' + normalizeUnitSlotToken(fuzzy.code),
            unitCode: fuzzy.code,
            single: false,
            error: null
        };
    }
    return {
        saleSlotKey: null,
        unitCode: null,
        single: false,
        error: 'Unidade não encontrada neste empreendimento. Unidades cadastradas: ' + formatUnitCodesHint(units, 10) + '.'
    };
}

function mergeRemoteUnitOverridesPayload(payload) {
    if (!payload || typeof payload !== 'object') return;
    var ov = getUnitStatusOverrides();
    var pid;
    for (pid in payload) {
        if (!Object.prototype.hasOwnProperty.call(payload, pid)) continue;
        var units = payload[pid];
        if (!units || typeof units !== 'object') continue;
        if (!ov[pid]) ov[pid] = {};
        var code;
        for (code in units) {
            if (Object.prototype.hasOwnProperty.call(units, code)) {
                ov[pid][code] = units[code];
            }
        }
    }
    localStorage.setItem('unitStatusOverrides', JSON.stringify(ov));
}

function fetchUnitStatusOverridesFromServer(done) {
    var base = (typeof getCloudFunctionsBaseUrl === 'function')
        ? getCloudFunctionsBaseUrl()
        : ((typeof ApiClient !== 'undefined' && ApiClient.getBaseUrl) ? ApiClient.getBaseUrl() : '');
    var url = base + '/getPublicUnitOverrides?_=';
    if (typeof fetch === 'undefined') {
        if (typeof done === 'function') done();
        return;
    }
    fetch(url + Date.now(), { cache: 'no-store', credentials: 'omit' })
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(data) {
            if (data && typeof data === 'object') mergeRemoteUnitOverridesPayload(data);
            if (typeof done === 'function') done();
        })
        .catch(function() {
            if (typeof done === 'function') done();
        });
}

// Get units for a property (aplica overrides de status)
function getPropertyUnits(propertyId) {
    var data = getPropertyUnitsRaw(propertyId);
    if (!data) return null;
    var ovAll = getUnitStatusOverrides();
    var overrides = ovAll[propertyId] || ovAll[String(propertyId)] || {};
    return {
        name: data.name,
        units: data.units.map(function(u) {
            var st = resolveUnitStatusClient(u.status, overrides[u.code]);
            return { code: u.code, price: u.price, bedrooms: u.bedrooms, status: st };
        }),
        engineeringValues: data.engineeringValues,
        matriculas: data.matriculas
    };
}

// Get unit status color class
function getUnitStatusClass(status) {
    const statusMap = {
        'disponivel': 'unit-available',
        'reservado': 'unit-reserved', 
        'assinado': 'unit-signed'
    };
    return statusMap[status] || 'unit-available';
}

// Get unit status text
function getUnitStatusText(status) {
    const statusMap = {
        'disponivel': 'Disponível',
        'reservado': 'Reservado',
        'assinado': 'Assinado'
    };
    return statusMap[status] || status;
}

/**
 * Resumo de inventário por empreendimento (para cards do site e filtros futuros).
 * @returns {{ total: number, disponivel: number, reservado: number, assinado: number } | null}
 */
function getEnterpriseInventorySummary(propertyId) {
    var data = typeof getPropertyUnits === 'function' ? getPropertyUnits(propertyId) : null;
    if (!data || !Array.isArray(data.units) || data.units.length === 0) return null;
    var units = data.units;
    var total = units.length;
    var disponivel = 0;
    var reservado = 0;
    var assinado = 0;
    for (var i = 0; i < units.length; i++) {
        var st = String(units[i].status || '').toLowerCase();
        if (st === 'disponivel') disponivel++;
        else if (st === 'reservado') reservado++;
        else if (st === 'assinado') assinado++;
    }
    return { total: total, disponivel: disponivel, reservado: reservado, assinado: assinado };
}

/**
 * Painel admin / métricas: agrega todas as unidades dos empreendimentos.
 * O status no nível do card em `properties` não reflete unidade a unidade.
 */
function getAggregatedUnitInventoryForDashboard() {
    var out = {
        empreendimentos: 0,
        unidadesTotal: 0,
        disponivel: 0,
        reservado: 0,
        assinado: 0,
        valorDisponiveis: 0,
    };
    if (typeof getVisibleProperties === 'function' && typeof properties !== 'undefined' && properties && properties.length) {
        out.empreendimentos = getVisibleProperties(properties).length;
    } else if (typeof properties !== 'undefined' && properties && properties.length) {
        out.empreendimentos = properties.length;
    }
    var pid;
    for (pid = 1; pid <= 8; pid++) {
        var data = typeof getPropertyUnits === 'function' ? getPropertyUnits(pid) : null;
        if (!data || !Array.isArray(data.units) || data.units.length === 0) {
            continue;
        }
        var u;
        for (u = 0; u < data.units.length; u++) {
            var unit = data.units[u];
            out.unidadesTotal++;
            var st = String(unit.status || '').toLowerCase();
            if (st === 'disponivel') {
                out.disponivel++;
                out.valorDisponiveis += Number(unit.price) || 0;
            } else if (st === 'reservado') {
                out.reservado++;
            } else if (st === 'assinado') {
                out.assinado++;
            }
        }
    }
    if (out.empreendimentos === 0 && out.unidadesTotal > 0) {
        out.empreendimentos = 7;
    }
    return out;
}

// Create units table for property
function createUnitsTable(propertyId) {
    const propertyData = getPropertyUnits(propertyId);
    if (!propertyData) return '';
    
    const units = propertyData.units;
    const columns = Math.ceil(units.length / Math.ceil(units.length / 3)); // Divide in ~3 columns
    
    let tableHTML = `
        <div class="units-section">
            <h4>${propertyData.name}</h4>
            <div class="status-legend">
                <div class="legend-item">
                    <span class="legend-color unit-available"></span>
                    <span>DISPONÍVEL</span>
                </div>
                <div class="legend-item">
                    <span class="legend-color unit-reserved"></span>
                    <span>RESERVADO</span>
                </div>
                <div class="legend-item">
                    <span class="legend-color unit-signed"></span>
                    <span>ASSINADO ESCRITURA</span>
                </div>
            </div>
            <div class="units-table-container">
                <table class="units-table">
                    <thead>
                        <tr>
                            <th colspan="2">Vlr. Venda</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    // Create table rows in pairs
    for (let i = 0; i < units.length; i += 2) {
        const unit1 = units[i];
        const unit2 = units[i + 1];
        
        tableHTML += `
            <tr>
                <td class="${getUnitStatusClass(unit1.status)}" onclick="selectUnit('${propertyId}', '${unit1.code}')">
                    <div class="unit-code">${unit1.code}</div>
                    <div class="unit-price">R$ ${unit1.price.toLocaleString('pt-BR')}</div>
                </td>
                ${unit2 ? `
                    <td class="${getUnitStatusClass(unit2.status)}" onclick="selectUnit('${propertyId}', '${unit2.code}')">
                        <div class="unit-code">${unit2.code}</div>
                        <div class="unit-price">R$ ${unit2.price.toLocaleString('pt-BR')}</div>
                    </td>
                ` : '<td></td>'}
            </tr>
        `;
    }
    
    tableHTML += `
                    </tbody>
                </table>
            </div>
            
            ${propertyData.matriculas ? `
                <div class="matriculas-section">
                    <h5>Matrículas:</h5>
                    <div class="matriculas-grid">
                        ${Object.entries(propertyData.matriculas).map(([unit, matricula]) => `
                            <div class="matricula-item">
                                <span class="matricula-unit">${unit}</span>
                                <span class="matricula-number">${matricula}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            ${propertyData.engineeringValues ? `
                <div class="engineering-values-section">
                    <h5>Valor Engenharia:</h5>
                    <div class="engineering-grid">
                        ${Object.entries(propertyData.engineeringValues).map(([unit, value]) => `
                            <div class="engineering-item">
                                <span class="engineering-unit">${unit}</span>
                                <span class="engineering-value">${value}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
    
    return tableHTML;
}

// Select unit for reservation
function selectUnit(propertyId, unitCode) {
    var pid = typeof findPropertyByIdLoose === 'function' ? findPropertyByIdLoose(propertyId) : null;
    var pidNorm = pid ? pid.id : propertyId;
    const propertyData = getPropertyUnits(pidNorm);
    if (!propertyData) return;
    
    const unit = propertyData.units.filter(function(u) { return u.code === unitCode; })[0];
    if (!unit) return;
    
    if (unit.status !== 'disponivel') {
        showMessage('Esta unidade está ' + getUnitStatusText(unit.status).toLowerCase() + '.', 'warning');
        return;
    }
    
    sessionStorage.setItem('selectedUnit', JSON.stringify({
        propertyId: pidNorm,
        unitCode: unitCode,
        price: unit.price,
        bedrooms: unit.bedrooms
    }));
    
    reservePropertyUnit(pidNorm, unitCode);
}

// Reserve specific unit
function reservePropertyUnit(propertyId, unitCode) {
    if (!isAuthenticated()) {
        showMessage('Você precisa estar logado para fazer uma reserva.', 'error');
        openLoginModal();
        return;
    }
    
    if (!isBroker()) {
        showMessage('Apenas corretores podem fazer reservas.', 'error');
        return;
    }

    var openForm = function() {
        var property = typeof findPropertyByIdLoose === 'function'
            ? findPropertyByIdLoose(propertyId)
            : null;
        var selectedUnit = null;
        try {
            selectedUnit = JSON.parse(sessionStorage.getItem('selectedUnit') || 'null');
        } catch (e) {
            selectedUnit = null;
        }

        if (!selectedUnit && unitCode && typeof getPropertyUnits === 'function') {
            var unitData = getPropertyUnits(propertyId);
            if (unitData && unitData.units) {
                var match = unitData.units.filter(function(u) {
                    return String(u.code) === String(unitCode);
                })[0];
                if (match) {
                    selectedUnit = {
                        propertyId: property ? property.id : propertyId,
                        unitCode: match.code,
                        price: match.price,
                        bedrooms: match.bedrooms
                    };
                    sessionStorage.setItem('selectedUnit', JSON.stringify(selectedUnit));
                }
            }
        }

        if (!property && selectedUnit && selectedUnit.propertyId) {
            property = typeof findPropertyByIdLoose === 'function'
                ? findPropertyByIdLoose(selectedUnit.propertyId)
                : null;
        }
        
        if (!property || !selectedUnit) {
            showMessage('Selecione uma unidade disponível (verde) na tabela antes de reservar.', 'warning');
            return;
        }
        if (String(selectedUnit.unitCode || '') !== String(unitCode || selectedUnit.unitCode || '')) {
            showMessage('Unidade selecionada não confere. Clique novamente na unidade verde.', 'warning');
            return;
        }
        
        showUnitReservationForm(property, selectedUnit);
    };

    if (typeof ensureBrokerFirebaseSession === 'function') {
        ensureBrokerFirebaseSession().then(openForm).catch(function(err) {
            showMessage(err.message || 'Faça login novamente.', 'error');
            openLoginModal();
        });
        return;
    }
    openForm();
}

// Show unit reservation form
function showUnitReservationForm(property, selectedUnit) {
    var modal = document.getElementById('propertyModal');
    var detailsContainer = document.getElementById('propertyDetails');
    var reservationId = typeof generateReservationId === 'function'
        ? generateReservationId()
        : ('RES' + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase());
    
    var reservation = {
        id: reservationId,
        propertyId: property.id,
        unitCode: selectedUnit.unitCode,
        brokerId: currentUser.id,
        brokerName: currentUser.name,
        brokerEmail: currentUser.email,
        brokerPhone: currentUser.phone,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        status: 'pending',
        clientInfo: null,
        approvedAt: null,
        approvedBy: null
    };
    
    var expiryPreview = typeof previewReservationExpiry === 'function'
        ? previewReservationExpiry(new Date(), typeof getReservationBusinessDays === 'function' ? getReservationBusinessDays() : 3)
        : null;
    var expiryHint = expiryPreview && typeof formatDate === 'function'
        ? formatDate(expiryPreview)
        : (getReservationBusinessDays ? getReservationBusinessDays() : 3) + ' dias úteis após aprovação';

    detailsContainer.innerHTML = `
        <div class="unit-reservation-form-container">
            <h2>Reservar Unidade</h2>
            <div class="unit-summary">
                <h3>${property.title}</h3>
                <p><i class="fas fa-map-marker-alt"></i> ${property.location}</p>
                <div class="unit-details">
                    <p><strong>Unidade:</strong> ${selectedUnit.unitCode}</p>
                    <p><strong>Quartos:</strong> ${selectedUnit.bedrooms}</p>
                    <p class="unit-price">R$ ${selectedUnit.price.toLocaleString('pt-BR')}</p>
                </div>
            </div>
            
            <form id="unitReservationForm" class="reservation-form">
                <div class="form-section">
                    <h4>Informações do Cliente</h4>
                    <div class="form-group">
                        <label for="clientName">Nome Completo do Cliente:</label>
                        <input type="text" id="clientName" name="clientName" required>
                    </div>
                    <div class="form-group">
                        <label for="clientEmail">Email do Cliente:</label>
                        <input type="email" id="clientEmail" name="clientEmail" required>
                    </div>
                    <div class="form-group">
                        <label for="clientPhone">Telefone do Cliente:</label>
                        <input type="tel" id="clientPhone" name="clientPhone" required>
                    </div>
                    <div class="form-group">
                        <label for="clientCPF">CPF do Cliente:</label>
                        <input type="text" id="clientCPF" name="clientCPF" required>
                    </div>
                </div>
                
                <div class="form-section">
                    <h4>Informações da Reserva</h4>
                    <div class="reservation-info">
                        <p><strong>Corretor solicitante:</strong> ${currentUser.name}</p>
                        <p><strong>CRECI:</strong> ${currentUser.creci || '—'}</p>
                        <p><strong>Solicitada em:</strong> ${typeof formatDate === 'function' ? formatDate(new Date()) : '—'}</p>
                        <p><strong>Prazo após aprovação:</strong> ${expiryHint}</p>
                    </div>
                    
                    <div class="form-group">
                        <label for="reservationNotes">Observações (opcional):</label>
                        <textarea id="reservationNotes" name="reservationNotes" rows="4" placeholder="Informações adicionais sobre a reserva..."></textarea>
                    </div>
                </div>
                
                <div class="form-section">
                    <div class="terms-section">
                        <label class="checkbox-container">
                            <input type="checkbox" id="agreeTerms" required>
                            <span class="checkmark"></span>
                            Concordo com os termos e condições da reserva
                        </label>
                        <div class="terms-text">
                            <h5>Termos da Reserva:</h5>
                            <ul>${typeof buildReservationFormTermsHtml === 'function' ? buildReservationFormTermsHtml() : ''}</ul>
                        </div>
                    </div>
                </div>
                
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closePropertyModal()">Cancelar</button>
                    <button type="submit" class="btn btn-primary">Enviar solicitação</button>
                </div>
            </form>
        </div>
    `;
    
    modal.style.display = 'block';
    
    // Setup form submission
    var form = document.getElementById('unitReservationForm');
    if (form) {
        form.addEventListener('submit', function(e) {
            handleUnitReservationSubmission(e, property, selectedUnit, reservation);
        });
    }
    
    // Setup masks
    setupFormMasks();
}

// Handle unit reservation submission
function handleUnitReservationSubmission(e, property, selectedUnit, reservation) {
    e.preventDefault();

    var formData = new FormData(e.target);
    var cpf = formData.get('clientCPF');
    if (!isValidCPF(cpf)) {
        showMessage('CPF inválido. Por favor, verifique o número digitado.', 'error');
        return;
    }

    var payload = {
        propertyId: property.id,
        propertyTitle: property.title,
        unitCode: selectedUnit.unitCode,
        unitPrice: selectedUnit.price,
        unitBedrooms: selectedUnit.bedrooms,
        client: {
            name: formData.get('clientName'),
            email: formData.get('clientEmail'),
            phone: formData.get('clientPhone'),
            cpf: cpf,
            notes: formData.get('reservationNotes') || ''
        }
    };

    var submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    submitReservationToServer(payload).then(function(data) {
        closePropertyModal();
        if (typeof displayProperties === 'function') displayProperties(properties);
        sessionStorage.removeItem('selectedUnit');
        var resRow = data && data.reservation ? data.reservation : null;
        if (typeof createUnitReservationNotification === 'function' && resRow) {
            createUnitReservationNotification(
                typeof normalizeReservationRow === 'function' ? normalizeReservationRow(resRow) : resRow,
                property,
                selectedUnit,
                currentUser
            );
        }
        if (typeof sendEmail === 'function') {
            var subject = 'Nova Solicitação de Reserva - ' + property.title;
            var body = '<h2>Nova Solicitação de Reserva</h2>' +
                '<p><strong>Imóvel:</strong> ' + property.title + '</p>' +
                '<p><strong>Unidade:</strong> ' + selectedUnit.unitCode + '</p>' +
                '<p><strong>Corretor:</strong> ' + currentUser.name + '</p>' +
                '<p><strong>Cliente:</strong> ' + payload.client.name + '</p>' +
                '<p>Acesse o painel administrativo para aprovar ou rejeitar.</p>';
            sendEmail('bfmarquesempreendimentos@gmail.com', subject, body).catch(function() {});
        }
        showMessage('Solicitação de reserva da unidade ' + selectedUnit.unitCode + ' enviada! Aguarde aprovação do administrador.', 'success');
    }).catch(function(err) {
        showMessage(err.message || 'Erro ao enviar reserva.', 'error');
    }).then(function() {
        if (submitBtn) submitBtn.disabled = false;
    });
}

// Create unit reservation notification
function createUnitReservationNotification(reservation, property, unit, broker) {
    const title = 'Nova Solicitação de Reserva de Unidade';
    const message = `${broker.name} solicitou reserva da unidade ${unit.unitCode} do empreendimento "${property.title}" para o cliente ${reservation.clientInfo.name}`;
    
    return createNotification('unit_reservation_request', title, message, {
        reservationId: reservation.id,
        firestoreReservationId: reservation.id,
        propertyId: property.id,
        unitCode: unit.unitCode,
        unitPrice: unit.price,
        brokerId: broker.id,
        brokerName: broker.name,
        propertyTitle: property.title,
        clientName: reservation.clientInfo.name,
        clientCPF: reservation.clientInfo.cpf,
        clientPhone: reservation.clientInfo.phone
    });
}

// Get units statistics for a property
function getUnitsStatistics(propertyId) {
    const propertyData = getPropertyUnits(propertyId);
    if (!propertyData) return null;
    
    const stats = {
        total: propertyData.units.length,
        available: 0,
        reserved: 0,
        signed: 0,
        totalValue: 0,
        averagePrice: 0
    };
    
    propertyData.units.forEach(unit => {
        stats.totalValue += unit.price;
        
        switch (unit.status) {
            case 'disponivel':
                stats.available++;
                break;
            case 'reservado':
                stats.reserved++;
                break;
            case 'assinado':
                stats.signed++;
                break;
        }
    });
    
    stats.averagePrice = stats.totalValue / stats.total;
    
    return stats;
}

// Setup form masks
function setupFormMasks() {
    // CPF mask
    const cpfInput = document.getElementById('clientCPF');
    if (cpfInput) {
        cpfInput.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            value = value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
            e.target.value = value;
        });
    }
    
    // Phone mask
    const phoneInput = document.getElementById('clientPhone');
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

