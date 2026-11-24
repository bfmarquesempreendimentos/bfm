/**
 * Carrega scripts pesados do admin só quando a seção precisa (menos trava na navegação).
 */
(function() {
    var _loads = {};

    function adminLoadScriptOnce(src) {
        if (_loads[src]) return _loads[src];
        _loads[src] = new Promise(function(resolve, reject) {
            var existing = document.querySelector('script[data-admin-lazy="' + src + '"]');
            if (existing) {
                if (existing.getAttribute('data-loaded') === '1') return resolve();
                existing.addEventListener('load', function() { resolve(); });
                existing.addEventListener('error', reject);
                return;
            }
            var s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.setAttribute('data-admin-lazy', src);
            s.onload = function() {
                s.setAttribute('data-loaded', '1');
                resolve();
            };
            s.onerror = reject;
            document.body.appendChild(s);
        });
        return _loads[src];
    }

    var CHART_CDN = 'https://cdn.jsdelivr.net/npm/chart.js';
    var JSPDF_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

    function adminEnsureChartJs() {
        if (typeof Chart !== 'undefined') return Promise.resolve();
        return adminLoadScriptOnce(CHART_CDN);
    }

    function adminEnsureJsPdf() {
        if (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
        return adminLoadScriptOnce(JSPDF_CDN);
    }

    function adminEnsureDashboardCharts() {
        return adminEnsureChartJs().then(function() {
            return adminLoadScriptOnce('js/admin-dashboard-charts.js?v=3');
        });
    }

    function adminEnsureAnalyticsModule() {
        return adminEnsureDashboardCharts().then(function() {
            return adminLoadScriptOnce('js/admin-analytics.js?v=36');
        });
    }

    function adminEnsureFinanceModule() {
        return adminLoadScriptOnce('js/admin-finance.js?v=2');
    }

    function adminEnsureReportsModule() {
        return adminEnsureDashboardCharts()
            .then(function() { return adminLoadScriptOnce('js/admin-reports.js?v=5'); })
            .then(function() { return adminLoadScriptOnce('js/admin-broker-reservations-report.js?v=4'); })
            .then(function() { return adminLoadScriptOnce('js/admin-unit-engineering.js?v=29'); });
    }

    function adminEnsureEngineeringModule() {
        return adminLoadScriptOnce('js/admin-unit-engineering.js?v=29');
    }

    function adminEnsureRepairsModule() {
        return adminLoadScriptOnce('js/admin-repairs.js?v=37');
    }

    /** Renderiza linhas grandes em fatias (evita congelar o main thread). */
    function adminRenderHtmlChunks(tbody, htmlRows, chunkSize) {
        if (!tbody || !htmlRows || !htmlRows.length) return;
        chunkSize = chunkSize || 35;
        if (htmlRows.length <= chunkSize) {
            tbody.innerHTML = htmlRows.join('');
            return;
        }
        tbody.innerHTML = '';
        var i = 0;
        function pump() {
            var end = Math.min(i + chunkSize, htmlRows.length);
            var html = '';
            for (; i < end; i++) html += htmlRows[i];
            tbody.insertAdjacentHTML('beforeend', html);
            if (i < htmlRows.length) {
                if (typeof requestAnimationFrame === 'function') requestAnimationFrame(pump);
                else setTimeout(pump, 0);
            }
        }
        pump();
    }

    window.adminLoadScriptOnce = adminLoadScriptOnce;
    window.adminEnsureChartJs = adminEnsureChartJs;
    window.adminEnsureJsPdf = adminEnsureJsPdf;
    window.adminEnsureDashboardCharts = adminEnsureDashboardCharts;
    window.adminEnsureAnalyticsModule = adminEnsureAnalyticsModule;
    window.adminEnsureFinanceModule = adminEnsureFinanceModule;
    window.adminEnsureReportsModule = adminEnsureReportsModule;
    window.adminEnsureEngineeringModule = adminEnsureEngineeringModule;
    window.adminEnsureRepairsModule = adminEnsureRepairsModule;
    window.adminRenderHtmlChunks = adminRenderHtmlChunks;
})();