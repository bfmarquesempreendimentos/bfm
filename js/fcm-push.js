/**
 * Registro de token FCM (Web Push) para admin, corretor e cliente.
 */
(function() {
    var _fcmInitAttempted = false;

    function getAppBasePath() {
        var p = window.location.pathname || '';
        if (p.indexOf('/bfm/') === 0) return '/bfm';
        if (p === '/bfm' || p.indexOf('/bfm') === 0) return '/bfm';
        return '';
    }

    function getFcmVapidKey() {
        if (typeof CONFIG !== 'undefined' && CONFIG.fcm && CONFIG.fcm.vapidKey) {
            return CONFIG.fcm.vapidKey;
        }
        return '';
    }

    function getFunctionsBase() {
        if (typeof CONFIG !== 'undefined' && CONFIG.cloudFunctions && CONFIG.cloudFunctions.baseURL) {
            return CONFIG.cloudFunctions.baseURL;
        }
        return 'https://us-central1-site-interativo-b-f-marques.cloudfunctions.net';
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
            var headers = {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + idToken
            };
            return fetch(getFunctionsBase() + '/registerFcmToken', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ token: token, role: roleHint || 'client', platform: 'web' }),
                cache: 'no-store'
            }).then(function(r) { return r.json().catch(function() { return null; }); });
        });
    }

    function initFcmPush(roleHint) {
        if (_fcmInitAttempted) return Promise.resolve(false);
        _fcmInitAttempted = true;
        if (typeof firebase === 'undefined' || !firebase.messaging) return Promise.resolve(false);
        if (!('Notification' in window) || !('serviceWorker' in navigator)) return Promise.resolve(false);
        var vapidKey = getFcmVapidKey();
        if (!vapidKey) return Promise.resolve(false);

        var base = getAppBasePath();
        var swUrl = (base || '') + '/firebase-messaging-sw.js';

        return Notification.requestPermission().then(function(perm) {
            if (perm !== 'granted') return false;
            return navigator.serviceWorker.register(swUrl).then(function(reg) {
                var messaging = firebase.messaging();
                return messaging.getToken({ vapidKey: vapidKey, serviceWorkerRegistration: reg });
            }).then(function(token) {
                if (!token) return false;
                return postFcmToken(token, roleHint).then(function() { return true; });
            });
        }).catch(function() {
            return false;
        });
    }

    if (typeof window !== 'undefined') {
        window.initFcmPush = initFcmPush;
    }
})();
