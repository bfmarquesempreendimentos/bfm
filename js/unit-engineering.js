/**
 * Engenharia vigente (só valores com laudo dentro de 6 meses).
 * Valores antigos do catálogo não entram na vitrine nem no WhatsApp.
 */
(function() {
    var _valid = null;
    var _prices = null;
    var _at = 0;
    var CACHE_MS = 60000;

    function functionsBase() {
        if (typeof getCloudFunctionsBaseUrl === 'function') return getCloudFunctionsBaseUrl();
        if (typeof CONFIG !== 'undefined' && CONFIG.cloudFunctions && CONFIG.cloudFunctions.baseURL) {
            return CONFIG.cloudFunctions.baseURL;
        }
        return '';
    }

    function fetchValidEngineering() {
        if (_valid && Date.now() - _at < CACHE_MS) return Promise.resolve(_valid);
        var base = functionsBase();
        if (!base) {
            _valid = {};
            _prices = {};
            _at = Date.now();
            return Promise.resolve(_valid);
        }
        return fetch(base + '/adminUnitEngineering', { method: 'GET', cache: 'no-store', credentials: 'omit' })
            .then(function(res) { return res.ok ? res.json() : { valid: {}, prices: {} }; })
            .then(function(data) {
                _valid = (data && data.valid) ? data.valid : {};
                _prices = (data && data.prices) ? data.prices : {};
                _at = Date.now();
                return _valid;
            })
            .catch(function() {
                _valid = _valid || {};
                _prices = _prices || {};
                _at = Date.now();
                return _valid;
            });
    }

    function normAlnum(s) {
        return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    function lookupValidValue(propertyId, unitCode) {
        if (!_valid || !propertyId || !unitCode) return '';
        var map = _valid[String(propertyId)] || {};
        if (map[unitCode] && map[unitCode].value) return map[unitCode].value;
        var target = normAlnum(unitCode);
        var keys = Object.keys(map);
        var i;
        for (i = 0; i < keys.length; i++) {
            if (normAlnum(keys[i]) === target && map[keys[i]] && map[keys[i]].value) {
                return map[keys[i]].value;
            }
        }
        return '';
    }

    function displayEngineering(propertyId, unitCode) {
        return lookupValidValue(propertyId, unitCode) || 'A confirmar';
    }

    function lookupSalePrice(propertyId, unitCode) {
        if (!_prices || !propertyId || !unitCode) return '';
        var map = _prices[String(propertyId)] || {};
        if (map[unitCode] != null && map[unitCode] !== '') return map[unitCode];
        var target = normAlnum(unitCode);
        var keys = Object.keys(map);
        var i;
        for (i = 0; i < keys.length; i++) {
            if (normAlnum(keys[i]) === target && map[keys[i]] != null && map[keys[i]] !== '') {
                return map[keys[i]];
            }
        }
        return '';
    }

    function invalidateEngineeringCache() {
        _valid = null;
        _prices = null;
        _at = 0;
    }

    if (typeof window !== 'undefined') {
        window.fetchValidEngineering = fetchValidEngineering;
        window.lookupValidEngineeringValue = lookupValidValue;
        window.displayEngineeringValue = displayEngineering;
        window.lookupCadastroSalePrice = lookupSalePrice;
        window.invalidateEngineeringCache = invalidateEngineeringCache;
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() { fetchValidEngineering(); });
        } else {
            fetchValidEngineering();
        }
    }
})();
