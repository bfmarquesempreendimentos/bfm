/**
 * Cliente HTTP único para Cloud Functions (IE11-safe)
 */
(function(global) {
    var DEFAULT_BASE = 'https://us-central1-site-interativo-b-f-marques.cloudfunctions.net';

    function getBaseUrl() {
        if (typeof CONFIG !== 'undefined' && CONFIG.cloudFunctions && CONFIG.cloudFunctions.baseURL) {
            return CONFIG.cloudFunctions.baseURL;
        }
        return DEFAULT_BASE;
    }

    function parseJsonSafe(txt) {
        if (!txt || !String(txt).trim()) return null;
        try {
            return JSON.parse(txt);
        } catch (e) {
            return null;
        }
    }

    function request(path, options) {
        options = options || {};
        var method = options.method || 'GET';
        var base = getBaseUrl();
        var url = base + path;
        if (method === 'GET' && options.cacheBust !== false) {
            url += (url.indexOf('?') >= 0 ? '&' : '?') + '_=' + Date.now();
        }
        var headers = {};
        if (method !== 'GET') headers['Content-Type'] = 'application/json';
        if (options.headers) {
            var hk;
            for (hk in options.headers) {
                if (options.headers.hasOwnProperty(hk)) headers[hk] = options.headers[hk];
            }
        }
        var fetchOpts = {
            method: method,
            headers: headers,
            cache: 'no-store',
            credentials: 'omit'
        };
        if (options.body != null && method !== 'GET') {
            fetchOpts.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
        }
        var timeoutMs = options.timeoutMs || 180000;
        return new Promise(function(resolve, reject) {
            var done = false;
            var timer = setTimeout(function() {
                if (done) return;
                done = true;
                reject(new Error('Tempo esgotado. Tente novamente.'));
            }, timeoutMs);
            fetch(url, fetchOpts).then(function(res) {
                return res.text().then(function(txt) {
                    if (done) return;
                    done = true;
                    clearTimeout(timer);
                    var data = parseJsonSafe(txt);
                    if (!res.ok) {
                        var errMsg = (data && data.error) ? data.error : ('Erro ' + res.status);
                        reject(new Error(errMsg));
                        return;
                    }
                    resolve(data != null ? data : { success: true });
                });
            }).catch(function(err) {
                if (done) return;
                done = true;
                clearTimeout(timer);
                reject(err);
            });
        });
    }

    function get(path) {
        return request(path, { method: 'GET' });
    }

    function post(path, payload, extra) {
        extra = extra || {};
        return request(path, {
            method: 'POST',
            body: payload || {},
            timeoutMs: extra.timeoutMs
        });
    }

    global.ApiClient = {
        getBaseUrl: getBaseUrl,
        get: get,
        post: post,
        request: request
    };
})(typeof window !== 'undefined' ? window : this);
