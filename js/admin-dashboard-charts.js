/**
 * Gráficos do dashboard admin (Chart.js + adminDashboardBundle).
 */
(function() {
    var chartInstances = {};

    function destroyChart(id) {
        if (chartInstances[id]) {
            chartInstances[id].destroy();
            delete chartInstances[id];
        }
    }

    function monthLabel(key) {
        var parts = String(key || '').split('-');
        if (parts.length !== 2) return key;
        var months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        return months[parseInt(parts[1], 10) - 1] + '/' + parts[0].slice(2);
    }

    function renderDashboardCharts(bundle) {
        if (typeof Chart === 'undefined' || !bundle) return;

        var unitsCanvas = document.getElementById('chartUnitsInventory');
        if (unitsCanvas) {
            destroyChart('units');
            chartInstances.units = new Chart(unitsCanvas, {
                type: 'doughnut',
                data: {
                    labels: ['Disponível', 'Reservado', 'Assinado'],
                    datasets: [{
                        data: [
                            bundle.unitsDisponivel || 0,
                            bundle.unitsReservado || 0,
                            bundle.unitsAssinado || 0
                        ],
                        backgroundColor: ['#22c55e', '#eab308', '#6366f1']
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { title: { display: true, text: 'Inventário de unidades' } }
                }
            });
        }

        var salesCanvas = document.getElementById('chartSalesMonth');
        if (salesCanvas && bundle.salesByMonth) {
            destroyChart('sales');
            var keys = Object.keys(bundle.salesByMonth).sort();
            chartInstances.sales = new Chart(salesCanvas, {
                type: 'bar',
                data: {
                    labels: keys.map(monthLabel),
                    datasets: [{
                        label: 'Vendas',
                        data: keys.map(function(k) { return bundle.salesByMonth[k] || 0; }),
                        backgroundColor: '#3b82f6'
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { title: { display: true, text: 'Vendas por mês (6 meses)' } },
                    scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
                }
            });
        }

        var repairsCanvas = document.getElementById('chartRepairsStatus');
        if (repairsCanvas && bundle.repairsByStatus) {
            destroyChart('repairs');
            var rb = bundle.repairsByStatus;
            chartInstances.repairs = new Chart(repairsCanvas, {
                type: 'bar',
                data: {
                    labels: ['Pendente', 'Em andamento', 'Concluído', 'Cancelado'],
                    datasets: [{
                        label: 'Reparos',
                        data: [
                            rb.pendente || 0,
                            rb.em_andamento || 0,
                            rb.concluido || 0,
                            rb.cancelado || 0
                        ],
                        backgroundColor: ['#f97316', '#0ea5e9', '#22c55e', '#94a3b8']
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { title: { display: true, text: 'Reparos por status' } },
                    scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
                }
            });
        }
    }

    if (typeof window !== 'undefined') {
        window.renderDashboardCharts = renderDashboardCharts;
    }
})();
