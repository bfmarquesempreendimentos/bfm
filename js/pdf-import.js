/**
 * Importação de reservas do PDF "PRONTOS A VENDA" → Firestore (admin).
 */
async function importReservasFromPdf() {
    if (typeof showMessage !== 'function') {
        alert('Sistema não carregado. Abra o Admin Panel.');
        return;
    }
    if (typeof ensureAdminApiReady === 'function' && !ensureAdminApiReady()) {
        showMessage('Faça login no painel para importar.', 'error');
        return;
    }
    try {
        var res = await fetch('data/pdf-prontos-a-venda-import.json');
        var data = await res.json();
        var reservas = data.reservas || [];
        if (!reservas.length) {
            showMessage('Arquivo data/pdf-prontos-a-venda-import.json está vazio.', 'warning');
            return;
        }
        var propertiesList = window.properties || [];
        var items = [];
        var i;
        for (i = 0; i < reservas.length; i++) {
            var r = reservas[i];
            var property = propertiesList.filter(function(p) { return p.id === r.propertyId; })[0];
            items.push({
                propertyId: r.propertyId,
                propertyTitle: property ? property.title : '',
                unitCode: r.unitCode || '',
                brokerEmail: r.corretorEmail || r.brokerEmail || '',
                clientName: 'Importado do PDF'
            });
        }
        var result = await adminPostJson('/adminReservationsMutate', {
            action: 'import_batch',
            items: items,
            approvedBy: 'admin_pdf_import'
        });
        if (typeof loadReservationsData === 'function') loadReservationsData();
        if (typeof loadExpiringReservations === 'function') loadExpiringReservations();
        showMessage(
            'Importado: ' + (result.imported || 0) + ' reserva(s). Ignoradas: ' + (result.skipped || 0) + ' (corretor não cadastrado, duplicadas ou inválidas).',
            'success'
        );
    } catch (err) {
        console.error(err);
        showMessage(err.message || 'Erro ao importar. Verifique data/pdf-prontos-a-venda-import.json.', 'error');
    }
}
