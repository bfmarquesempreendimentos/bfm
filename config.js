// Configurações do Sistema de Vendas de Imóveis

var CONFIG = {
    // Informações da Empresa
    company: {
        name: 'B F Marques Empreendimentos',
        email: 'bfmarquesempreendimentos@gmail.com',
        phone: '(21) 99759-0814',
        whatsappSales: '5521997590814',
        whatsappSalesManager: 'Davi',
        address: 'Rio de Janeiro - RJ',
        foundedYear: 2010,
        experience: '15 anos de experiência',
        website: 'www.bfmarquesempreendimentos.com.br',
        siteUrl: 'https://bfmarquesempreendimentos.github.io/bfm',
        social: {
            facebook: '',
            instagram: '',
            linkedin: '',
            youtube: ''
        }
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
        maxLoginAttempts: 5,
        superAdminEmails: ['brunoferreiramarques@gmail.com'],
        adminEmail: 'brunoferreiramarques@gmail.com',
        demoPassword: '123456' // Em produção, altere e considere migrar para Firebase Auth
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
    var keys = key.split('.');
    var value = CONFIG;
    for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
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
    var keys = key.split('.');
    var obj = CONFIG;
    for (var i = 0; i < keys.length - 1; i++) {
        var k = keys[i];
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

// Carregar configurações do localStorage - APENAS chaves seguras (ui, cache, development)
// Evita que auth, security, api e credenciais sejam sobrescritos via DevTools
var ALLOWED_OVERRIDE_KEYS = ['ui', 'cache', 'development'];
if (typeof localStorage !== 'undefined') {
    var savedConfig = localStorage.getItem('siteConfig');
    if (savedConfig) {
        try {
            var parsedConfig = JSON.parse(savedConfig);
            for (var i = 0; i < ALLOWED_OVERRIDE_KEYS.length; i++) {
                var key = ALLOWED_OVERRIDE_KEYS[i];
                if (parsedConfig[key] && typeof parsedConfig[key] === 'object') {
                    for (var k in parsedConfig[key]) {
                        if (Object.prototype.hasOwnProperty.call(parsedConfig[key], k)) {
                            CONFIG[key][k] = parsedConfig[key][k];
                        }
                    }
                }
            }
        } catch (error) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn('Erro ao carregar configurações salvas:', error);
            }
        }
    }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
    window.getConfig = getConfig;
    window.setConfig = setConfig;
}
