/**
 * API de reservas (Firestore via Cloud Functions).
 */
var RESERVATION_BUSINESS_DAYS = (typeof CONFIG !== 'undefined' && CONFIG.reservations && CONFIG.reservations.businessDays)
    ? CONFIG.reservations.businessDays
    : 3;

function getReservationFunctionsBase() {
    if (typeof getCloudFunctionsBaseUrl === 'function') return getCloudFunctionsBaseUrl();
    if (typeof ApiClient !== 'undefined' && ApiClient.getBaseUrl) return ApiClient.getBaseUrl();
    if (typeof CONFIG !== 'undefined' && CONFIG.cloudFunctions && CONFIG.cloudFunctions.baseURL) {
        return CONFIG.cloudFunctions.baseURL;
    }
    return '';
}

function getBrokerIdToken() {
    if (typeof ensureBrokerFirebaseSession === 'function') {
        return ensureBrokerFirebaseSession();
    }
    return new Promise(function(resolve) {
        if (typeof getFirebaseAuth !== 'function') {
            resolve(null);
            return;
        }
        var auth = getFirebaseAuth();
        if (!auth || !auth.currentUser) {
            resolve(null);
            return;
        }
        auth.currentUser.getIdToken().then(resolve).catch(function() { resolve(null); });
    });
}

function reservationPostJson(path, payload) {
    return getBrokerIdToken().then(function(token) {
        if (!token) {
            return Promise.reject(new Error('Faça login como corretor para continuar.'));
        }
        var headers = {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        };
        return fetch(getReservationFunctionsBase() + path, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload || {}),
            cache: 'no-store',
            credentials: 'omit'
        }).then(function(res) {
            return res.text().then(function(txt) {
                var data = null;
                try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
                if (!res.ok) {
                    throw new Error((data && data.error) ? data.error : ('Erro ' + res.status));
                }
                return data || { ok: true };
            });
        });
    });
}

function reservationFetchMy() {
    return getBrokerIdToken().then(function(token) {
        if (!token) return { ok: true, reservations: [] };
        var headers = { 'Authorization': 'Bearer ' + token };
        return fetch(getReservationFunctionsBase() + '/brokerMyReservations', {
            method: 'GET',
            headers: headers,
            cache: 'no-store',
            credentials: 'omit'
        }).then(function(res) {
            return res.text().then(function(txt) {
                var data = null;
                try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
                if (!res.ok) return { ok: false, reservations: [] };
                return data || { ok: true, reservations: [] };
            });
        }).catch(function() {
            return { ok: false, reservations: [] };
        });
    });
}

/** Espelha servidor: fim do N-ésimo dia útil (seg–sex). */
function previewReservationExpiry(fromDate, businessDays) {
    var days = businessDays != null ? businessDays : RESERVATION_BUSINESS_DAYS;
    var d = new Date((fromDate || new Date()).getTime());
    var remaining = days;
    while (remaining > 0) {
        var dow = d.getDay();
        if (dow !== 0 && dow !== 6) remaining--;
        if (remaining > 0) d.setDate(d.getDate() + 1);
    }
    d.setHours(23, 59, 59, 999);
    return d;
}

function reservationStatusLabel(status) {
    var map = {
        pending: 'Pendente',
        active: 'Ativa',
        expired: 'Expirada',
        cancelled: 'Cancelada',
        rejected: 'Rejeitada',
        converted: 'Convertida em venda',
        signed: 'Assinado'
    };
    return map[status] || status;
}

function normalizeReservationRow(row) {
    if (!row) return row;
    var client = row.client || row.clientInfo || {};
    return {
        id: row.id,
        firestoreId: row.id,
        legacyId: row.legacyId || '',
        propertyId: row.propertyId,
        propertyTitle: row.propertyTitle || '',
        unitCode: row.unitCode || '',
        unitPrice: row.unitPrice,
        brokerId: row.brokerId,
        brokerName: row.brokerName,
        brokerEmail: row.brokerEmail,
        brokerPhone: row.brokerPhone,
        clientInfo: {
            name: client.name || '',
            email: client.email || '',
            phone: client.phone || '',
            cpf: client.cpf || '',
            notes: client.notes || ''
        },
        requestedAt: row.requestedAt || row.createdAt,
        createdAt: row.requestedAt || row.createdAt,
        approvedAt: row.approvedAt,
        expiresAt: row.expiresAt,
        status: row.status,
        source: row.source || '',
        rejectionReason: row.rejectionReason || '',
        renewalDue: !!row.renewalDue,
        renewalDueAt: row.renewalDueAt || ''
    };
}

function reservationDisplayStatus(row) {
    if (!row) return '';
    if (row.status === 'active' && row.renewalDue) return 'Aguardando decisão';
    return reservationStatusLabel(row.status);
}

if (typeof window !== 'undefined') {
    window.RESERVATION_BUSINESS_DAYS = RESERVATION_BUSINESS_DAYS;
    window.getReservationFunctionsBase = getReservationFunctionsBase;
    window.getBrokerIdToken = getBrokerIdToken;
    window.reservationPostJson = reservationPostJson;
    window.reservationFetchMy = reservationFetchMy;
        window.previewReservationExpiry = previewReservationExpiry;
    window.reservationStatusLabel = reservationStatusLabel;
    window.reservationDisplayStatus = reservationDisplayStatus;
    window.normalizeReservationRow = normalizeReservationRow;
}
