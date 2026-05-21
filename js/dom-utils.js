/**
 * Utilitários DOM (IE11-safe)
 */
(function(global) {
    function escapeHtml(text) {
        var s = String(text == null ? '' : text);
        return s
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function showAppToast(message, type) {
        if (typeof showMessage === 'function') {
            showMessage(message, type || 'info');
            return;
        }
        if (typeof console !== 'undefined' && console.warn) {
            console.warn('[toast]', type, message);
        }
    }

    global.escapeHtml = escapeHtml;
    global.showAppToast = showAppToast;
})(typeof window !== 'undefined' ? window : this);
