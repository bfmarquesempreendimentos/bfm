/**
 * Captura parâmetros UTM da URL para atribuição de marketing.
 */
(function() {
    var KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

    function parseUtmFromUrl() {
        var out = {};
        var i;
        try {
            var params = new URL(window.location.href).searchParams;
            for (i = 0; i < KEYS.length; i++) {
                var v = params.get(KEYS[i]);
                if (v) out[KEYS[i]] = v;
            }
        } catch (e) {
            var q = window.location.search || '';
            for (i = 0; i < KEYS.length; i++) {
                var re = new RegExp('[?&]' + KEYS[i] + '=([^&]+)');
                var m = q.match(re);
                if (m && m[1]) out[KEYS[i]] = decodeURIComponent(m[1].replace(/\+/g, ' '));
            }
        }
        return out;
    }

    function saveUtm(data) {
        if (!data || !Object.keys(data).length) return;
        try {
            sessionStorage.setItem('bfm_utm', JSON.stringify(data));
        } catch (e) { /* ignore */ }
    }

    function getStoredUtm() {
        try {
            var raw = sessionStorage.getItem('bfm_utm');
            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            return {};
        }
    }

    function boot() {
        var fromUrl = parseUtmFromUrl();
        if (Object.keys(fromUrl).length) saveUtm(fromUrl);
    }

    if (typeof window !== 'undefined') {
        window.getMarketingUtm = getStoredUtm;
        boot();
    }
})();
