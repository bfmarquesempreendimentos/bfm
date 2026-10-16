/**
 * Registro de token FCM (Web Push) para admin, corretor e cliente.
 * Pede permissão com um aviso na tela (não dispara o diálogo nativo imediatamente).
 */
(function() {
    var _fcmRegistered = false;
    var _fcmBannerShown = false;
    var _onMessageBound = false;
    var DISMISS_KEY = 'fcmPromptDismissed';

    function getAppBasePath() {
        var p = window.location.pathname || '';
        if (p.indexOf('/bfm/') === 0 || p === '/bfm') return '/bfm';
        return '';
    }

    function getFcmVapidKey() {
        if (typeof CONFIG !== 'undefined' && CONFIG.fcm && CONFIG.fcm.vapidKey) {
            return CONFIG.fcm.vapidKey;
        }
        return '';
    }

    function getFunctionsBase() {
        if (typeof getCloudFunctionsBaseUrl === 'function') return getCloudFunctionsBaseUrl();
        if (typeof CONFIG !== 'undefined' && CONFIG.cloudFunctions && CONFIG.cloudFunctions.baseURL) {
            return CONFIG.cloudFunctions.baseURL;
        }
        return '';
    }

    function promptCopy(roleHint) {
        if (roleHint === 'admin') {
            return 'Ativar avisos neste aparelho? Você recebe novos chamados, comprovantes e reservas.';
        }
        if (roleHint === 'broker') {
            return 'Ativar avisos neste aparelho? Você recebe aprovação, prazo e status das reservas.';
        }
        return 'Ativar avisos neste aparelho? Você recebe novidades de reparo, boletos e do seu imóvel.';
    }

    function getAuthTokenForFcm(roleHint) {
        return new Promise(function(resolve) {
            if (roleHint === 'admin' && typeof getAdminIdToken === 'function') {
                getAdminIdToken().then(resolve).catch(function() { resolve(null); });
                return;
            }
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

    function postFcmToken(token, roleHint) {
        return getAuthTokenForFcm(roleHint).then(function(idToken) {
            if (!idToken) return null;
            return fetch(getFunctionsBase() + '/registerFcmToken', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + idToken
                },
                body: JSON.stringify({ token: token, role: roleHint || 'client', platform: 'web' }),
                cache: 'no-store',
                credentials: 'omit'
            }).then(function(r) { return r.json().catch(function() { return null; }); });
        });
    }

    function bindForegroundMessages() {
        if (_onMessageBound || typeof firebase === 'undefined' || !firebase.messaging) return;
        _onMessageBound = true;
        try {
            firebase.messaging().onMessage(function(payload) {
                var n = (payload && payload.notification) || {};
                var data = (payload && payload.data) || {};
                var title = n.title || 'B F Marques';
                var body = n.body || '';
                if (typeof showMessage === 'function') {
                    showMessage(title + (body ? ': ' + body : ''), 'info');
                }
                if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
                try {
                    var note = new Notification(title, { body: body, data: data });
                    note.onclick = function() {
                        window.focus();
                        if (data.link) window.location.href = data.link;
                    };
                } catch (eNote) { /* Safari / permissão */ }
            });
        } catch (eBind) { /* messaging ainda não pronto */ }
    }

    function hideBanner() {
        var el = document.getElementById('fcmPushBanner');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    function showBanner(roleHint) {
        if (_fcmBannerShown || document.getElementById('fcmPushBanner')) return;
        _fcmBannerShown = true;
        var el = document.createElement('div');
        el.id = 'fcmPushBanner';
        el.className = 'fcm-push-banner';
        el.setAttribute('role', 'dialog');
        el.innerHTML = '<p>' + promptCopy(roleHint) + '</p>' +
            '<div class="fcm-push-actions">' +
            '<button type="button" class="btn btn-primary btn-sm" data-fcm="yes">Ativar avisos</button>' +
            '<button type="button" class="btn btn-secondary btn-sm" data-fcm="no">Agora não</button>' +
            '</div>';
        document.body.appendChild(el);
        el.addEventListener('click', function(ev) {
            var btn = ev.target && ev.target.closest ? ev.target.closest('[data-fcm]') : null;
            if (!btn) return;
            if (btn.getAttribute('data-fcm') === 'no') {
                try { localStorage.setItem(DISMISS_KEY, '1'); } catch (eD) { /* ignore */ }
                hideBanner();
                return;
            }
            hideBanner();
            registerWithPermission(roleHint);
        });
    }

    function registerWithPermission(roleHint, attempt) {
        if (_fcmRegistered) return Promise.resolve(true);
        if (typeof firebase === 'undefined' || !firebase.messaging) return Promise.resolve(false);
        if (!('Notification' in window) || !('serviceWorker' in navigator)) return Promise.resolve(false);
        var vapidKey = getFcmVapidKey();
        if (!vapidKey) return Promise.resolve(false);

        var n = attempt || 0;
        var base = getAppBasePath();
        var swUrl = (base || '') + '/firebase-messaging-sw.js';

        return Notification.requestPermission().then(function(perm) {
            if (perm !== 'granted') return false;
            bindForegroundMessages();
            return navigator.serviceWorker.register(swUrl).then(function(reg) {
                return firebase.messaging().getToken({ vapidKey: vapidKey, serviceWorkerRegistration: reg });
            }).then(function(token) {
                if (!token) return false;
                return postFcmToken(token, roleHint).then(function(res) {
                    if (res && res.ok) {
                        _fcmRegistered = true;
                        return true;
                    }
                    if (n < 5) {
                        return new Promise(function(resolve) {
                            setTimeout(function() {
                                registerWithPermission(roleHint, n + 1).then(resolve);
                            }, 1500);
                        });
                    }
                    return false;
                });
            });
        }).catch(function() {
            return false;
        });
    }

    function initFcmPush(roleHint) {
        if (_fcmRegistered) return Promise.resolve(true);
        if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
            return Promise.resolve(false);
        }
        if (Notification.permission === 'denied') return Promise.resolve(false);
        if (Notification.permission === 'granted') {
            bindForegroundMessages();
            return registerWithPermission(roleHint);
        }
        try {
            if (localStorage.getItem(DISMISS_KEY) === '1') return Promise.resolve(false);
        } catch (eLs) { /* ignore */ }
        if (document.body) showBanner(roleHint);
        else document.addEventListener('DOMContentLoaded', function() { showBanner(roleHint); });
        return Promise.resolve(false);
    }

    if (typeof window !== 'undefined') {
        window.initFcmPush = initFcmPush;
    }
})();
