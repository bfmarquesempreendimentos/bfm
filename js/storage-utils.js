/**
 * Utilitários seguros para localStorage - evita erros de JSON.parse com dados corrompidos
 * e permite reparo de dados presos.
 */
(function() {
    'use strict';

    function safeParseJSON(key, defaultValue) {
        if (typeof localStorage === 'undefined') return defaultValue;
        try {
            var raw = localStorage.getItem(key);
            if (raw === null || raw === undefined || raw === '') return defaultValue;
            var parsed = JSON.parse(raw);
            return parsed;
        } catch (e) {
            console.warn('storage-utils: JSON corrompido em', key, '- usando valor padrão:', e.message);
            return defaultValue;
        }
    }

    function safeGetArray(key) {
        var val = safeParseJSON(key, []);
        return Array.isArray(val) ? val : [];
    }

    function safeGetObject(key) {
        var val = safeParseJSON(key, {});
        return val && typeof val === 'object' && !Array.isArray(val) ? val : {};
    }

    /** Repara/limpa dados corrompidos no localStorage. Remove chaves que causam parse error. */
    function repairLocalStorage() {
        var keys = ['repairRequests', 'propertySales', 'clients', 'brokers', 'reservations', 'properties', 'notifications', 'adminNotifications', 'documentAccesses', 'emailHistory', 'propertyDocuments'];
        var repaired = 0;
        keys.forEach(function(key) {
            try {
                var raw = localStorage.getItem(key);
                if (!raw) return;
                JSON.parse(raw);
            } catch (e) {
                console.warn('storage-utils: Removendo', key, 'corrompido');
                localStorage.removeItem(key);
                repaired++;
            }
        });
        return repaired;
    }

    /** Força repairRequests a vir só do servidor (limpa local preso). Usado no Admin. */
    function clearRepairRequestsLocal() {
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('repairRequests');
        }
    }

    if (typeof window !== 'undefined') {
        window.safeParseJSON = safeParseJSON;
        window.safeGetArray = safeGetArray;
        window.safeGetObject = safeGetObject;
        window.repairLocalStorage = repairLocalStorage;
        window.clearRepairRequestsLocal = clearRepairRequestsLocal;
    }
})();
