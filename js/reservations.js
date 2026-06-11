// Reservation system — Firestore via Cloud Functions

var reservations = [];
var _adminReservationsCache = [];

function getReservationBusinessDays() {
    if (typeof RESERVATION_BUSINESS_DAYS !== 'undefined') return RESERVATION_BUSINESS_DAYS;
    if (typeof CONFIG !== 'undefined' && CONFIG.reservations && CONFIG.reservations.businessDays) {
        return CONFIG.reservations.businessDays;
    }
    return 3;
}

function reserveProperty(propertyId) {
    if (!isAuthenticated()) {
        showMessage('Você precisa estar logado para fazer uma reserva.', 'error');
        openLoginModal();
        return;
    }
    if (!isBroker()) {
        showMessage('Apenas corretores podem fazer reservas.', 'error');
        return;
    }

    var proceed = function() {
        var property = null;
        var pi;
        for (pi = 0; pi < properties.length; pi++) {
            if (properties[pi].id === propertyId) {
                property = properties[pi];
                break;
            }
        }
        if (!property) {
            showMessage('Imóvel não encontrado.', 'error');
            return;
        }

        var raw = typeof getPropertyUnitsRaw === 'function' ? getPropertyUnitsRaw(propertyId) : null;
        if (raw && raw.units && raw.units.length > 1) {
            showMessage('Selecione a unidade na tabela do empreendimento para reservar.', 'info');
            if (typeof showPropertyDetails === 'function') showPropertyDetails(propertyId);
            return;
        }

        var unitCode = raw && raw.units && raw.units.length === 1 ? raw.units[0].code : '';
        var selectedUnit = raw && raw.units && raw.units.length === 1 ? {
            propertyId: propertyId,
            unitCode: unitCode,
            price: raw.units[0].price,
            bedrooms: raw.units[0].bedrooms
        } : null;

        if (selectedUnit && typeof showUnitReservationForm === 'function') {
            sessionStorage.setItem('selectedUnit', JSON.stringify(selectedUnit));
            showUnitReservationForm(property, selectedUnit);
            return;
        }

        showMessage('Este empreendimento exige seleção de unidade.', 'warning');
    };

    if (typeof ensureBrokerFirebaseSession === 'function') {
        ensureBrokerFirebaseSession().then(proceed).catch(function(err) {
            showMessage(err.message || 'Faça login novamente.', 'error');
            openLoginModal();
        });
        return;
    }
    proceed();
}

function buildReservationFormTermsHtml() {
    var days = getReservationBusinessDays();
    return '' +
        '<li>A reserva tem validade de ' + days + ' dias úteis (segunda a sexta) após aprovação</li>' +
        '<li>Toda solicitação passa pela aprovação do administrador</li>' +
        '<li>Após o vencimento, a unidade só é liberada quando o administrador clicar em Prorrogar ou Liberar</li>' +
        '<li>O corretor é responsável pelas informações do cliente</li>';
}

function submitReservationToServer(payload) {
    if (typeof reservationPostJson !== 'function') {
        return Promise.reject(new Error('API de reservas indisponível.'));
    }
    return reservationPostJson('/brokerCreateReservation', payload).then(function(data) {
        if (data && data.reservation && typeof refreshBrokerReservations === 'function') {
            refreshBrokerReservations();
        }
        return data;
    });
}

function refreshBrokerReservations() {
    if (typeof reservationFetchMy !== 'function') return Promise.resolve([]);
    return reservationFetchMy().then(function(data) {
        var rows = (data && data.reservations) ? data.reservations : [];
        reservations = rows.map(function(r) {
            return typeof normalizeReservationRow === 'function' ? normalizeReservationRow(r) : r;
        });
        return reservations;
    });
}

function getBrokerReservations(brokerId) {
    var targetBrokerId = brokerId || (currentUser ? currentUser.id : null);
    if (!targetBrokerId) return [];
    return reservations.filter(function(r) { return String(r.brokerId) === String(targetBrokerId); });
}

function getActiveReservations() {
    return reservations.filter(function(r) { return r.status === 'active'; });
}

function getPendingReservations() {
    return reservations.filter(function(r) { return r.status === 'pending'; });
}

function getAllReservations() {
    if (typeof window !== 'undefined' && window._adminReservationsCache && window._adminReservationsCache.length) {
        return window._adminReservationsCache;
    }
    return reservations;
}

function generateReservationId() {
    return 'RES' + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase();
}

function isValidCPF(cpf) {
    cpf = cpf.replace(/\D/g, '');
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    var sum = 0;
    var i;
    for (i = 0; i < 9; i++) sum += parseInt(cpf.charAt(i), 10) * (10 - i);
    var checkDigit1 = 11 - (sum % 11);
    if (checkDigit1 > 9) checkDigit1 = 0;
    sum = 0;
    for (i = 0; i < 10; i++) sum += parseInt(cpf.charAt(i), 10) * (11 - i);
    var checkDigit2 = 11 - (sum % 11);
    if (checkDigit2 > 9) checkDigit2 = 0;
    return checkDigit1 === parseInt(cpf.charAt(9), 10) && checkDigit2 === parseInt(cpf.charAt(10), 10);
}

function formatTimeRemaining(expiresAt) {
    var exp = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
    var timeLeft = exp.getTime() - Date.now();
    if (timeLeft <= 0) return 'Expirada';
    var hours = Math.floor(timeLeft / (1000 * 60 * 60));
    var minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 24) {
        var days = Math.floor(hours / 24);
        return days + ' dia(s) restantes';
    }
    if (hours > 0) return hours + 'h ' + minutes + 'm restantes';
    return minutes + 'm restantes';
}

function showBrokerDashboard() {
    refreshBrokerReservations().then(function() {
        var brokerReservations = getBrokerReservations();
        var activeReservations = brokerReservations.filter(function(r) { return r.status === 'active'; });
        var pendingReservations = brokerReservations.filter(function(r) { return r.status === 'pending'; });
        if (activeReservations.length > 0 || pendingReservations.length > 0) {
            var lines = [];
            pendingReservations.forEach(function(r) {
                lines.push('• ' + (r.propertyTitle || 'Imóvel') + (r.unitCode ? ' — ' + r.unitCode : '') + ' — aguardando aprovação');
            });
            activeReservations.forEach(function(r) {
                lines.push('• ' + (r.propertyTitle || 'Imóvel') + (r.unitCode ? ' — ' + r.unitCode : '') + ' — ' + formatTimeRemaining(r.expiresAt));
            });
            showMessage('Suas reservas:\n' + lines.join('\n'), 'success');
        } else {
            showMessage('Você não tem reservas ativas ou pendentes no momento.', 'info');
        }
    });
}

function cancelReservation(reservationId) {
    showMessage('Para cancelar, entre em contato com o administrador.', 'info');
}

function expireReservation() {}

function setupReservationTimer() {}

function checkExpiredReservations() {}

function initializeReservationSystem() {
    if (typeof reservationFetchMy === 'function' && typeof isBroker === 'function' && isBroker()) {
        refreshBrokerReservations();
    }
}

document.addEventListener('DOMContentLoaded', function() {
    initializeReservationSystem();
});
