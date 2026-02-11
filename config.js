// Configurações do Sistema de Vendas de Imóveis

const CONFIG = {
    // Informações da Empresa
    company: {
        name: 'B F Marques Empreendimentos',
        email: 'bfmarquesempreendimentos@gmail.com',
        phone: '(21) 99555-7010',
        whatsappSales: '5521998035142', // Ex: 5521995557010
        whatsappSalesManager: 'José',
        address: 'Rio de Janeiro - RJ',
        foundedYear: 2010,
        experience: '15 anos de experiência',
        website: 'www.bfmarquesempreendimentos.com.br'
    },
    
    // Configurações de Reserva
    reservations: {
        defaultDurationHours: 48, // 2 dias
        maxReservationsPerBroker: 5,
        allowCancellation: true,
        requireCPF: true,
        sendEmailNotifications: true
    },
    
    // Configurações de Autenticação
    auth: {
        requireEmailVerification: false,
        passwordMinLength: 6,
        sessionTimeoutMinutes: 480, // 8 horas
        maxLoginAttempts: 5
    },
    
    // Configurações de Interface
    ui: {
        itemsPerPage: 12,
        enableAnimations: true,
        showPropertyVideos: true,
        enablePropertyComparison: true,
        defaultCurrency: 'BRL'
    },
    
    // Configurações de Upload
    uploads: {
        maxImageSize: 5 * 1024 * 1024, // 5MB
        maxVideoSize: 50 * 1024 * 1024, // 50MB
        allowedImageTypes: ['jpg', 'jpeg', 'png', 'webp'],
        allowedVideoTypes: ['mp4', 'webm', 'ogg'],
        maxImagesPerProperty: 10,
        maxVideosPerProperty: 3
    },
    
    // Configurações de Notificação
    notifications: {
        showBrowserNotifications: true,
        emailNotifications: true,
        smsNotifications: false,
        notifyOnReservation: true,
        notifyOnExpiration: true,
        notifyOnCancellation: true
    },
    
    // Configurações de Relatórios
    reports: {
        enableExport: true,
        exportFormats: ['csv', 'xlsx', 'pdf'],
        includeCharts: true,
        autoGenerateMonthly: false
    },
    
    // Configurações de SEO
    seo: {
        siteName: 'Construtora Premium - Imóveis de Qualidade',
        siteDescription: 'Encontre o imóvel dos seus sonhos com a Construtora Premium. Apartamentos, casas e coberturas com qualidade e localização privilegiada.',
        keywords: 'imóveis, apartamentos, casas, construtora, venda, Rio de Janeiro',
        ogImage: 'assets/images/og-image.jpg'
    },
    
    // Configurações de Mapa (se implementar)
    maps: {
        apiKey: '', // Substitua pela sua chave do Google Maps
        defaultZoom: 14,
        showPropertyMarkers: true,
        enableStreetView: true
    },
    
    // Configurações de Pagamento (se implementar)
    payments: {
        enableOnlinePayments: false,
        acceptedMethods: ['credit_card', 'bank_transfer', 'pix'],
        currency: 'BRL',
        installmentOptions: [1, 2, 3, 6, 12]
    },
    
    // Configurações de API (se implementar backend)
    api: {
        baseURL: 'https://api.construtorapremium.com',
        timeout: 10000,
        retryAttempts: 3,
        enableCache: true
    },
    
    // Configurações de Analytics
    analytics: {
        enableGoogleAnalytics: false,
        googleAnalyticsId: '', // Substitua pelo seu ID do GA
        trackPropertyViews: true,
        trackReservations: true,
        trackFormSubmissions: true
    },
    
    // Configurações de Cache
    cache: {
        enableLocalStorage: true,
        cacheExpiration: 24 * 60 * 60 * 1000, // 24 horas
        cacheImages: true,
        cacheUserData: true
    },
    
    // Configurações de Segurança
    security: {
        enableCSRFProtection: true,
        sanitizeInputs: true,
        enableRateLimit: true,
        maxRequestsPerMinute: 60
    },
    
    // Configurações de Desenvolvimento
    development: {
        enableDebugMode: false,
        showConsoleErrors: true,
        enablePerformanceMetrics: false,
        mockAPIResponses: true
    }
};

// Função para obter configuração
function getConfig(key) {
    const keys = key.split('.');
    let value = CONFIG;
    
    for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
            value = value[k];
        } else {
            return null;
        }
    }
    
    return value;
}

// Função para definir configuração
function setConfig(key, newValue) {
    const keys = key.split('.');
    let obj = CONFIG;
    
    for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        if (!(k in obj) || typeof obj[k] !== 'object') {
            obj[k] = {};
        }
        obj = obj[k];
    }
    
    obj[keys[keys.length - 1]] = newValue;
    
    // Salvar no localStorage se disponível
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem('siteConfig', JSON.stringify(CONFIG));
    }
}

// Carregar configurações do localStorage se disponível
if (typeof localStorage !== 'undefined') {
    const savedConfig = localStorage.getItem('siteConfig');
    if (savedConfig) {
        try {
            const parsedConfig = JSON.parse(savedConfig);
            Object.assign(CONFIG, parsedConfig);
        } catch (error) {
            console.warn('Erro ao carregar configurações salvas:', error);
        }
    }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
    window.getConfig = getConfig;
    window.setConfig = setConfig;
}
