// Property units management system for B F Marques Empreendimentos

// Property units data based on the spreadsheet provided
const propertyUnits = {
    1: { // Porto Novo
        name: "PORTO NOVO - RUA LOURIVAL MARTINS, 31",
        units: [
            { code: "31 (1qt)", price: 140000, bedrooms: 1, status: "assinado" },
            { code: "31 cs 5 sob (1qt)", price: 165000, bedrooms: 1, status: "assinado" },
            { code: "31 cs 6 (1qt)", price: 170000, bedrooms: 1, status: "assinado" },
            { code: "31 cs 6 sob (1 qt)", price: 160000, bedrooms: 1, status: "assinado" },
            { code: "31 cs 8 (1qt)", price: 170000, bedrooms: 1, status: "assinado" },
            { code: "31 cs 7 sob (1qt)", price: 170000, bedrooms: 1, status: "assinado" },
            { code: "31 cs 4 (1qt)", price: 140000, bedrooms: 1, status: "assinado" },
            { code: "31 cs 8 sob (1qt)", price: 160000, bedrooms: 1, status: "assinado" },
            { code: "31 cs 5 (1qt ind.)", price: 160000, bedrooms: 1, status: "assinado" },
            { code: "31 cs 1 (2qts)", price: 170000, bedrooms: 2, status: "assinado" },
            { code: "31 cs 7 (1qt)", price: 170000, bedrooms: 1, status: "disponivel" },
            { code: "31 cs 2 (2qts)", price: 160000, bedrooms: 2, status: "assinado" },
            { code: "31 cs 4 ap (2qts)", price: 150000, bedrooms: 2, status: "assinado" },
            { code: "31 cs 3 (2qts)", price: 180000, bedrooms: 2, status: "reservado" }
        ],
        matriculas: {
            "31": "51.881",
            "31 cs 5 sob": "51.885",
            "31 cs 6": "51.882",
            "31 cs 6 sob": "51.886",
            "31 cs 8": "51.883",
            "31 cs 7 sob": "51.887",
            "31 cs 4": "51.884",
            "31 cs 8 sob": "51.888",
            "31 cs 5": "51.889",
            "31 cs 1": "51.892",
            "31 cs 7": "51.890",
            "31 cs 2": "51.893",
            "31 cs 4 ap 103": "51.891",
            "31 cs 3": "51.894"
        },
        engineeringValues: {
            "31": "R$ 213.398,12",
            "31 cs 5 sob": "R$ 188.000,00",
            "31 cs 6": "R$ 226.100,00",
            "31 cs 6 sob": "R$ 170.000,00",
            "31 cs 8": "R$ 225.000,00",
            "31 cs 7 sob": "R$ 216.000,00",
            "31 cs 4": "R$ 162.906,09",
            "31 cs 8 sob": "R$ 218.000,00",
            "31 cs 5": "R$ 217.000,00",
            "31 cs 1": "R$ 204.000,00",
            "31 cs 7": "R$ 191.383,57",
            "31 cs 2": "R$ 162.000,00",
            "31 cs 4 ap 103": "R$ 210.000,00",
            "31 cs 3": "R$ 227.000,00"
        }
    },
    
    2: { // Residencial Itaúna
        name: "RESIDENCIAL ITAÚNA - RUA ALCIO SOUTO",
        units: [
            { code: "casa base", price: 155000, bedrooms: 1, status: "disponivel" },
            { code: "casa 05", price: 155000, bedrooms: 1, status: "disponivel" },
            { code: "casa 01", price: 155000, bedrooms: 1, status: "disponivel" },
            { code: "casa 06", price: 155000, bedrooms: 1, status: "disponivel" },
            { code: "casa 02", price: 155000, bedrooms: 1, status: "disponivel" },
            { code: "casa 07", price: 155000, bedrooms: 1, status: "disponivel" },
            { code: "casa 03", price: 155000, bedrooms: 1, status: "disponivel" },
            { code: "cassa 08", price: 155000, bedrooms: 1, status: "reservado" },
            { code: "casa 04", price: 160000, bedrooms: 1, status: "disponivel" },
            { code: "casa 09", price: 160000, bedrooms: 1, status: "reservado" }
        ],
        engineeringValues: {
            "Cs base": "R$ 195.000,00",
            "Cs 5": "R$ 193.000,00",
            "Cs 1": "R$ 193.000,00",
            "Cs 6": "R$ 150.000,00",
            "Cs 2": "R$ 200.000,00",
            "Cs 3": "R$ 150.000,00",
            "Cs 7": "R$ 193.000,00",
            "Cs 8": "R$ 195.000,00",
            "Cs 4": "R$ 205.000,00",
            "Cs 9": "R$ 205.000,00"
        }
    },
    
    3: { // Amendoeiras
        name: "EDIFÍCIO AMENDOEIRAS - R LOPES DA CRUZ, 136",
        units: [
            { code: "APTO 101", price: 160000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 201", price: 165000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 102", price: 165000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 202", price: 160000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 103", price: 165000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 203", price: 160000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 104", price: 165000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 204", price: 160000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 105", price: 165000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 205", price: 160000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 106", price: 165000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 206", price: 160000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 107", price: 165000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 207", price: 160000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 108", price: 165000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 208", price: 160000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 109", price: 165000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 209", price: 160000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 110", price: 170000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 210", price: 165000, bedrooms: 2, status: "disponivel" }
        ],
        engineeringValues: {
            "APTO 101": "R$ 177.000,00",
            "APTO 105": "R$ 177.000,00",
            "APTO 110": "R$ 194.000,00"
        }
    },
    
    4: { // Laranjal
        name: "LARANJAL - RUA JUSSARA, 178",
        units: [
            { code: "CS BASE", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "CS 05", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "CS 10", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "CS 01", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "CS 06", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "CS 11", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "CS 02", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "CS 07", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "CS 12", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "CS 03", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "CS 08", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "CS 13", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "CS 04", price: 150000, bedrooms: 1, status: "disponivel" },
            { code: "CS 09", price: 150000, bedrooms: 1, status: "disponivel" },
            { code: "CS 14", price: 150000, bedrooms: 1, status: "disponivel" }
        ]
    },
    
    5: { // Apolo
        name: "APOLO - RUA MARIA JOSÉ ARRUDA BARBOSA LT 02 QD 18 - ITABORAÍ",
        units: [
            { code: "casa base", price: 135000, bedrooms: 1, status: "disponivel" },
            { code: "casa 05", price: 130000, bedrooms: 1, status: "reservado" },
            { code: "casa 01", price: 135000, bedrooms: 1, status: "disponivel" },
            { code: "casa 06", price: 135000, bedrooms: 1, status: "disponivel" },
            { code: "casa 02", price: 135000, bedrooms: 1, status: "disponivel" },
            { code: "casa 07", price: 135000, bedrooms: 1, status: "disponivel" },
            { code: "casa 03", price: 135000, bedrooms: 1, status: "disponivel" },
            { code: "cassa 08", price: 135000, bedrooms: 1, status: "disponivel" },
            { code: "casa 04", price: 140000, bedrooms: 1, status: "reservado" },
            { code: "casa 09", price: 140000, bedrooms: 1, status: "reservado" }
        ],
        engineeringValues: {
            "Cs base": "R$ 181.000,00",
            "Cs 5": "R$ 130.000,00",
            "Cs 1": "R$ 177.714,59",
            "Cs 2": "R$ 140.000,00",
            "Cs 7": "R$ 140.000,00",
            "Cs 4": "R$ 134.000,00",
            "Cs 9": "R$ 201.000,00"
        }
    },
    
    6: { // Coelho
        name: "RESIDENCIAL COELHO - RUA DR LOPES DA CRUZ",
        units: [
            { code: "casa base", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "casa 05", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "casa 01", price: 145000, bedrooms: 1, status: "reservado" },
            { code: "casa 06", price: 150000, bedrooms: 1, status: "assinado" },
            { code: "casa 02", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "casa 07", price: 145000, bedrooms: 1, status: "disponivel" },
            { code: "casa 03", price: 150000, bedrooms: 1, status: "assinado" },
            { code: "cassa 08", price: 150000, bedrooms: 1, status: "assinado" },
            { code: "casa 04", price: 160000, bedrooms: 1, status: "assinado" },
            { code: "casa 09", price: 160000, bedrooms: 1, status: "assinado" }
        ],
        engineeringValues: {
            "Cs base": "R$ 165.336,19",
            "Cs 5": "R$ 185.000,00",
            "Cs 1": "R$ 177.145,79",
            "Cs 6": "R$ 197.000,00",
            "Cs 2": "R$ 190.000,00",
            "Cs 7": "R$ 199.100,00",
            "Cs 3": "R$ 190.000,00",
            "Cs 8": "R$ 147.000,00",
            "Cs 9": "R$ 194.000,00"
        }
    },
    
    7: { // Edifício Caçador
        name: "EDIFÍCIO CAÇADOR - RUA ALCIO SOUTO, 576",
        units: [
            { code: "APTO 101", price: 160000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 201", price: 165000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 102", price: 165000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 202", price: 160000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 103", price: 165000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 203", price: 160000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 104", price: 165000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 204", price: 160000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 105", price: 165000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 205", price: 160000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 106", price: 165000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 206", price: 160000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 107", price: 165000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 207", price: 160000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 108", price: 165000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 208", price: 160000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 109", price: 165000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 209", price: 160000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 110", price: 170000, bedrooms: 2, status: "disponivel" },
            { code: "APTO 210", price: 165000, bedrooms: 2, status: "disponivel" }
        ],
        engineeringValues: {
            "APTO 101": "R$ 159.923,35",
            "APTO 102": "R$ 193.000,00",
            "APTO 104": "R$ 193.000,00",
            "APTO 110": "R$ 162.000,00",
            "APTO 202": "R$ 167.000,00",
            "APTO 205": "R$ 160.000,00",
            "APTO 207": "R$ 152.000,00",
            "APTO 210": "R$ 167.000,00"
        }
    }
};

// Get units for a property
function getPropertyUnits(propertyId) {
    return propertyUnits[propertyId] || null;
}

// Get unit status color class
function getUnitStatusClass(status) {
    const statusMap = {
        'disponivel': 'unit-available',
        'reservado': 'unit-reserved', 
        'assinado': 'unit-signed'
    };
    return statusMap[status] || 'unit-available';
}

// Get unit status text
function getUnitStatusText(status) {
    const statusMap = {
        'disponivel': 'Disponível',
        'reservado': 'Reservado',
        'assinado': 'Assinado'
    };
    return statusMap[status] || status;
}

// Create units table for property
function createUnitsTable(propertyId) {
    const propertyData = getPropertyUnits(propertyId);
    if (!propertyData) return '';
    
    const units = propertyData.units;
    const columns = Math.ceil(units.length / Math.ceil(units.length / 3)); // Divide in ~3 columns
    
    let tableHTML = `
        <div class="units-section">
            <h4>${propertyData.name}</h4>
            <div class="status-legend">
                <div class="legend-item">
                    <span class="legend-color unit-available"></span>
                    <span>DISPONÍVEL</span>
                </div>
                <div class="legend-item">
                    <span class="legend-color unit-reserved"></span>
                    <span>RESERVADO</span>
                </div>
                <div class="legend-item">
                    <span class="legend-color unit-signed"></span>
                    <span>ASSINADO ESCRITURA</span>
                </div>
            </div>
            <div class="units-table-container">
                <table class="units-table">
                    <thead>
                        <tr>
                            <th colspan="2">Vlr. Venda</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    // Create table rows in pairs
    for (let i = 0; i < units.length; i += 2) {
        const unit1 = units[i];
        const unit2 = units[i + 1];
        
        tableHTML += `
            <tr>
                <td class="${getUnitStatusClass(unit1.status)}" onclick="selectUnit('${propertyId}', '${unit1.code}')">
                    <div class="unit-code">${unit1.code}</div>
                    <div class="unit-price">R$ ${unit1.price.toLocaleString('pt-BR')}</div>
                </td>
                ${unit2 ? `
                    <td class="${getUnitStatusClass(unit2.status)}" onclick="selectUnit('${propertyId}', '${unit2.code}')">
                        <div class="unit-code">${unit2.code}</div>
                        <div class="unit-price">R$ ${unit2.price.toLocaleString('pt-BR')}</div>
                    </td>
                ` : '<td></td>'}
            </tr>
        `;
    }
    
    tableHTML += `
                    </tbody>
                </table>
            </div>
            
            ${propertyData.matriculas ? `
                <div class="matriculas-section">
                    <h5>Matrículas:</h5>
                    <div class="matriculas-grid">
                        ${Object.entries(propertyData.matriculas).map(([unit, matricula]) => `
                            <div class="matricula-item">
                                <span class="matricula-unit">${unit}</span>
                                <span class="matricula-number">${matricula}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            ${propertyData.engineeringValues ? `
                <div class="engineering-values-section">
                    <h5>Valor Engenharia:</h5>
                    <div class="engineering-grid">
                        ${Object.entries(propertyData.engineeringValues).map(([unit, value]) => `
                            <div class="engineering-item">
                                <span class="engineering-unit">${unit}</span>
                                <span class="engineering-value">${value}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
    
    return tableHTML;
}

// Select unit for reservation
function selectUnit(propertyId, unitCode) {
    const propertyData = getPropertyUnits(propertyId);
    if (!propertyData) return;
    
    const unit = propertyData.units.find(u => u.code === unitCode);
    if (!unit) return;
    
    if (unit.status !== 'disponivel') {
        showMessage(`Esta unidade está ${getUnitStatusText(unit.status).toLowerCase()}.`, 'warning');
        return;
    }
    
    // Store selected unit for reservation
    sessionStorage.setItem('selectedUnit', JSON.stringify({
        propertyId: propertyId,
        unitCode: unitCode,
        price: unit.price,
        bedrooms: unit.bedrooms
    }));
    
    // Start reservation process for this specific unit
    reservePropertyUnit(propertyId, unitCode);
}

// Reserve specific unit
function reservePropertyUnit(propertyId, unitCode) {
    if (!isAuthenticated()) {
        showMessage('Você precisa estar logado para fazer uma reserva.', 'error');
        openLoginModal();
        return;
    }
    
    if (!isBroker()) {
        showMessage('Apenas corretores podem fazer reservas.', 'error');
        return;
    }
    
    const property = properties.find(p => p.id === propertyId);
    const selectedUnit = JSON.parse(sessionStorage.getItem('selectedUnit'));
    
    if (!property || !selectedUnit) {
        showMessage('Erro ao processar reserva da unidade.', 'error');
        return;
    }
    
    // Show reservation form with unit details
    showUnitReservationForm(property, selectedUnit);
}

// Show unit reservation form
function showUnitReservationForm(property, selectedUnit) {
    const modal = document.getElementById('propertyModal');
    const detailsContainer = document.getElementById('propertyDetails');
    
    const reservation = {
        id: generateReservationId(),
        propertyId: property.id,
        unitCode: selectedUnit.unitCode,
        brokerId: currentUser.id,
        brokerName: currentUser.name,
        brokerEmail: currentUser.email,
        brokerPhone: currentUser.phone,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        status: 'pending',
        clientInfo: null,
        approvedAt: null,
        approvedBy: null
    };
    
    detailsContainer.innerHTML = `
        <div class="unit-reservation-form-container">
            <h2>Reservar Unidade</h2>
            <div class="unit-summary">
                <h3>${property.title}</h3>
                <p><i class="fas fa-map-marker-alt"></i> ${property.location}</p>
                <div class="unit-details">
                    <p><strong>Unidade:</strong> ${selectedUnit.unitCode}</p>
                    <p><strong>Quartos:</strong> ${selectedUnit.bedrooms}</p>
                    <p class="unit-price">R$ ${selectedUnit.price.toLocaleString('pt-BR')}</p>
                </div>
            </div>
            
            <form id="unitReservationForm" class="reservation-form">
                <div class="form-section">
                    <h4>Informações do Cliente</h4>
                    <div class="form-group">
                        <label for="clientName">Nome Completo do Cliente:</label>
                        <input type="text" id="clientName" name="clientName" required>
                    </div>
                    <div class="form-group">
                        <label for="clientEmail">Email do Cliente:</label>
                        <input type="email" id="clientEmail" name="clientEmail" required>
                    </div>
                    <div class="form-group">
                        <label for="clientPhone">Telefone do Cliente:</label>
                        <input type="tel" id="clientPhone" name="clientPhone" required>
                    </div>
                    <div class="form-group">
                        <label for="clientCPF">CPF do Cliente:</label>
                        <input type="text" id="clientCPF" name="clientCPF" required>
                    </div>
                </div>
                
                <div class="form-section">
                    <h4>Informações da Reserva</h4>
                    <div class="reservation-info">
                        <p><strong>Corretor:</strong> ${currentUser.name}</p>
                        <p><strong>CRECI:</strong> ${currentUser.creci}</p>
                        <p><strong>Data da Reserva:</strong> ${formatDate(reservation.createdAt)}</p>
                        <p><strong>Válida até:</strong> ${formatDate(reservation.expiresAt)}</p>
                    </div>
                    
                    <div class="form-group">
                        <label for="reservationNotes">Observações (opcional):</label>
                        <textarea id="reservationNotes" name="reservationNotes" rows="4" placeholder="Informações adicionais sobre a reserva..."></textarea>
                    </div>
                </div>
                
                <div class="form-section">
                    <div class="terms-section">
                        <label class="checkbox-container">
                            <input type="checkbox" id="agreeTerms" required>
                            <span class="checkmark"></span>
                            Concordo com os termos e condições da reserva
                        </label>
                    </div>
                </div>
                
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closePropertyModal()">Cancelar</button>
                    <button type="submit" class="btn btn-primary">Confirmar Reserva da Unidade</button>
                </div>
            </form>
        </div>
    `;
    
    modal.style.display = 'block';
    
    // Setup form submission
    const form = document.getElementById('unitReservationForm');
    form.addEventListener('submit', (e) => handleUnitReservationSubmission(e, property, selectedUnit, reservation));
    
    // Setup masks
    setupFormMasks();
}

// Handle unit reservation submission
function handleUnitReservationSubmission(e, property, selectedUnit, reservation) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    
    // Validate CPF
    const cpf = formData.get('clientCPF');
    if (!isValidCPF(cpf)) {
        showMessage('CPF inválido. Por favor, verifique o número digitado.', 'error');
        return;
    }
    
    // Update reservation with client info
    reservation.clientInfo = {
        name: formData.get('clientName'),
        email: formData.get('clientEmail'),
        phone: formData.get('clientPhone'),
        cpf: cpf,
        notes: formData.get('reservationNotes') || ''
    };
    
    // Add unit-specific information
    reservation.unitCode = selectedUnit.unitCode;
    reservation.unitPrice = selectedUnit.price;
    reservation.unitBedrooms = selectedUnit.bedrooms;
    
    // Add reservation to list
    reservations.push(reservation);
    
    // Save to localStorage
    localStorage.setItem('reservations', JSON.stringify(reservations));
    
    // Close modal and refresh display
    closePropertyModal();
    displayProperties(properties);
    
    // Create notification for admin approval
    createUnitReservationNotification(reservation, property, selectedUnit, currentUser);
    
    // Show success message
    showMessage(`Solicitação de reserva da unidade ${selectedUnit.unitCode} enviada! Aguarde aprovação do administrador.`, 'success');
    
    // Clear selected unit
    sessionStorage.removeItem('selectedUnit');
}

// Create unit reservation notification
function createUnitReservationNotification(reservation, property, unit, broker) {
    const title = 'Nova Solicitação de Reserva de Unidade';
    const message = `${broker.name} solicitou reserva da unidade ${unit.unitCode} do empreendimento "${property.title}" para o cliente ${reservation.clientInfo.name}`;
    
    return createNotification('unit_reservation_request', title, message, {
        reservationId: reservation.id,
        propertyId: property.id,
        unitCode: unit.unitCode,
        unitPrice: unit.price,
        brokerId: broker.id,
        brokerName: broker.name,
        propertyTitle: property.title,
        clientName: reservation.clientInfo.name,
        clientCPF: reservation.clientInfo.cpf,
        clientPhone: reservation.clientInfo.phone
    });
}

// Get units statistics for a property
function getUnitsStatistics(propertyId) {
    const propertyData = getPropertyUnits(propertyId);
    if (!propertyData) return null;
    
    const stats = {
        total: propertyData.units.length,
        available: 0,
        reserved: 0,
        signed: 0,
        totalValue: 0,
        averagePrice: 0
    };
    
    propertyData.units.forEach(unit => {
        stats.totalValue += unit.price;
        
        switch (unit.status) {
            case 'disponivel':
                stats.available++;
                break;
            case 'reservado':
                stats.reserved++;
                break;
            case 'assinado':
                stats.signed++;
                break;
        }
    });
    
    stats.averagePrice = stats.totalValue / stats.total;
    
    return stats;
}

// Setup form masks
function setupFormMasks() {
    // CPF mask
    const cpfInput = document.getElementById('clientCPF');
    if (cpfInput) {
        cpfInput.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            value = value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
            e.target.value = value;
        });
    }
    
    // Phone mask
    const phoneInput = document.getElementById('clientPhone');
    if (phoneInput) {
        phoneInput.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length >= 2) {
                value = value.replace(/^(\d{2})(\d{0,5})(\d{0,4}).*/, '($1) $2-$3');
            }
            e.target.value = value;
        });
    }
}

