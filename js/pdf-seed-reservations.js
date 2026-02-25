/**
 * Seed automático: reservas do PDF PRONTOS A VENDA
 * Eduardo (sac1consultoria@gmail.com) - cs base Coelho, Cs 9 Apolo
 * CS 4 Click: imóvel marcado reservado, SEM criar reserva (corretor não cadastrado)
 */
(function() {
    const PDF_SEED_VERSION = '2026-02-pdf-v1';
    const STORAGE_KEY = 'pdfSeedApplied';

    function applyPdfSeed() {
        if (localStorage.getItem(STORAGE_KEY) === PDF_SEED_VERSION) return;
        const brokers = typeof getAllBrokers === 'function' ? getAllBrokers() : (window.brokers || []);
        const eduardo = brokers.find(b => String(b.email).toLowerCase() === 'sac1consultoria@gmail.com');
        if (!eduardo) return;

        const existing = JSON.parse(localStorage.getItem('reservations') || '[]');
        const eduardoReservations = [
            { propertyId: 6, unitCode: 'casa base', brokerId: eduardo.id },
            { propertyId: 5, unitCode: 'casa 09', brokerId: eduardo.id }
        ];
        for (const r of eduardoReservations) {
            const exists = existing.some(e => e.propertyId === r.propertyId && (e.unitCode || '') === r.unitCode && e.status === 'active');
            if (exists) continue;
            const res = {
                id: 'RES-PDF-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
                propertyId: r.propertyId,
                brokerId: r.brokerId,
                brokerName: eduardo.name,
                brokerEmail: eduardo.email,
                brokerPhone: eduardo.phone || '',
                unitCode: r.unitCode,
                unitPrice: null,
                unitBedrooms: 1,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                status: 'active',
                clientInfo: { name: 'Importado PDF PRONTOS A VENDA', email: '', phone: '', cpf: '', notes: '' },
                approvedAt: new Date(),
                approvedBy: 'admin'
            };
            const pu = typeof getPropertyUnitsRaw === 'function' ? getPropertyUnitsRaw(r.propertyId) : null;
            if (pu) {
                const u = pu.units.find(x => String(x.code).toLowerCase() === String(r.unitCode).toLowerCase());
                if (u) { res.unitPrice = u.price; res.unitBedrooms = u.bedrooms || 1; }
            }
            existing.push(res);
        }
        localStorage.setItem('reservations', JSON.stringify(existing));
        localStorage.setItem(STORAGE_KEY, PDF_SEED_VERSION);
        if (typeof reservations !== 'undefined' && Array.isArray(reservations)) {
            reservations.length = 0;
            existing.forEach(r => {
                r.createdAt = r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt);
                r.expiresAt = r.expiresAt instanceof Date ? r.expiresAt : new Date(r.expiresAt);
                reservations.push(r);
            });
        }
        if (typeof loadReservationsData === 'function') loadReservationsData();
        if (typeof displayProperties === 'function' && typeof properties !== 'undefined') displayProperties(properties);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(applyPdfSeed, 1200);
        });
    } else {
        setTimeout(applyPdfSeed, 1200);
    }
})();
