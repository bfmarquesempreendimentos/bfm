// Property units management system for B F Marques Empreendimentos
// Espelho para a Bia (WhatsApp): functions/chatbot/property-units-data.js — mantenha os dois sincronizados.

/** Ao mudar o inventário no código, incremente esta versão para limpar overrides antigos no navegador. */
var UNIT_INVENTORY_VERSION = '2026-06-02-laranjal-cs04-cs14-fix';

/** Unidades cujo status no código-base prevalece sobre overrides antigos do servidor. */
var INVENTORY_STATUS_RECONCILE = [
    { propertyId: 2, unitCode: 'casa 03' },
    { propertyId: 2, unitCode: 'casa 07' },
    { propertyId: 4, unitCode: 'CS 04' },
    { propertyId: 4, unitCode: 'CS 14' },
    { propertyId: 7, unitCode: 'APTO 205' },
    { propertyId: 7, unitCode: 'APTO 110' }
];

function isAuthoritativeInventoryUnit(propertyId, unitCode) {
    var i, item;
    var pid = String(propertyId);
    for (i = 0; i < INVENTORY_STATUS_RECONCILE.length; i++) {
        item = INVENTORY_STATUS_RECONCILE[i];
        if (String(item.propertyId) === pid && item.unitCode === unitCode) return true;
    }
    return false;
}

function reconcileAuthoritativeUnitStatuses() {
    try {
        var ov = getUnitStatusOverrides();
        var i, item, raw, units, j, u, pidKey;
        for (i = 0; i < INVENTORY_STATUS_RECONCILE.length; i++) {
            item = INVENTORY_STATUS_RECONCILE[i];
            raw = propertyUnits[item.propertyId];
            if (!raw || !raw.units) continue;
            pidKey = String(item.propertyId);
            if (!ov[pidKey]) ov[pidKey] = {};
            units = raw.units;
            for (j = 0; j < units.length; j++) {
                u = units[j];
                if (u.code === item.unitCode) {
                    ov[pidKey][item.unitCode] = u.status;
                    break;
                }
            }
        }
        localStorage.setItem('unitStatusOverrides', JSON.stringify(ov));
    } catch (e) {}
}

// Property units data based on the spreadsheet provided
const propertyUnits = {
    1: { // Porto Novo
        name: "PORTO NOVO - RUA LOURIVAL MARTINS, 31",
        units: [
            { code: "31 (1qt)", price: 140000, bedrooms: 1, status: "assinado" },
            { code: "31 cs 5 sob (1qt)", price: 165000, bedrooms: 1, status: "assinado" },
            { code: "31 cs 6 (1qt)", price: 170000, bedrooms: 1, status: "assinado" },
            { code: "31 cs 6 sob (1 qt)", price: 160000, bedrooms: 1, status: "assinado" },
            { code: "31 cs 8 (1qt)", price: 170000, bedrooms: 1, status: "assinado" },
            { code: "31 cs 7 sob (1qt)", price: 170000, bedrooms: 1, status: "assinado" },
            { code: "31 cs 4 (1qt)", price: 140000, bedrooms: 1, status: "assinado" },
            { code: "31 cs 8 sob (1qt)", price: 160000, bedrooms: 1, status: "assinado" },
            { code: "31 cs 5 (1qt ind.)", price: 160000, bedrooms: 1, status: "assinado" },
            { code: "31 cs 1 (2qts)", price: 170000, bedrooms: 2, status: "assinado" },
            { code: "31 cs 7 (1qt)", price: 170000, bedrooms: 1, status: "disponivel" },
            { code: "31 cs 2 (2qts)", price: 160000, bedrooms: 2, status: "assinado" },
            { code: "31 cs 4 ap (2qts)", price: 150000, bedrooms: 2, status: "assinado" },
            { code: "31 cs 3 (2qts)", price: 180000, bedrooms: 2, status: "assinado" }
        ],
        matriculas: {
            "31": "51.881",
            "31 cs 5 sob": "51.885",
            "31 cs 6": "51.882",
            "31 cs 6 sob": "51.886",
            "31 cs 8": "51.883",
            "31 cs 7 sob": "51.887",
            "31 cs 4": "51.884",
            "31 cs 8 sob": "51.888",
            "31 cs 5": "51.889",
            "31 cs 1": "51.892",
            "31 cs 7": "51.890",
            "31 cs 2": "51.893",
            "31 cs 4 ap 103": "51.891",
            "31 cs 3": "51.894"
        },
        engineeringValues: {
            "31": "R$ 213.398,12",
            "31 cs 5 sob": "R$ 188.000,00",
            "31 cs 6": "R$ 226.100,00",
            "31 cs 6 sob": "R$ 170.000,00",
            "31 cs 8": "R$ 225.000,00",
            "31 cs 7 sob": "R$ 216.000,00",
            "31 cs 4": "R$ 162.906,09",
            "31 cs 8 sob": "R$ 218.000,00",
            "31 cs 5": "R$ 217.000,00",
            "31 cs 1": "R$ 204.000,00",
            "31 cs 7": "R$ 191.383,57",
            "31 cs 2": "R$ 162.000,00",
            "31 cs 4 ap 103": "R$ 210.000,00",
            "31 cs 3": "R$ 227.000,00"
        }
    },
    
    2: { // Residencial Itaúna - PDF PRONTOS A VENDA
        name: "RESIDENCIAL ITAÚNA - RUA ALCIO SOUTO",
        units: [
            { code: "casa base", price: 155000, bedrooms: 1, status: "disponivel" },
            { code: "casa 05", price: 155000, bedrooms: 1, status: "disponivel" },
            { code: "casa 01", price: 155000, bedrooms: 1, status: "disponivel" },
            { code: "casa 06", price: 155000, bedrooms: 1, status: "disponivel" },
            { code: "casa 02", price: 155000, bedrooms: 1, status: "disponivel" },
            { code: "casa 07", price: 155000, bedrooms: 1, status: "reservado" },
            { code: "casa 03", price: 155000, bedrooms: 1, status: "assinado" },
            { code: "cassa 08", price: 155000, bedrooms: 1, status: "assinado" },
            { code: "casa 04", price: 160000, bedrooms: 1, status: "assinado" },
            { code: "casa 09", price: 160000, bedrooms: 1, status: "assinado" }
        ],
        engineeringValues: {
            "Cs base": "R$ 195.000,00",
            "Cs 5": "R$ 193.000,00",
            "Cs 1": "R$ 193.000,00",
            "Cs 6": "R$ 150.000,00",
            "Cs 2": "R$ 200.000,00",
            "Cs 3": "R$ 150.000,00",
            "Cs 7": "R$ 193.000,00",
            "Cs 8": "R$ 195.000,00",
            "Cs 4": "R$ 205.000,00",
            "Cs 9": "R$ 205.000,00"
        }
    },
    
    3: { // Bandeirantes
        name: "EDIFÍCIO BANDEIRANTES - R LOPES DA CRUZ, 136",
        units: [
            { code: "APTO 101", price: 160000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 201", price: 165000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 102", price: 165000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 202", price: 160000, bedrooms: 1, status: "reservado" },
            { code: "APTO 103", price: 165000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 203", price: 160000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 104", price: 165000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 204", price: 160000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 105", price: 165000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 205", price: 160000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 106", price: 165000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 206", price: 160000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 107", price: 165000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 207", price: 160000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 108", price: 165000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 208", price: 160000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 109", price: 165000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 209", price: 160000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 110", price: 170000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 210", price: 165000, bedrooms: 1, status: "disponivel" }
        ],
        engineeringValues: {
            "APTO 101": "R$ 177.000,00",
            "APTO 105": "R$ 177.000,00",
            "APTO 110": "R$ 194.000,00"
        }
    },
    
    4: { // Laranjal
        name: "LARANJAL - RUA JUSSARA, 178",
        units: [
            { code: "CS BASE", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "CS 05", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "CS 10", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "CS 01", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "CS 06", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "CS 11", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "CS 02", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "CS 07", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "CS 12", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "CS 03", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "CS 08", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "CS 13", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "CS 04", price: 150000, bedrooms: 1, status: "reservado" },
            { code: "CS 09", price: 150000, bedrooms: 1, status: "disponivel" },
            { code: "CS 14", price: 150000, bedrooms: 1, status: "disponivel" }
        ],
        engineeringValues: {
            "Cs 6": "R$ 167.000,00",
            "Cs 7": "R$ 150.000,00",
            "Cs 4": "R$ 190.000,00"
        }
    },
    
    5: { // Apolo - PDF: Cs 9 Eduardo (reservado amarelo), casa 04 assinado
        name: "APOLO - RUA MARIA JOSÉ ARRUDA BARBOSA LT 02 QD 18 - ITABORAÍ",
        units: [
            { code: "casa base", price: 135000, bedrooms: 1, status: "assinado" },
            { code: "casa 05", price: 130000, bedrooms: 1, status: "reservado" },
            { code: "casa 01", price: 135000, bedrooms: 1, status: "disponivel" },
            { code: "casa 06", price: 145000, bedrooms: 1, status: "reservado" },
            { code: "casa 02", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "casa 07", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "casa 03", price: 145000, bedrooms: 1, status: "reservado" },
            { code: "cassa 08", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "casa 04", price: 140000, bedrooms: 1, status: "assinado" },
            { code: "casa 09", price: 150000, bedrooms: 1, status: "reservado" }
        ],
        engineeringValues: {
            "Cs base": "R$ 181.000,00",
            "Cs 5": "R$ 130.000,00",
            "Cs 1": "R$ 177.714,59",
            "Cs 2": "R$ 140.000,00",
            "Cs 3": "R$ 159.000,00",
            "Cs 6": "R$ 130.000,00",
            "Cs 7": "R$ 140.000,00",
            "Cs 4": "R$ 134.000,00",
            "Cs 9": "R$ 201.000,00"
        }
    },

    6: { // Coelho - PDF: cs base Eduardo Neves; cs 4 Click (não cadastrado) = reservado amarelo
        name: "RESIDENCIAL COELHO - RUA DR LOPES DA CRUZ",
        units: [
            { code: "casa base", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "casa 05", price: 145000, bedrooms: 1, status: "reservado" },
            { code: "casa 01", price: 145000, bedrooms: 1, status: "assinado" },
            { code: "casa 06", price: 150000, bedrooms: 1, status: "assinado" },
            { code: "casa 02", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "casa 07", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "casa 03", price: 150000, bedrooms: 1, status: "assinado" },
            { code: "cassa 08", price: 150000, bedrooms: 1, status: "assinado" },
            { code: "casa 04", price: 160000, bedrooms: 1, status: "assinado" },
            { code: "casa 09", price: 160000, bedrooms: 1, status: "assinado" }
        ],
        engineeringValues: {
            "Cs base": "R$ 165.336,19",
            "Cs 5": "R$ 185.000,00",
            "Cs 1": "R$ 177.145,79",
            "Cs 6": "R$ 197.000,00",
            "Cs 2": "R$ 190.000,00",
            "Cs 7": "R$ 199.100,00",
            "Cs 3": "R$ 190.000,00",
            "Cs 8": "R$ 147.000,00",
            "Cs 9": "R$ 194.000,00"
        }
    },
    
    7: { // Edifício Nova Cidade - APTO 102 e APTO 205 assinados; APTO 110 reservado
        name: "EDIFÍCIO NOVA CIDADE - RUA ALCIO SOUTO, 576",
        units: [
            { code: "APTO 101", price: 160000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 201", price: 165000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 102", price: 165000, bedrooms: 1, status: "assinado" },
            { code: "APTO 202", price: 160000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 103", price: 165000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 203", price: 160000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 104", price: 165000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 204", price: 160000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 105", price: 165000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 205", price: 160000, bedrooms: 1, status: "assinado" },
            { code: "APTO 106", price: 165000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 206", price: 160000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 107", price: 165000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 207", price: 160000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 108", price: 165000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 208", price: 160000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 109", price: 165000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 209", price: 160000, bedrooms: 1, status: "disponivel" },
            { code: "APTO 110", price: 170000, bedrooms: 1, status: "reservado" },
            { code: "APTO 210", price: 165000, bedrooms: 1, status: "disponivel" }
        ],
        engineeringValues: {
            "APTO 101": "R$ 159.923,35",
            "APTO 102": "R$ 193.000,00",
            "APTO 104": "R$ 193.000,00",
            "APTO 110": "R$ 162.000,00",
            "APTO 202": "R$ 167.000,00",
            "APTO 205": "R$ 160.000,00",
            "APTO 207": "R$ 152.000,00",
            "APTO 210": "R$ 167.000,00"
        }
    },

    /** Casa Luxo Maricá — empreendimento com uma única unidade (alto padrão) */
    8: {
        name: "CASA LUXO MARICÁ - CONDOMÍNIO ELISA BEACH",
        units: [
            { code: "Casa única", price: 1180000, bedrooms: 3, status: "disponivel" }
        ]
    }
};

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
        }
        reconcileAuthoritativeUnitStatuses();
        pushReconcileStatusesToServerIfAdmin();
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
    var i, item, raw, units, j, u;
    for (i = 0; i < INVENTORY_STATUS_RECONCILE.length; i++) {
        item = INVENTORY_STATUS_RECONCILE[i];
        raw = propertyUnits[item.propertyId];
        if (!raw || !raw.units) continue;
        units = raw.units;
        for (j = 0; j < units.length; j++) {
            u = units[j];
            if (u.code === item.unitCode) {
                items.push({ propertyId: item.propertyId, unitCode: item.unitCode, status: u.status });
                break;
            }
        }
    }
    if (!items.length) return;
    var url = getCloudFunctionsBaseUrlUnits() + '/adminSetUnitStatusOverrides';
    var postPayload = { items: items };
    var doPost = function(headers, payload) {
        fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload),
        }).catch(function() {});
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
    postPayload.adminEmail = creds.email;
    postPayload.adminPassword = creds.password;
    doPost({ 'Content-Type': 'application/json' }, postPayload);
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
    var url = getCloudFunctionsBaseUrlUnits() + '/adminSetUnitStatusOverrides';
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

/** Empreendimentos excluídos do cadastro de vendas (Porto Novo oculto). */
var SALES_EXCLUDED_PROPERTY_IDS = { 1: true };

function getPropertyUnitsRaw(propertyId) {
    if (propertyId == null || propertyId === '') return null;
    if (SALES_EXCLUDED_PROPERTY_IDS[Number(propertyId)]) return null;
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
    reconcileAuthoritativeUnitStatuses();
}

function getCloudFunctionsBaseUrlUnits() {
    if (typeof CONFIG !== 'undefined' && CONFIG.cloudFunctions && CONFIG.cloudFunctions.baseURL) {
        return CONFIG.cloudFunctions.baseURL;
    }
    return 'https://us-central1-site-interativo-b-f-marques.cloudfunctions.net';
}

function fetchUnitStatusOverridesFromServer(done) {
    var url = getCloudFunctionsBaseUrlUnits() + '/getPublicUnitOverrides?_=';
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
    if (Object.keys(overrides).length === 0) return data;
    return {
        name: data.name,
        units: data.units.map(function(u) {
            if (isAuthoritativeInventoryUnit(propertyId, u.code)) {
                return { code: u.code, price: u.price, bedrooms: u.bedrooms, status: u.status };
            }
            var st = overrides[u.code] || u.status;
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
    const propertyData = getPropertyUnits(propertyId);
    if (!propertyData) return;
    
    const unit = propertyData.units.find(u => u.code === unitCode);
    if (!unit) return;
    
    if (unit.status !== 'disponivel') {
        showMessage(`Esta unidade está ${getUnitStatusText(unit.status).toLowerCase()}.`, 'warning');
        return;
    }
    
    // Store selected unit for reservation
    sessionStorage.setItem('selectedUnit', JSON.stringify({
        propertyId: propertyId,
        unitCode: unitCode,
        price: unit.price,
        bedrooms: unit.bedrooms
    }));
    
    // Start reservation process for this specific unit
    reservePropertyUnit(propertyId, unitCode);
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
    
    const property = properties.find(p => p.id === propertyId);
    const selectedUnit = JSON.parse(sessionStorage.getItem('selectedUnit'));
    
    if (!property || !selectedUnit) {
        showMessage('Erro ao processar reserva da unidade.', 'error');
        return;
    }
    
    // Show reservation form with unit details
    showUnitReservationForm(property, selectedUnit);
}

// Show unit reservation form
function showUnitReservationForm(property, selectedUnit) {
    const modal = document.getElementById('propertyModal');
    const detailsContainer = document.getElementById('propertyDetails');
    
    const reservation = {
        id: generateReservationId(),
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
    const form = document.getElementById('unitReservationForm');
    form.addEventListener('submit', (e) => handleUnitReservationSubmission(e, property, selectedUnit, reservation));
    
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

