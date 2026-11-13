/**
 * Engenharia vigente (só valores com laudo dentro de 6 meses).
 * Valores antigos do catálogo não entram na vitrine nem no WhatsApp.
 * Carrega primeiro o snapshot estático (Storage / data/), depois a função nos EUA.
 */
(function() {
    var _valid = null;
    var _prices = null;
    var _at = 0;
    var CACHE_MS = 3 * 60 * 1000;

    function functionsBase() {
        if (typeof getCloudFunctionsBaseUrl === 'function') return getCloudFunctionsBaseUrl();
        if (typeof CONFIG !== 'undefined' && CONFIG.cloudFunctions && CONFIG.cloudFunctions.baseURL) {
            return CONFIG.cloudFunctions.baseURL;
        }
        return '';
    }

    function cacheBust() {
        var ver = (typeof CONFIG !== 'undefined' && CONFIG.assetVersion)
            ? String(CONFIG.assetVersion)
            : '';
        return ver ? ('?v=' + encodeURIComponent(ver)) : ('?t=' + Math.floor(Date.now() / 300000));
    }

    function applyEngineeringPayload(data) {
        _valid = (data && data.valid) ? data.valid : {};
        _prices = (data && data.prices) ? data.prices : {};
        _at = Date.now();
        if (typeof refreshEngineeringValuesDisplay === 'function') {
            refreshEngineeringValuesDisplay();
        }
        return _valid;
    }

    function snapshotUrls() {
        var urls = [];
        var eng = (typeof CONFIG !== 'undefined' && CONFIG.engineering) ? CONFIG.engineering : null;
        if (eng && eng.snapshotStorageUrl) {
            urls.push(String(eng.snapshotStorageUrl));
        }
        var basePath = '';
        try {
            basePath = window.location.pathname.replace(/\/[^/]*$/, '') || '';
        } catch (e) { /* ignore */ }
        var fallback = (eng && eng.staticFallbackPath) ? String(eng.staticFallbackPath) : 'data/valid-engineering.json';
        if (fallback.indexOf('http') === 0) {
            urls.push(fallback + cacheBust());
        } else {
            urls.push((basePath ? basePath + '/' : '') + fallback + cacheBust());
        }
        return urls;
    }

    function tryFetchSnapshot(urls, index) {
        index = index || 0;
        if (!urls || index >= urls.length) return Promise.resolve(null);
        var url = urls[index];
        return fetch(url, { credentials: 'omit', cache: 'default' })
            .then(function(res) {
                if (!res.ok) return tryFetchSnapshot(urls, index + 1);
                return res.json().then(function(data) {
                    if (data && (data.valid || data.prices)) return data;
                    return tryFetchSnapshot(urls, index + 1);
                });
            })
            .catch(function() {
                return tryFetchSnapshot(urls, index + 1);
            });
    }

    function fetchFromCloudFunction() {
        var base = functionsBase();
        if (!base) return Promise.resolve(null);
        return fetch(base + '/adminUnitEngineering', { method: 'GET', credentials: 'omit' })
            .then(function(res) { return res.ok ? res.json() : null; })
            .catch(function() { return null; });
    }

    function fetchValidEngineering() {
        if (_valid && Date.now() - _at < CACHE_MS) return Promise.resolve(_valid);

        return tryFetchSnapshot(snapshotUrls())
            .then(function(snapshot) {
                if (snapshot) return applyEngineeringPayload(snapshot);
                return fetchFromCloudFunction().then(function(data) {
                    if (data) return applyEngineeringPayload(data);
                    _valid = _valid || {};
                    _prices = _prices || {};
                    _at = Date.now();
                    return _valid;
                });
            })
            .catch(function() {
                return fetchFromCloudFunction().then(function(data) {
                    if (data) return applyEngineeringPayload(data);
                    _valid = _valid || {};
                    _prices = _prices || {};
                    _at = Date.now();
                    return _valid;
                });
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
        var v = lookupValidValue(propertyId, unitCode);
        if (v == null || v === '') return '';
        if (typeof v === 'number' && isFinite(v)) {
            return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        }
        var s = String(v).trim();
        if (!s || /a confirmar/i.test(s)) return '';
        return s;
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
