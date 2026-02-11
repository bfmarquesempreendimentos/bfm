// Sample data initialization for B F Marques Empreendimentos

// Initialize sample documents for properties
function initializeSampleDocuments() {
    // Only add sample data if no documents exist
    const existing = localStorage.getItem('propertyDocuments');
    if (existing && JSON.parse(existing).length > 0) {
        return;
    }
    
    const sampleDocuments = [
        // Porto Novo documents
        {
            id: 'DOC1001',
            propertyId: 1,
            type: 'matricula',
            title: 'Matrícula do Imóvel - Porto Novo',
            description: 'Matrícula completa do condomínio Porto Novo',
            fileName: 'matricula_porto_novo.pdf',
            fileSize: 1024000,
            fileType: 'application/pdf',
            filePath: 'uploads/property_1/matricula_porto_novo.pdf',
            uploadedBy: 'admin',
            uploadedAt: new Date('2024-01-15'),
            isPublic: false,
            requiresApproval: true
        },
        {
            id: 'DOC1002',
            propertyId: 1,
            type: 'planta',
            title: 'Planta Baixa - Porto Novo',
            description: 'Planta baixa das unidades do condomínio',
            fileName: 'planta_porto_novo.pdf',
            fileSize: 2048000,
            fileType: 'application/pdf',
            filePath: 'uploads/property_1/planta_porto_novo.pdf',
            uploadedBy: 'admin',
            uploadedAt: new Date('2024-01-15'),
            isPublic: true,
            requiresApproval: false
        },
        
        // Residencial Itaúna documents
        {
            id: 'DOC2001',
            propertyId: 2,
            type: 'escritura',
            title: 'Escritura - Residencial Itaúna',
            description: 'Escritura do terreno e projeto',
            fileName: 'escritura_nova_cidade.pdf',
            fileSize: 1536000,
            fileType: 'application/pdf',
            filePath: 'uploads/property_2/escritura_nova_cidade.pdf',
            uploadedBy: 'admin',
            uploadedAt: new Date('2024-01-20'),
            isPublic: false,
            requiresApproval: true
        },
        {
            id: 'DOC2002',
            propertyId: 2,
            type: 'habite_se',
            title: 'Habite-se - Residencial Itaúna',
            description: 'Certificado de conclusão da obra',
            fileName: 'habite_se_nova_cidade.pdf',
            fileSize: 512000,
            fileType: 'application/pdf',
            filePath: 'uploads/property_2/habite_se_nova_cidade.pdf',
            uploadedBy: 'admin',
            uploadedAt: new Date('2024-02-01'),
            isPublic: false,
            requiresApproval: true
        },
        
        // Amendoeira documents
        {
            id: 'DOC3001',
            propertyId: 3,
            type: 'registro',
            title: 'Registro do Imóvel - Edifício Amendoeira',
            description: 'Registro completo do edifício',
            fileName: 'registro_amendoeira.pdf',
            fileSize: 1280000,
            fileType: 'application/pdf',
            filePath: 'uploads/property_3/registro_amendoeira.pdf',
            uploadedBy: 'admin',
            uploadedAt: new Date('2024-01-25'),
            isPublic: false,
            requiresApproval: true
        },
        {
            id: 'DOC3002',
            propertyId: 3,
            type: 'condominio',
            title: 'Convenção do Condomínio - Amendoeira',
            description: 'Regras e taxas do condomínio',
            fileName: 'convencao_amendoeira.pdf',
            fileSize: 768000,
            fileType: 'application/pdf',
            filePath: 'uploads/property_3/convencao_amendoeira.pdf',
            uploadedBy: 'admin',
            uploadedAt: new Date('2024-02-05'),
            isPublic: true,
            requiresApproval: false
        }
    ];
    
    localStorage.setItem('propertyDocuments', JSON.stringify(sampleDocuments));
}

// Initialize sample notifications
function initializeSampleNotifications() {
    // Only add if no notifications exist
    const existing = localStorage.getItem('adminNotifications');
    if (existing && JSON.parse(existing).length > 0) {
        return;
    }
    
    const sampleNotifications = [
        {
            id: 'NOT1001',
            type: 'reservation_request',
            title: 'Nova Solicitação de Reserva',
            message: 'João Silva solicitou reserva do imóvel "Condomínio Porto Novo" para o cliente Maria Santos',
            data: {
                reservationId: 'RES1001',
                propertyId: 1,
                brokerId: 1,
                brokerName: 'João Silva',
                propertyTitle: 'Condomínio Porto Novo - Rua Lourival Martins, 31',
                clientName: 'Maria Santos',
                clientCPF: '123.456.789-00',
                clientPhone: '(21) 98765-4321'
            },
            status: 'pending',
            createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
            readAt: null
        },
        {
            id: 'NOT1002',
            type: 'document_request',
            title: 'Solicitação de Documentos',
            message: 'Maria Santos solicitou acesso aos documentos do imóvel "Edifício Amendoeira"',
            data: {
                propertyId: 3,
                brokerId: 2,
                brokerName: 'Maria Santos',
                propertyTitle: 'Edifício Amendoeira - Rua Lopes da Cruz, 136'
            },
            status: 'pending',
            createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
            readAt: null
        }
    ];
    
    localStorage.setItem('adminNotifications', JSON.stringify(sampleNotifications));
}

// Initialize all sample data
function initializeAllSampleData() {
    initializeSampleDocuments();
    initializeSampleNotifications();
}

// Auto-initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Small delay to ensure other systems are loaded
    setTimeout(initializeAllSampleData, 1000);
});

