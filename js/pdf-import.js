/**
 * Importação de reservas do PDF "PRONTOS A VENDA"
 * Só importa reservas de corretores já cadastrados. Ignora "Click", "CS 4 Click" etc.
 */

function generateReservationId() {
    return 'RES' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
}

async function importReservasFromPdf() {
    if (typeof showMessage !== 'function') {
        alert('Sistema não carregado. Abra o Admin Panel.');
        return;
    }
    try {
        const res = await fetch('data/pdf-prontos-a-venda-import.json');
        const data = await res.json();
        const reservas = data.reservas || [];
        if (reservas.length === 0) {
            showMessage('Arquivo data/pdf-prontos-a-venda-import.json está vazio. Preencha com os dados do PDF.', 'warning');
            return;
        }
        const brokers = typeof getAllBrokers === 'function' ? getAllBrokers() : [];
        const properties = window.properties || [];
        if (!Array.isArray(properties) || properties.length === 0) {
            showMessage('Carregue os imóveis primeiro.', 'error');
            return;
        }
        let importados = 0;
        let ignorados = 0;
        for (const r of reservas) {
            const broker = brokers.find(b => String(b.email).toLowerCase() === String(r.corretorEmail || '').toLowerCase());
            if (!broker) {
                ignorados++;
                console.warn('Corretor não cadastrado, ignorado:', r.corretorEmail, r.unitCode);
                continue;
            }
            if (r.corretorEmail && /click/i.test(String(r.corretorEmail))) {
                ignorados++;
                continue;
            }
            const property = properties.find(p => p.id === r.propertyId);
            if (!property) {
                ignorados++;
                continue;
            }
            const pu = typeof getPropertyUnitsRaw === 'function' ? getPropertyUnitsRaw(r.propertyId) : null;
            if (pu && r.unitCode && typeof setUnitStatusOverride === 'function') {
                const unit = pu.units.find(u => String(u.code).toLowerCase() === String(r.unitCode).toLowerCase().trim());
                if (unit) {
                    setUnitStatusOverride(r.propertyId, unit.code, r.status || 'reservado');
                }
            }
            const exists = reservations.some(res =>
                res.propertyId === r.propertyId && res.unitCode === r.unitCode && res.status === 'active'
            );
            if (exists) continue;
            const reservation = {
                id: generateReservationId(),
                propertyId: r.propertyId,
                brokerId: broker.id,
                brokerName: broker.name,
                brokerEmail: broker.email,
                brokerPhone: broker.phone || '',
                unitCode: r.unitCode || null,
                unitPrice: null,
                unitBedrooms: null,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                status: 'active',
                clientInfo: { name: 'Importado do PDF', email: '', phone: '', cpf: '', notes: 'PRONTOS A VENDA' },
                approvedAt: new Date(),
                approvedBy: 'admin'
            };
            if (pu && r.unitCode) {
                const unit = pu.units.find(u => String(u.code).toLowerCase() === String(r.unitCode).toLowerCase().trim());
                if (unit) {
                    reservation.unitPrice = unit.price;
                    reservation.unitBedrooms = unit.bedrooms || 1;
                }
            }
            reservations.push(reservation);
            importados++;
        }
        localStorage.setItem('reservations', JSON.stringify(reservations));
        if (typeof loadReservationsData === 'function') loadReservationsData();
        if (typeof displayProperties === 'function') displayProperties(properties);
        showMessage(`Importado: ${importados} reserva(s). Ignoradas: ${ignorados} (corretor não cadastrado ou duplicadas).`, 'success');
    } catch (err) {
        console.error(err);
        showMessage('Erro ao importar. Verifique se data/pdf-prontos-a-venda-import.json existe e está correto.', 'error');
    }
}
