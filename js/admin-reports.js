/**
 * Relatórios admin: gráficos com dados Firestore + export PDF.
 */
(function() {
    var reportCharts = {};

    function destroyReportChart(id) {
        if (reportCharts[id]) {
            reportCharts[id].destroy();
            delete reportCharts[id];
        }
    }

    function monthLabel(key) {
        var parts = String(key || '').split('-');
        if (parts.length !== 2) return key;
        var months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        return months[parseInt(parts[1], 10) - 1] + '/' + parts[0].slice(2);
    }

    function loadReportsData() {
        if (!ensureAdminApiReady()) return;
        adminFetchJson('/adminDashboardBundle').then(function(bundle) {
            if (!bundle || bundle.error) return;
            if (typeof Chart === 'undefined') return;

            var salesCanvas = document.getElementById('salesChart');
            if (salesCanvas && bundle.salesByMonth) {
                destroyReportChart('sales');
                var keys = Object.keys(bundle.salesByMonth).sort();
                reportCharts.sales = new Chart(salesCanvas, {
                    type: 'line',
                    data: {
                        labels: keys.map(monthLabel),
                        datasets: [{
                            label: 'Vendas registradas',
                            data: keys.map(function(k) { return bundle.salesByMonth[k] || 0; }),
                            borderColor: '#3b82f6',
                            fill: false,
                            tension: 0.2
                        }]
                    },
                    options: { responsive: true }
                });
            }

            var typeCanvas = document.getElementById('typeChart');
            if (typeCanvas) {
                destroyReportChart('types');
                var typeCounts = {};
                if (typeof properties !== 'undefined') {
                    properties.forEach(function(p) {
                        var t = p.type || 'outro';
                        typeCounts[t] = (typeCounts[t] || 0) + 1;
                    });
                }
                reportCharts.types = new Chart(typeCanvas, {
                    type: 'pie',
                    data: {
                        labels: Object.keys(typeCounts),
                        datasets: [{
                            data: Object.keys(typeCounts).map(function(k) { return typeCounts[k]; }),
                            backgroundColor: ['#6366f1', '#22c55e', '#eab308', '#f97316']
                        }]
                    },
                    options: { responsive: true, plugins: { title: { display: true, text: 'Empreendimentos por tipo' } } }
                });
            }

            var perfEl = document.getElementById('brokerPerformance');
            if (perfEl) {
                perfEl.innerHTML = '<p class="empty-message">Carregando vendas por corretor...</p>';
                adminPostJson('/adminPropertySalesList', {}).then(function(data) {
                    var sales = (data && data.sales) ? data.sales : [];
                    var byBroker = {};
                    sales.forEach(function(s) {
                        var name = s.brokerName || s.brokerEmail || 'Sem corretor';
                        byBroker[name] = (byBroker[name] || 0) + 1;
                    });
                    var rows = Object.keys(byBroker).map(function(name) {
                        return { name: name, count: byBroker[name] };
                    }).sort(function(a, b) { return b.count - a.count; });
                    if (!rows.length) {
                        perfEl.innerHTML = '<p class="empty-message">Nenhuma venda com corretor registrada.</p>';
                        return;
                    }
                    perfEl.innerHTML = rows.map(function(r) {
                        return '<div class="performance-item"><strong>' + r.name + '</strong><span>' + r.count + ' venda(s)</span></div>';
                    }).join('');
                });
            }

            window._lastReportsBundle = bundle;
        });
    }

    function exportReportsPdf() {
        if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
            showMessage('Biblioteca PDF não carregada. Recarregue a página.', 'error');
            return;
        }
        if (!ensureAdminApiReady()) {
            showMessage('Faça login para exportar.', 'error');
            return;
        }

        Promise.all([
            adminFetchJson('/adminDashboardBundle'),
            adminPostJson('/adminPropertySalesList', {}),
            adminPostJson('/adminReservationsMutate', { action: 'list' }),
            adminFetchJson('/getRepairs')
        ]).then(function(results) {
            var bundle = results[0] || {};
            var sales = (results[1] && results[1].sales) ? results[1].sales : [];
            var reservations = (results[2] && results[2].reservations) ? results[2].reservations : [];
            var repairs = Array.isArray(results[3]) ? results[3] : [];

            var jsPDF = window.jspdf.jsPDF;
            var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            var y = 14;
            var lineH = 7;

            function line(text) {
                if (y > 280) {
                    doc.addPage();
                    y = 14;
                }
                doc.setFontSize(10);
                doc.text(String(text).slice(0, 95), 14, y);
                y += lineH;
            }

            doc.setFontSize(16);
            doc.text('Relatório B F Marques', 14, y);
            y += lineH + 2;
            doc.setFontSize(10);
            doc.text('Gerado em: ' + new Date().toLocaleString('pt-BR'), 14, y);
            y += lineH + 4;

            doc.setFontSize(12);
            doc.text('Resumo', 14, y);
            y += lineH;
            line('Vendas registradas: ' + (bundle.salesCount || sales.length || 0));
            line('Reparos em aberto: ' + (bundle.repairsOpen || 0));
            line('Reservas pendentes: ' + (bundle.reservationsPending || 0));
            line('Reservas ativas: ' + (bundle.reservationsActive || 0));
            line('Unidades disponíveis: ' + (bundle.unitsDisponivel || 0));
            line('Unidades reservadas: ' + (bundle.unitsReservado || 0));
            line('Unidades assinadas: ' + (bundle.unitsAssinado || 0));
            line('Leads WhatsApp: ' + ((bundle.wa && bundle.wa.total) || 0));
            y += 4;

            doc.setFontSize(12);
            doc.text('Últimas vendas (' + Math.min(sales.length, 15) + ')', 14, y);
            y += lineH;
            sales.slice(0, 15).forEach(function(s) {
                line('- ' + (s.propertyTitle || 'Imóvel') + ' · ' + (s.clientName || '') + ' · R$ ' + (s.salePrice || 0));
            });
            y += 4;

            doc.setFontSize(12);
            doc.text('Reservas recentes (' + Math.min(reservations.length, 12) + ')', 14, y);
            y += lineH;
            reservations.slice(0, 12).forEach(function(r) {
                var client = (r.client && r.client.name) || '';
                line('- ' + (r.propertyTitle || '') + (r.unitCode ? ' ' + r.unitCode : '') + ' · ' + (r.status || '') + ' · ' + client);
            });
            y += 4;

            doc.setFontSize(12);
            doc.text('Reparos recentes (' + Math.min(repairs.length, 12) + ')', 14, y);
            y += lineH;
            repairs.slice(0, 12).forEach(function(r) {
                line('- ' + (r.propertyTitle || r.description || 'Reparo').slice(0, 60) + ' · ' + (r.status || ''));
            });

            doc.save('relatorio_bf_marques_' + new Date().toISOString().slice(0, 10) + '.pdf');
            showMessage('PDF exportado com sucesso!', 'success');
        }).catch(function(err) {
            showMessage(err.message || 'Erro ao gerar PDF.', 'error');
        });
    }

    function generateSalesReport() {
        loadReportsData();
        showMessage('Gráficos atualizados com dados do Firestore.', 'success');
    }

    if (typeof window !== 'undefined') {
        window.loadReportsData = loadReportsData;
        window.exportReportsPdf = exportReportsPdf;
        window.generateSalesReport = generateSalesReport;
    }
})();
