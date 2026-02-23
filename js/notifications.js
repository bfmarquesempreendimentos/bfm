// Notification system for B F Marques Empreendimentos

// Notification storage
let notifications = [];
let adminNotifications = [];

// Initialize notifications system
document.addEventListener('DOMContentLoaded', function() {
    loadNotifications();
    setupNotificationListeners();
});

// Load notifications from localStorage
function loadNotifications() {
    const savedNotifications = localStorage.getItem('notifications');
    if (savedNotifications) {
        notifications = JSON.parse(savedNotifications);
        notifications.forEach(notification => {
            notification.createdAt = new Date(notification.createdAt);
            if (notification.expiresAt) {
                notification.expiresAt = new Date(notification.expiresAt);
            }
        });
    }
    
    const savedAdminNotifications = localStorage.getItem('adminNotifications');
    if (savedAdminNotifications) {
        adminNotifications = JSON.parse(savedAdminNotifications);
        adminNotifications.forEach(notification => {
            notification.createdAt = new Date(notification.createdAt);
        });
    }
}

// Save notifications to localStorage
function saveNotifications() {
    localStorage.setItem('notifications', JSON.stringify(notifications));
    localStorage.setItem('adminNotifications', JSON.stringify(adminNotifications));
}

// Create notification
function createNotification(type, title, message, data = {}) {
    const notification = {
        id: generateNotificationId(),
        type: type, // 'reservation_request', 'reservation_expiring', 'document_request', 'broker_access'
        title: title,
        message: message,
        data: data,
        status: 'pending', // 'pending', 'approved', 'rejected', 'read'
        createdAt: new Date(),
        readAt: null
    };
    
    if (type === 'reservation_expiring') {
        notification.expiresAt = data.expiresAt;
    }
    
    // Add to admin notifications
    adminNotifications.push(notification);
    saveNotifications();
    
    // Show notification badge
    updateNotificationBadge();
    
    return notification;
}

// Generate notification ID
function generateNotificationId() {
    return 'NOT' + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase();
}

// Create reservation request notification
function createReservationRequestNotification(reservation, property, broker) {
    const title = 'Nova Solicitação de Reserva';
    const message = `${broker.name} solicitou reserva do imóvel "${property.title}" para o cliente ${reservation.clientInfo.name}`;
    
    return createNotification('reservation_request', title, message, {
        reservationId: reservation.id,
        propertyId: property.id,
        brokerId: broker.id,
        brokerName: broker.name,
        propertyTitle: property.title,
        clientName: reservation.clientInfo.name,
        clientCPF: reservation.clientInfo.cpf,
        clientPhone: reservation.clientInfo.phone
    });
}

// Create reservation expiring notification
function createReservationExpiringNotification(reservation, property) {
    const title = 'Reserva Expirando';
    const message = `A reserva do imóvel "${property.title}" expira em breve. Deseja renovar ou liberar?`;
    
    return createNotification('reservation_expiring', title, message, {
        reservationId: reservation.id,
        propertyId: property.id,
        propertyTitle: property.title,
        expiresAt: reservation.expiresAt,
        brokerName: reservation.brokerName
    });
}

// Create document request notification
function createDocumentRequestNotification(propertyId, brokerId, brokerName, propertyTitle) {
    const title = 'Solicitação de Documentos';
    const message = `${brokerName} solicitou acesso aos documentos do imóvel "${propertyTitle}"`;
    
    return createNotification('document_request', title, message, {
        propertyId: propertyId,
        brokerId: brokerId,
        brokerName: brokerName,
        propertyTitle: propertyTitle
    });
}

// Create broker access notification
function createBrokerAccessNotification(brokerId, brokerName) {
    const title = 'Solicitação de Acesso';
    const message = `${brokerName} está solicitando acesso ao sistema`;
    
    return createNotification('broker_access', title, message, {
        brokerId: brokerId,
        brokerName: brokerName
    });
}

// Update notification badge
function updateNotificationBadge() {
    const pendingCount = adminNotifications.filter(n => n.status === 'pending').length;
    const badge = document.getElementById('notificationBadge');
    
    if (badge) {
        if (pendingCount > 0) {
            badge.textContent = pendingCount;
            badge.style.display = 'inline';
        } else {
            badge.style.display = 'none';
        }
    }
}

// Mark notification as read
function markNotificationAsRead(notificationId) {
    const notification = adminNotifications.find(n => n.id === notificationId);
    if (notification && notification.status === 'pending') {
        notification.status = 'read';
        notification.readAt = new Date();
        saveNotifications();
        updateNotificationBadge();
    }
}

// Approve reservation request
async function approveReservationRequest(notificationId) {
    const notification = adminNotifications.find(n => n.id === notificationId);
    if (!notification || notification.type !== 'reservation_request') {
        return false;
    }
    
    const reservation = reservations.find(r => r.id === notification.data.reservationId);
    const property = properties.find(p => p.id === notification.data.propertyId);
    
    if (reservation && property) {
        // Approve reservation
        reservation.status = 'active';
        reservation.approvedAt = new Date();
        reservation.approvedBy = 'admin';
        
        // Update property status
        property.status = 'reservado';
        property.reservedUntil = reservation.expiresAt;
        property.reservedBy = notification.data.brokerName;
        
        // Update notification
        notification.status = 'approved';
        notification.approvedAt = new Date();
        
        // Save changes
        saveNotifications();
        localStorage.setItem('reservations', JSON.stringify(reservations));
        localStorage.setItem('properties', JSON.stringify(properties));
        
        // Setup expiration notification
        setupExpirationNotification(reservation);
        
        // Enviar email ao corretor (solicitante)
        const broker = typeof findBrokerById === 'function' ? findBrokerById(notification.data.brokerId) : null;
        if (broker && broker.email && typeof sendEmail === 'function') {
            const siteUrl = (typeof CONFIG !== 'undefined' && CONFIG?.company?.siteUrl) || 'https://bfmarquesempreendimentos.github.io/bfm';
            const subject = 'Reserva Aprovada - B F Marques Empreendimentos';
            const body = `
                <h2>Olá, ${broker.name}!</h2>
                <p>Sua solicitação de reserva do imóvel <strong>"${property.title}"</strong> para o cliente ${reservation.clientInfo.name} foi <strong>aprovada</strong>.</p>
                <p>A reserva está ativa. Atenção ao prazo de validade.</p>
                <p><a href="${siteUrl}" style="display:inline-block;background:#22c55e;color:white;padding:10px 20px;text-decoration:none;border-radius:8px;font-weight:bold;margin:10px 0;">Acessar o Site</a></p>
                <p><small>Ou acesse: <a href="${siteUrl}">${siteUrl}</a></small></p>
                <p>Atenciosamente,<br><strong>B F Marques Empreendimentos</strong></p>
            `;
            try { await sendEmail(broker.email, subject, body); } catch (e) { console.error('Erro ao enviar email de aprovação:', e); }
        }
        
        showMessage('Reserva aprovada com sucesso!', 'success');
        return true;
    }
    
    return false;
}

// Reject reservation request
function rejectReservationRequest(notificationId, reason = '') {
    const notification = adminNotifications.find(n => n.id === notificationId);
    if (!notification || notification.type !== 'reservation_request') {
        return false;
    }
    
    const reservation = reservations.find(r => r.id === notification.data.reservationId);
    const property = properties.find(p => p.id === notification.data.propertyId);
    
    if (reservation && property) {
        // Reject reservation
        reservation.status = 'rejected';
        reservation.rejectedAt = new Date();
        reservation.rejectedBy = 'admin';
        reservation.rejectionReason = reason;
        
        // Keep property available
        property.status = 'disponivel';
        property.reservedUntil = null;
        property.reservedBy = null;
        
        // Update notification
        notification.status = 'rejected';
        notification.rejectedAt = new Date();
        notification.rejectionReason = reason;
        
        // Save changes
        saveNotifications();
        localStorage.setItem('reservations', JSON.stringify(reservations));
        localStorage.setItem('properties', JSON.stringify(properties));
        
        showMessage('Reserva rejeitada.', 'warning');
        return true;
    }
    
    return false;
}

// Setup expiration notification
function setupExpirationNotification(reservation) {
    const timeUntilExpiration = reservation.expiresAt.getTime() - Date.now();
    const notificationTime = timeUntilExpiration - (2 * 60 * 60 * 1000); // 2 hours before expiration
    
    if (notificationTime > 0) {
        setTimeout(() => {
            const property = properties.find(p => p.id === reservation.propertyId);
            if (property && reservation.status === 'active') {
                createReservationExpiringNotification(reservation, property);
            }
        }, notificationTime);
    }
}

// Handle reservation expiration decision
function handleReservationExpiration(notificationId, decision) {
    const notification = adminNotifications.find(n => n.id === notificationId);
    if (!notification || notification.type !== 'reservation_expiring') {
        return false;
    }
    
    const reservation = reservations.find(r => r.id === notification.data.reservationId);
    const property = properties.find(p => p.id === notification.data.propertyId);
    
    if (reservation && property) {
        if (decision === 'extend') {
            // Extend reservation for another 48 hours
            reservation.expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
            property.reservedUntil = reservation.expiresAt;
            
            // Setup new expiration notification
            setupExpirationNotification(reservation);
            
            showMessage('Reserva estendida por mais 48 horas.', 'success');
        } else {
            // Expire reservation
            reservation.status = 'expired';
            reservation.expiredAt = new Date();
            
            // Make property available
            property.status = 'disponivel';
            property.reservedUntil = null;
            property.reservedBy = null;
        }
        
        // Update notification
        notification.status = decision === 'extend' ? 'approved' : 'read';
        notification.handledAt = new Date();
        
        // Save changes
        saveNotifications();
        localStorage.setItem('reservations', JSON.stringify(reservations));
        localStorage.setItem('properties', JSON.stringify(properties));
        
        return true;
    }
    
    return false;
}

// Approve document access
async function approveDocumentAccess(notificationId) {
    const notification = adminNotifications.find(n => n.id === notificationId);
    if (!notification || notification.type !== 'document_request') {
        return false;
    }
    
    // Grant document access
    const documentAccess = {
        id: generateDocumentAccessId(),
        propertyId: notification.data.propertyId,
        brokerId: notification.data.brokerId,
        grantedAt: new Date(),
        grantedBy: 'admin',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days access
    };
    
    // Save document access
    let documentAccesses = JSON.parse(localStorage.getItem('documentAccesses') || '[]');
    documentAccesses.push(documentAccess);
    localStorage.setItem('documentAccesses', JSON.stringify(documentAccesses));
    
    // Update notification
    notification.status = 'approved';
    notification.approvedAt = new Date();
    
    saveNotifications();
    
    // Enviar email ao corretor (solicitante)
    const broker = typeof findBrokerById === 'function' ? findBrokerById(notification.data.brokerId) : null;
    const propertyTitle = notification.data.propertyTitle || 'imóvel';
    if (broker && broker.email && typeof sendEmail === 'function') {
        const siteUrl = (typeof CONFIG !== 'undefined' && CONFIG?.company?.siteUrl) || 'https://bfmarquesempreendimentos.github.io/bfm';
        const subject = 'Acesso a Documentos Aprovado - B F Marques Empreendimentos';
        const body = `
            <h2>Olá, ${broker.name}!</h2>
            <p>Sua solicitação de acesso aos documentos do imóvel <strong>"${propertyTitle}"</strong> foi <strong>aprovada</strong>.</p>
            <p>O acesso está liberado por 7 dias.</p>
            <p><a href="${siteUrl}" style="display:inline-block;background:#22c55e;color:white;padding:10px 20px;text-decoration:none;border-radius:8px;font-weight:bold;margin:10px 0;">Acessar o Site</a></p>
            <p><small>Ou acesse: <a href="${siteUrl}">${siteUrl}</a></small></p>
            <p>Atenciosamente,<br><strong>B F Marques Empreendimentos</strong></p>
        `;
        try { await sendEmail(broker.email, subject, body); } catch (e) { console.error('Erro ao enviar email de aprovação:', e); }
    }
    
    showMessage('Acesso aos documentos aprovado por 7 dias.', 'success');
    
    return true;
}

// Generate document access ID
function generateDocumentAccessId() {
    return 'DOC' + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase();
}

// Check if broker has document access
function hasBrokerDocumentAccess(brokerId, propertyId) {
    const documentAccesses = JSON.parse(localStorage.getItem('documentAccesses') || '[]');
    
    const access = documentAccesses.find(access => 
        access.brokerId === brokerId && 
        access.propertyId === propertyId &&
        new Date(access.expiresAt) > new Date()
    );
    
    return access !== undefined;
}

// Get all notifications for admin
function getAdminNotifications(status = null) {
    if (status) {
        return adminNotifications.filter(n => n.status === status);
    }
    return adminNotifications;
}

// Get pending notifications count
function getPendingNotificationsCount() {
    return adminNotifications.filter(n => n.status === 'pending').length;
}

// Setup notification listeners
function setupNotificationListeners() {
    // Check for expiring reservations every hour
    setInterval(checkForExpiringReservations, 60 * 60 * 1000);
    
    // Update notification badge on page load
    updateNotificationBadge();
}

// Check for expiring reservations
function checkForExpiringReservations() {
    const activeReservations = reservations.filter(r => r.status === 'active');
    const now = Date.now();
    const twoHoursFromNow = now + (2 * 60 * 60 * 1000);
    
    activeReservations.forEach(reservation => {
        const expirationTime = new Date(reservation.expiresAt).getTime();
        
        // If reservation expires within 2 hours and no notification sent yet
        if (expirationTime <= twoHoursFromNow && expirationTime > now) {
            const existingNotification = adminNotifications.find(n => 
                n.type === 'reservation_expiring' && 
                n.data.reservationId === reservation.id &&
                n.status === 'pending'
            );
            
            if (!existingNotification) {
                const property = properties.find(p => p.id === reservation.propertyId);
                if (property) {
                    createReservationExpiringNotification(reservation, property);
                }
            }
        }
    });
}

