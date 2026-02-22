// Visitor tracking system - saves page visits to Firestore
(function() {
    'use strict';

    const COLLECTION = 'site_visits';
    const VISITOR_KEY = 'bfm_visitor_id';
    const SESSION_KEY = 'bfm_session_id';
    const LAST_TRACK_KEY = 'bfm_last_track';
    const MIN_INTERVAL_MS = 5000;

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    function getVisitorId() {
        let id = localStorage.getItem(VISITOR_KEY);
        if (!id) {
            id = 'v_' + generateId();
            localStorage.setItem(VISITOR_KEY, id);
        }
        return id;
    }

    function getSessionId() {
        let id = sessionStorage.getItem(SESSION_KEY);
        if (!id) {
            id = 's_' + generateId();
            sessionStorage.setItem(SESSION_KEY, id);
        }
        return id;
    }

    function parseUserAgent(ua) {
        let device = 'desktop';
        if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) {
            device = /iPad|Tablet/i.test(ua) ? 'tablet' : 'mobile';
        }

        let browser = 'Outro';
        if (/Edg\//i.test(ua)) browser = 'Edge';
        else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = 'Opera';
        else if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) browser = 'Chrome';
        else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
        else if (/Firefox/i.test(ua)) browser = 'Firefox';

        let os = 'Outro';
        if (/Windows/i.test(ua)) os = 'Windows';
        else if (/Macintosh|Mac OS/i.test(ua)) os = 'macOS';
        else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
        else if (/Android/i.test(ua)) os = 'Android';
        else if (/Linux/i.test(ua)) os = 'Linux';

        return { device, browser, os };
    }

    function getPageName() {
        const path = window.location.pathname;
        const file = path.split('/').pop() || 'index.html';
        const names = {
            'index.html': 'Página Inicial',
            '': 'Página Inicial',
            'calculadora.html': 'Calculadora dos Sonhos',
            'contato.html': 'Fale Conosco',
            'mcmv.html': 'MCMV',
            'client-area.html': 'Área do Cliente',
            'admin.html': 'Admin',
            'admin-login.html': 'Login Admin'
        };
        return names[file] || file;
    }

    function trackVisit() {
        if (typeof firebase === 'undefined' || !firebase.firestore) return;

        const now = Date.now();
        const last = parseInt(sessionStorage.getItem(LAST_TRACK_KEY) || '0', 10);
        if (now - last < MIN_INTERVAL_MS) return;
        sessionStorage.setItem(LAST_TRACK_KEY, now.toString());

        const ua = navigator.userAgent;
        const parsed = parseUserAgent(ua);

        const data = {
            visitorId: getVisitorId(),
            sessionId: getSessionId(),
            page: window.location.pathname.split('/').pop() || 'index.html',
            pageName: getPageName(),
            referrer: document.referrer || '',
            userAgent: ua.substring(0, 300),
            device: parsed.device,
            browser: parsed.browser,
            os: parsed.os,
            screenWidth: screen.width,
            screenHeight: screen.height,
            language: navigator.language || '',
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            clientTimestamp: new Date().toISOString()
        };

        const db = firebase.firestore();
        db.collection(COLLECTION).add(data).catch(function() {});
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(trackVisit, 500);
    } else {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(trackVisit, 500);
        });
    }
})();
