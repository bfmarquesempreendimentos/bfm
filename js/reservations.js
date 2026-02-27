// Reservation system for properties

// Reservation storage
let reservations = [];

// Reserve property function
function reserveProperty(propertyId) {
    // Check if user is authenticated
    if (!isAuthenticated()) {
        showMessage('Você precisa estar logado para fazer uma reserva.', 'error');
        openLoginModal();
        return;
    }
    
    // Check if user is a broker
    if (!isBroker()) {
        showMessage('Apenas corretores podem fazer reservas.', 'error');
        return;
    }
    
    const property = properties.find(p => p.id === propertyId);
    if (!property) {
        showMessage('Imóvel não encontrado.', 'error');
        return;
    }
    
    // Check if property is available
    if (property.status !== 'disponivel') {
        showMessage('Este imóvel não está disponível para reserva.', 'error');
        return;
    }
    
    // Check if broker already has a reservation for this property
    const existingReservation = reservations.find(r => 
        r.propertyId === propertyId && 
        r.brokerId === currentUser.id && 
        r.status === 'active'
    );
    
    if (existingReservation) {
        showMessage('Você já tem uma reserva ativa para este imóvel.', 'warning');
        return;
    }
    
    // Create reservation (pending approval)
    const reservation = {
        id: generateReservationId(),
        propertyId: propertyId,
        brokerId: currentUser.id,
        brokerName: currentUser.name,
        brokerEmail: currentUser.email,
        brokerPhone: currentUser.phone,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
        status: 'pending', // Changed from 'active' to 'pending'
        clientInfo: null,
        approvedAt: null,
        approvedBy: null
    };
    
    // Show reservation form
    showReservationForm(property, reservation);
}

// Show reservation form
function showReservationForm(property, reservation) {
    const modal = document.getElementById('propertyModal');
    const detailsContainer = document.getElementById('propertyDetails');
    
    detailsContainer.innerHTML = `
        <div class="reservation-form-container">
            <h2>Reservar Imóvel</h2>
            <div class="property-summary">
                <h3>${property.title}</h3>
                <p><i class="fas fa-map-marker-alt"></i> ${property.location}</p>
                <p class="price">R$ ${property.price.toLocaleString('pt-BR')}</p>
            </div>
            
            <form id="reservationForm" class="reservation-form">
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
                        <div class="terms-text">
                            <h5>Termos da Reserva:</h5>
                            <ul>
                                <li>A reserva tem validade de 48 horas (2 dias)</li>
                                <li>Após o vencimento, o imóvel volta automaticamente para disponível</li>
                                <li>O corretor é responsável pelas informações do cliente</li>
                                <li>A reserva pode ser cancelada a qualquer momento</li>
                                <li>Apenas um corretor pode reservar o mesmo imóvel por vez</li>
                            </ul>
                        </div>
                    </div>
                </div>
                
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closePropertyModal()">Cancelar</button>
                    <button type="submit" class="btn btn-primary">Confirmar Reserva</button>
                </div>
            </form>
        </div>
    `;
    
    modal.style.display = 'block';
    
    // Setup form submission
    const form = document.getElementById('reservationForm');
    form.addEventListener('submit', (e) => handleReservationSubmission(e, property, reservation));
    
    // Setup CPF mask
    const cpfInput = document.getElementById('clientCPF');
    cpfInput.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\D/g, '');
        value = value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
        e.target.value = value;
    });
    
    // Setup phone mask
    const phoneInput = document.getElementById('clientPhone');
    phoneInput.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length >= 2) {
            value = value.replace(/^(\d{2})(\d{0,5})(\d{0,4}).*/, '($1) $2-$3');
        }
        e.target.value = value;
    });
}

// Handle reservation form submission
async function handleReservationSubmission(e, property, reservation) {
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
    if (typeof addCreatedBy === 'function') addCreatedBy(reservation);
    // Add reservation to list
    reservations.push(reservation);
    
    // Keep property status as available until approved
    // property.status = 'reservado'; // This will be set when approved
    // property.reservedUntil = reservation.expiresAt;
    // property.reservedBy = currentUser.name;
    
    // Save to localStorage
    localStorage.setItem('reservations', JSON.stringify(reservations));
    localStorage.setItem('properties', JSON.stringify(properties));
    
    // Close modal and refresh display
    closePropertyModal();
    displayProperties(properties);
    
    // Create notification for admin approval
    createReservationRequestNotification(reservation, property, currentUser);
    
    // Enviar email para o admin (B F Marques) quando chega a solicitação
    if (typeof sendEmail === 'function') {
        const subject = 'Nova Solicitação de Reserva - ' + property.title;
        const body = `
            <h2>Nova Solicitação de Reserva</h2>
            <p><strong>Imóvel:</strong> ${property.title}</p>
            <p><strong>Corretor:</strong> ${currentUser.name} (${currentUser.email || ''})</p>
            <p><strong>Cliente:</strong> ${reservation.clientInfo.name}</p>
            <p><strong>CPF:</strong> ${reservation.clientInfo.cpf}</p>
            <p><strong>Telefone:</strong> ${reservation.clientInfo.phone}</p>
            <p><strong>Email do cliente:</strong> ${reservation.clientInfo.email}</p>
            <p>Acesse o painel administrativo para aprovar ou rejeitar.</p>
            <p>Atenciosamente,<br><strong>B F Marques Empreendimentos</strong></p>
        `;
        try { await sendEmail('bfmarquesempreendimentos@gmail.com', subject, body); } catch (e) { console.error('Erro ao enviar email:', e); }
    }
    
    // Show success message
    showMessage('Solicitação de reserva enviada! Aguarde aprovação do administrador.', 'success');
    
    // Send confirmation (in a real app, this would be an API call)
    sendReservationConfirmation(reservation, property);
}

// Send reservation confirmation
function sendReservationConfirmation(reservation, property) {
    console.log('Sending reservation confirmation:', {
        reservation,
        property,
        broker: currentUser
    });
    
    // In a real application, you would send emails to:
    // 1. Client
    // 2. Broker
    // 3. Admin/Manager
    
    // For now, we'll just log it
    const confirmationData = {
        reservationId: reservation.id,
        property: {
            title: property.title,
            location: property.location,
            price: property.price
        },
        client: reservation.clientInfo,
        broker: {
            name: currentUser.name,
            email: currentUser.email,
            phone: currentUser.phone,
            creci: currentUser.creci
        },
        validUntil: reservation.expiresAt
    };
    
    // Simulate sending confirmation
    setTimeout(() => {
        showMessage('Confirmações enviadas por email para cliente e corretor.', 'success');
    }, 1000);
}

// Setup reservation timer
function setupReservationTimer(reservation) {
    const timeUntilExpiration = reservation.expiresAt.getTime() - Date.now();
    
    if (timeUntilExpiration > 0) {
        setTimeout(() => {
            expireReservation(reservation.id);
        }, timeUntilExpiration);
    }
}

// Expire reservation
function expireReservation(reservationId) {
    const reservation = reservations.find(r => r.id === reservationId);
    if (!reservation || reservation.status !== 'active') {
        return;
    }
    
    // Update reservation status
    reservation.status = 'expired';
    
    // Find and update property
    const property = properties.find(p => p.id === reservation.propertyId);
    if (property) {
        property.status = 'disponivel';
        property.reservedUntil = null;
        property.reservedBy = null;
    }
    
    // Save changes
    localStorage.setItem('reservations', JSON.stringify(reservations));
    localStorage.setItem('properties', JSON.stringify(properties));
    
    // Refresh display if on properties page
    if (document.getElementById('propertiesGrid')) {
        displayProperties(properties);
    }
    
    // Notify if current user made this reservation
    if (currentUser && reservation.brokerId === currentUser.id) {
        showMessage(`A reserva do imóvel "${property?.title}" expirou e o imóvel voltou a ficar disponível.`, 'warning');
    }
    
    console.log('Reservation expired:', reservationId);
}

// Cancel reservation
function cancelReservation(reservationId) {
    const reservation = reservations.find(r => r.id === reservationId);
    if (!reservation) {
        showMessage('Reserva não encontrada.', 'error');
        return;
    }
    
    // Check if user can cancel this reservation
    if (currentUser.id !== reservation.brokerId) {
        showMessage('Você só pode cancelar suas próprias reservas.', 'error');
        return;
    }
    
    if (reservation.status !== 'active') {
        showMessage('Esta reserva não pode ser cancelada.', 'error');
        return;
    }
    
    // Confirm cancellation
    if (!confirm('Tem certeza que deseja cancelar esta reserva?')) {
        return;
    }
    
    // Update reservation status
    reservation.status = 'cancelled';
    reservation.cancelledAt = new Date();
    
    // Find and update property
    const property = properties.find(p => p.id === reservation.propertyId);
    if (property) {
        property.status = 'disponivel';
        property.reservedUntil = null;
        property.reservedBy = null;
    }
    
    // Save changes
    localStorage.setItem('reservations', JSON.stringify(reservations));
    localStorage.setItem('properties', JSON.stringify(properties));
    
    // Refresh display
    displayProperties(properties);
    
    showMessage('Reserva cancelada com sucesso.', 'success');
}

// Get broker reservations
function getBrokerReservations(brokerId = null) {
    const targetBrokerId = brokerId || (currentUser ? currentUser.id : null);
    if (!targetBrokerId) return [];
    
    return reservations.filter(r => r.brokerId === targetBrokerId);
}

// Get active reservations
function getActiveReservations() {
    return reservations.filter(r => r.status === 'active');
}

// Get pending reservations
function getPendingReservations() {
    return reservations.filter(r => r.status === 'pending');
}

// Get all reservations (admin function)
function getAllReservations() {
    return reservations;
}

// Generate reservation ID
function generateReservationId() {
    return 'RES' + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase();
}

// Validate CPF
function isValidCPF(cpf) {
    cpf = cpf.replace(/\D/g, '');
    
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) {
        return false;
    }
    
    let sum = 0;
    for (let i = 0; i < 9; i++) {
        sum += parseInt(cpf.charAt(i)) * (10 - i);
    }
    let checkDigit1 = 11 - (sum % 11);
    if (checkDigit1 > 9) checkDigit1 = 0;
    
    sum = 0;
    for (let i = 0; i < 10; i++) {
        sum += parseInt(cpf.charAt(i)) * (11 - i);
    }
    let checkDigit2 = 11 - (sum % 11);
    if (checkDigit2 > 9) checkDigit2 = 0;
    
    return checkDigit1 === parseInt(cpf.charAt(9)) && checkDigit2 === parseInt(cpf.charAt(10));
}

// Initialize reservation system
function initializeReservationSystem() {
    // Load reservations from localStorage
    const savedReservations = localStorage.getItem('reservations');
    if (savedReservations) {
        reservations = JSON.parse(savedReservations);
        
        // Convert date strings back to Date objects
        reservations.forEach(reservation => {
            reservation.createdAt = new Date(reservation.createdAt);
            reservation.expiresAt = new Date(reservation.expiresAt);
            if (reservation.cancelledAt) {
                reservation.cancelledAt = new Date(reservation.cancelledAt);
            }
        });
    }
    
    // Check for expired reservations
    checkExpiredReservations();
    
    // Set up timers for active reservations
    const activeReservations = getActiveReservations();
    activeReservations.forEach(reservation => {
        setupReservationTimer(reservation);
    });
}

// Check for expired reservations
function checkExpiredReservations() {
    const now = Date.now();
    const activeReservations = getActiveReservations();
    
    activeReservations.forEach(reservation => {
        if (reservation.expiresAt.getTime() <= now) {
            expireReservation(reservation.id);
        }
    });
}

// Format time remaining
function formatTimeRemaining(expiresAt) {
    const now = Date.now();
    const timeLeft = expiresAt.getTime() - now;
    
    if (timeLeft <= 0) {
        return 'Expirada';
    }
    
    const hours = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
        return `${hours}h ${minutes}m restantes`;
    } else {
        return `${minutes}m restantes`;
    }
}

// Show broker dashboard with reservations
function showBrokerDashboard() {
    const brokerReservations = getBrokerReservations();
    const activeReservations = brokerReservations.filter(r => r.status === 'active');
    
    console.log('Broker Dashboard:', {
        broker: currentUser,
        totalReservations: brokerReservations.length,
        activeReservations: activeReservations.length,
        reservations: brokerReservations
    });
    
    // In a real application, you would show a proper dashboard UI
    // For now, we'll just show an alert with the information
    if (activeReservations.length > 0) {
        const reservationsList = activeReservations.map(r => {
            const property = properties.find(p => p.id === r.propertyId);
            return `• ${property?.title} - ${formatTimeRemaining(r.expiresAt)}`;
        }).join('\n');
        
        showMessage(`Você tem ${activeReservations.length} reserva(s) ativa(s):\n${reservationsList}`, 'success');
    } else {
        showMessage('Você não tem reservas ativas no momento.', 'info');
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    initializeReservationSystem();
    
    // Check for expired reservations every minute
    setInterval(checkExpiredReservations, 60000);
});
