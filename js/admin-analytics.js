// Admin Analytics - reads site_visits from Firestore and displays charts/tables
(function() {
    'use strict';

    let allVisits = [];
    let visitsChart = null;
    let devicesChart = null;
    let browsersChart = null;
    var _peopleFilter = 'identified';
    var _peopleSort = 'visits';
    var _peopleDir = 'desc';
    var _peopleQuery = '';
    var _peopleUiBound = false;

    function startOfDay(date) {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function formatDate(date) {
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    }

    function formatDateTime(date) {
        return date.toLocaleDateString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }

    window.loadAnalytics = async function() {
        if (typeof adminFetchJson !== 'function') {
            document.getElementById('analyticsContent').innerHTML =
                '<p style="text-align:center;color:#999;padding:40px;">Sessão admin indisponível.</p>';
            return;
        }

        try {
            const payload = await adminFetchJson('/adminSiteVisits?days=30');
            const list = (payload && payload.visits) ? payload.visits : [];

            allVisits = [];
            list.forEach(function(data) {
                let ts = null;
                if (data.timestamp && data.timestamp.toDate) {
                    ts = data.timestamp.toDate();
                } else if (data.clientTimestamp) {
                    ts = new Date(data.clientTimestamp);
                }
                if (ts && !isNaN(ts.getTime())) {
                    allVisits.push(Object.assign({}, data, { _date: ts }));
                }
            });

            updateStats();
            renderVisitsChart();
            renderDevicesChart();
            renderBrowsersChart();
            renderPagesTable();
            renderRecentVisits();
            bindPeopleUi();
            renderPeopleTable();
        } catch (err) {
            console.error('Erro ao carregar analytics:', err);
            document.getElementById('analyticsContent').innerHTML =
                '<p style="text-align:center;color:#e74c3c;padding:40px;">Erro ao carregar dados: ' + err.message + '</p>';
        }
    };

    function filterByPeriod(days) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        cutoff.setHours(0, 0, 0, 0);
        return allVisits.filter(function(v) { return v._date >= cutoff; });
    }

    function countUnique(visits, field) {
        const set = new Set();
        visits.forEach(function(v) { if (v[field]) set.add(v[field]); });
        return set.size;
    }

    function updateStats() {
        var today = filterByPeriod(1);
        var week = filterByPeriod(7);
        var month = allVisits;

        document.getElementById('analyticsVisitsToday').textContent = today.length;
        document.getElementById('analyticsUniqueToday').textContent = countUnique(today, 'visitorId');
        document.getElementById('analyticsVisitsWeek').textContent = week.length;
        document.getElementById('analyticsVisitsMonth').textContent = month.length;
        document.getElementById('analyticsUniqueMonth').textContent = countUnique(month, 'visitorId');

        var mobileCount = month.filter(function(v) { return v.device === 'mobile'; }).length;
        var pct = month.length > 0 ? Math.round((mobileCount / month.length) * 100) : 0;
        document.getElementById('analyticsMobilePercent').textContent = pct + '%';
    }

    function renderVisitsChart() {
        var ctx = document.getElementById('analyticsVisitsChart');
        if (!ctx) return;

        var days = {};
        for (var i = 29; i >= 0; i--) {
            var d = new Date();
            d.setDate(d.getDate() - i);
            var key = startOfDay(d).toISOString().split('T')[0];
            days[key] = { visits: 0, unique: new Set() };
        }

        allVisits.forEach(function(v) {
            var key = startOfDay(v._date).toISOString().split('T')[0];
            if (days[key]) {
                days[key].visits++;
                if (v.visitorId) days[key].unique.add(v.visitorId);
            }
        });

        var labels = Object.keys(days).map(function(k) {
            var parts = k.split('-');
            return parts[2] + '/' + parts[1];
        });
        var visitData = Object.values(days).map(function(d) { return d.visits; });
        var uniqueData = Object.values(days).map(function(d) { return d.unique.size; });

        if (visitsChart) visitsChart.destroy();
        visitsChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Visitas',
                        data: visitData,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59,130,246,0.1)',
                        fill: true,
                        tension: 0.3,
                        borderWidth: 2,
                        pointRadius: 3
                    },
                    {
                        label: 'Visitantes Únicos',
                        data: uniqueData,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16,185,129,0.1)',
                        fill: true,
                        tension: 0.3,
                        borderWidth: 2,
                        pointRadius: 3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'top' } },
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1 } }
                }
            }
        });
    }

    function renderDevicesChart() {
        var ctx = document.getElementById('analyticsDevicesChart');
        if (!ctx) return;

        var counts = {};
        allVisits.forEach(function(v) {
            var d = v.device || 'outro';
            counts[d] = (counts[d] || 0) + 1;
        });

        var labelMap = { desktop: 'Desktop', mobile: 'Mobile', tablet: 'Tablet', outro: 'Outro' };
        var labels = Object.keys(counts).map(function(k) { return labelMap[k] || k; });
        var data = Object.values(counts);
        var colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

        if (devicesChart) devicesChart.destroy();
        devicesChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors.slice(0, data.length),
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }

    function renderBrowsersChart() {
        var ctx = document.getElementById('analyticsBrowsersChart');
        if (!ctx) return;

        var counts = {};
        allVisits.forEach(function(v) {
            var b = v.browser || 'Outro';
            counts[b] = (counts[b] || 0) + 1;
        });

        var sorted = Object.entries(counts).sort(function(a, b) { return b[1] - a[1]; });
        var labels = sorted.map(function(e) { return e[0]; });
        var data = sorted.map(function(e) { return e[1]; });
        var colors = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899'];

        if (browsersChart) browsersChart.destroy();
        browsersChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Visitas',
                    data: data,
                    backgroundColor: colors.slice(0, data.length),
                    borderRadius: 6,
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: { legend: { display: false } },
                scales: {
                    x: { beginAtZero: true, ticks: { stepSize: 1 } }
                }
            }
        });
    }

    function renderPagesTable() {
        var tbody = document.getElementById('analyticsPagesBody');
        if (!tbody) return;

        var counts = {};
        allVisits.forEach(function(v) {
            var page = v.pageName || v.page || '?';
            if (!counts[page]) counts[page] = { total: 0, unique: new Set() };
            counts[page].total++;
            if (v.visitorId) counts[page].unique.add(v.visitorId);
        });

        var sorted = Object.entries(counts).sort(function(a, b) { return b[1].total - a[1].total; });

        if (sorted.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#999;">Sem dados ainda</td></tr>';
            return;
        }

        tbody.innerHTML = sorted.map(function(entry) {
            var pct = allVisits.length > 0 ? Math.round((entry[1].total / allVisits.length) * 100) : 0;
            return '<tr>' +
                '<td><strong>' + entry[0] + '</strong></td>' +
                '<td>' + entry[1].total + '</td>' +
                '<td>' + entry[1].unique.size + '</td>' +
                '<td><div class="analytics-bar-container"><div class="analytics-bar" style="width:' + pct + '%"></div><span>' + pct + '%</span></div></td>' +
                '</tr>';
        }).join('');
    }

    function visitorRoleLabel(role) {
        if (role === 'super') return 'Administrador';
        if (role === 'admin' || role === 'comercial' || role === 'posvenda' || role === 'financeiro') return 'Administrativo';
        if (role === 'broker') return 'Corretor';
        if (role === 'client') return 'Cliente';
        return '';
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function visitorCell(v) {
        var name = String(v.visitorName || '').trim();
        var role = v.visitorRoleLabel || visitorRoleLabel(v.visitorRole);
        if (name) {
            var title = v.visitorEmail ? ' title="' + escapeHtml(v.visitorEmail) + '"' : '';
            var badge = role ? '<span class="analytics-visitor-role">' + escapeHtml(role) + '</span>' : '';
            return '<span class="analytics-visitor-known"' + title + '>' + escapeHtml(name) + '</span> ' + badge;
        }
        return '<span class="analytics-visitor-anon">Visitante</span>';
    }

    function visitorKey(v) {
        if (v.visitorUid) return 'uid:' + v.visitorUid;
        if (v.visitorEmail) return 'email:' + String(v.visitorEmail).toLowerCase();
        return 'anon:' + (v.visitorId || 'x');
    }

    function topPage(pages) {
        var best = '';
        var n = 0;
        Object.keys(pages || {}).forEach(function(p) {
            if (pages[p] > n) {
                n = pages[p];
                best = p;
            }
        });
        return best;
    }

    function isAdminRole(role) {
        return role === 'super' || role === 'admin' || role === 'comercial' || role === 'posvenda' || role === 'financeiro';
    }

    function aggregatePeople() {
        var map = {};
        allVisits.forEach(function(v) {
            var k = visitorKey(v);
            if (!map[k]) {
                map[k] = {
                    key: k,
                    name: '',
                    email: '',
                    role: '',
                    visits: 0,
                    last: null,
                    pages: {},
                    identified: false
                };
            }
            var row = map[k];
            row.visits += 1;
            if (!row.last || v._date > row.last) row.last = v._date;
            if (v.visitorName) {
                row.name = v.visitorName;
                row.identified = true;
            }
            if (v.visitorEmail) row.email = v.visitorEmail;
            if (v.visitorRole) row.role = v.visitorRole;
            var page = v.pageName || v.page;
            if (page) row.pages[page] = (row.pages[page] || 0) + 1;
        });
        var rows = Object.keys(map).map(function(k) { return map[k]; });
        var seenEmail = {};
        rows.forEach(function(r) {
            if (r.email) seenEmail[String(r.email).toLowerCase()] = true;
        });
        var knownBrokers = [];
        if (typeof getAllBrokers === 'function') {
            try { knownBrokers = getAllBrokers() || []; } catch (e1) { knownBrokers = []; }
        }
        if ((!knownBrokers || !knownBrokers.length) && Array.isArray(window.brokers)) {
            knownBrokers = window.brokers;
        }
        knownBrokers.forEach(function(b) {
            if (!b || b.isActive === false) return;
            var em = String(b.email || '').trim().toLowerCase();
            if (!em || seenEmail[em]) return;
            rows.push({
                key: 'email:' + em,
                name: b.name || em,
                email: em,
                role: 'broker',
                visits: 0,
                last: null,
                pages: {},
                identified: true
            });
        });
        return rows;
    }

    function peopleMatchesFilter(row) {
        if (_peopleFilter === 'identified') return row.identified;
        if (_peopleFilter === 'broker') return row.role === 'broker';
        if (_peopleFilter === 'client') return row.role === 'client';
        if (_peopleFilter === 'admin') return isAdminRole(row.role);
        return true;
    }

    function comparePeople(a, b) {
        var dir = _peopleDir === 'asc' ? 1 : -1;
        if (_peopleSort === 'last') {
            var av = a.last ? a.last.getTime() : 0;
            var bv = b.last ? b.last.getTime() : 0;
            if (av !== bv) return (av - bv) * dir;
        } else {
            if (a.visits !== b.visits) return (a.visits - b.visits) * dir;
        }
        return String(a.name || a.email || '').localeCompare(String(b.name || b.email || ''), 'pt');
    }

    function bindPeopleUi() {
        if (_peopleUiBound) return;
        _peopleUiBound = true;
        var table = document.getElementById('analyticsPeopleTable');
        if (table) {
            table.addEventListener('click', function(ev) {
                var th = ev.target.closest('[data-people-sort]');
                if (!th || !table.contains(th)) return;
                var key = th.getAttribute('data-people-sort');
                if (_peopleSort === key) _peopleDir = _peopleDir === 'desc' ? 'asc' : 'desc';
                else {
                    _peopleSort = key;
                    _peopleDir = key === 'visits' ? 'desc' : 'desc';
                }
                renderPeopleTable();
            });
        }
        var search = document.getElementById('analyticsPeopleSearch');
        if (search) {
            search.addEventListener('input', function() {
                _peopleQuery = search.value;
                renderPeopleTable();
            });
        }
    }

    function renderPeopleTable() {
        var tbody = document.getElementById('analyticsPeopleBody');
        if (!tbody) return;
        var q = String(_peopleQuery || '').trim().toLowerCase();
        var rows = aggregatePeople().filter(peopleMatchesFilter).filter(function(r) {
            if (!q) return true;
            return [r.name, r.email, visitorRoleLabel(r.role)].join(' ').toLowerCase().indexOf(q) !== -1;
        }).sort(comparePeople);
        document.querySelectorAll('#analyticsPeopleTable th[data-people-sort]').forEach(function(th) {
            th.classList.remove('is-sorted-asc', 'is-sorted-desc');
            if (th.getAttribute('data-people-sort') === _peopleSort) {
                th.classList.add(_peopleDir === 'asc' ? 'is-sorted-asc' : 'is-sorted-desc');
            }
        });
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999;">Ninguém neste filtro nos últimos 30 dias.</td></tr>';
            return;
        }
        tbody.innerHTML = rows.map(function(r) {
            var label = r.identified
                ? ('<span class="analytics-visitor-known">' + escapeHtml(r.name || r.email) + '</span> ' +
                    (visitorRoleLabel(r.role) ? '<span class="analytics-visitor-role">' + escapeHtml(visitorRoleLabel(r.role)) + '</span>' : ''))
                : '<span class="analytics-visitor-anon">Visitante</span>';
            var last = r.last ? formatDateTime(r.last) : 'Não visitou';
            var few = r.visits <= 2 ? ' class="analytics-people-few"' : '';
            return '<tr' + few + '>' +
                '<td>' + label + (r.email && r.identified ? '<div class="analytics-people-email">' + escapeHtml(r.email) + '</div>' : '') + '</td>' +
                '<td>' + escapeHtml(visitorRoleLabel(r.role) || (r.identified ? '—' : 'Anônimo')) + '</td>' +
                '<td><strong>' + r.visits + '</strong></td>' +
                '<td>' + last + '</td>' +
                '<td>' + escapeHtml(topPage(r.pages) || '—') + '</td>' +
                '</tr>';
        }).join('');
    }

    window.filterAnalyticsPeople = function(kind) {
        _peopleFilter = kind || 'identified';
        document.querySelectorAll('.analytics-people-filters .admin-kind-chip').forEach(function(btn) {
            btn.classList.toggle('is-active', (btn.getAttribute('data-people-filter') || '') === _peopleFilter);
        });
        renderPeopleTable();
    };

    function renderRecentVisits() {
        var tbody = document.getElementById('analyticsRecentBody');
        if (!tbody) return;

        var recent = allVisits.slice(0, 50);

        if (recent.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999;">Sem visitas ainda</td></tr>';
            return;
        }

        tbody.innerHTML = recent.map(function(v) {
            var deviceIcon = v.device === 'mobile' ? 'fa-mobile-alt' :
                             v.device === 'tablet' ? 'fa-tablet-alt' : 'fa-desktop';
            return '<tr>' +
                '<td>' + formatDateTime(v._date) + '</td>' +
                '<td>' + (v.pageName || v.page || '-') + '</td>' +
                '<td><i class="fas ' + deviceIcon + '"></i> ' + (v.device || '-') + '</td>' +
                '<td>' + (v.browser || '-') + '</td>' +
                '<td>' + (v.os || '-') + '</td>' +
                '<td class="analytics-visitor-id">' + visitorCell(v) + '</td>' +
                '</tr>';
        }).join('');
    }

    window.changeAnalyticsPeriod = function(days) {
        document.querySelectorAll('.analytics-period-btn').forEach(function(btn) {
            btn.classList.remove('active');
        });
        event.target.classList.add('active');

        var filtered = days === 30 ? allVisits : filterByPeriod(days);

        var today = filterByPeriod(1);
        document.getElementById('analyticsVisitsToday').textContent = today.length;
        document.getElementById('analyticsUniqueToday').textContent = countUnique(today, 'visitorId');

        var week = filterByPeriod(7);
        document.getElementById('analyticsVisitsWeek').textContent = week.length;
        document.getElementById('analyticsVisitsMonth').textContent = filtered.length;
        document.getElementById('analyticsUniqueMonth').textContent = countUnique(filtered, 'visitorId');

        var mobileCount = filtered.filter(function(v) { return v.device === 'mobile'; }).length;
        var pct = filtered.length > 0 ? Math.round((mobileCount / filtered.length) * 100) : 0;
        document.getElementById('analyticsMobilePercent').textContent = pct + '%';
    };
})();
