// Main JavaScript file for Construtora Premium website

// Global variables
let currentUser = null;
let properties = [];
let reservations = [];
let currentGalleryImages = [];
let currentGalleryIndex = 0;
let currentGalleryMedia = [];
let currentGalleryMediaIndex = 0;
const propertyMediaOverrides = {
    3: {
        images: [
            'assets/images/amendoeiras/amendoeiras-08.jpg',
            'assets/images/amendoeiras/amendoeiras-07.jpg',
            'assets/images/amendoeiras/amendoeiras-01.jpg',
            'assets/images/amendoeiras/amendoeiras-02.jpg',
            'assets/images/amendoeiras/amendoeiras-03.jpg',
            'assets/images/amendoeiras/amendoeiras-04.jpg',
            'assets/images/amendoeiras/amendoeiras-05.jpg',
            'assets/images/amendoeiras/amendoeiras-06.jpg'
        ],
        videos: [
            'assets/videos/amendoeiras/amendoeiras-01.mp4',
            'assets/videos/amendoeiras/amendoeiras-02.mp4',
            'assets/videos/amendoeiras/amendoeiras-03.mp4'
        ]
    }
};

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    loadProperties();
    checkUserSession();
    setupEventListeners();
    setupScrollEffects();
    setupWhatsAppLinks();
}

function getPropertyMediaOverride(propertyId) {
    return propertyMediaOverrides[propertyId] || null;
}

// Setup event listeners
function setupEventListeners() {
    // Filter listeners
    const typeFilter = document.getElementById('typeFilter');
    const statusFilter = document.getElementById('statusFilter');
    const priceFilter = document.getElementById('priceFilter');
    
    if (typeFilter) typeFilter.addEventListener('change', filterProperties);
    if (statusFilter) statusFilter.addEventListener('change', filterProperties);
    if (priceFilter) priceFilter.addEventListener('input', filterProperties);
    
    // Contact form
    const contactForm = document.querySelector('.contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', handleContactForm);
    }
    
    // Modal close on outside click
    window.addEventListener('click', function(event) {
        const loginModal = document.getElementById('loginModal');
        const propertyModal = document.getElementById('propertyModal');
        
        if (event.target === loginModal) {
            closeLoginModal();
        }
        if (event.target === propertyModal) {
            closePropertyModal();
        }
    });

    // Close mobile menu on nav link or action click
    document.querySelectorAll('.nav-menu a, .nav-actions button, .nav-actions a').forEach(el => {
        el.addEventListener('click', closeMobileMenu);
    });
}

// Mobile menu toggle
function toggleMobileMenu() {
    document.body.classList.toggle('mobile-menu-open');
    const hamburger = document.querySelector('.nav-hamburger i');
    if (hamburger) {
        hamburger.classList.toggle('fa-bars');
        hamburger.classList.toggle('fa-times');
    }
}
function closeMobileMenu() {
    document.body.classList.remove('mobile-menu-open');
    const hamburger = document.querySelector('.nav-hamburger i');
    if (hamburger) {
        hamburger.classList.remove('fa-times');
        hamburger.classList.add('fa-bars');
    }
}

// Smooth scrolling
function scrollToSection(sectionId) {
    const element = document.getElementById(sectionId);
    if (element) {
        element.scrollIntoView({ 
            behavior: 'smooth',
            block: 'start'
        });
    }
}

// Setup scroll effects
function setupScrollEffects() {
    // Header background on scroll
    window.addEventListener('scroll', function() {
        const header = document.querySelector('.header');
        if (!header) return;
        const hero = document.querySelector('.hero');
        const trigger = hero ? hero.offsetHeight - 80 : 120;
        header.classList.toggle('scrolled', window.scrollY > trigger);
    });
    
    // Intersection Observer for animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);
    
    // Observe elements for animation
    document.querySelectorAll('.property-card, .about-text, .contact-item').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'all 0.6s ease';
        observer.observe(el);
    });
}

function setupWhatsAppLinks() {
    const salesNumber = (window.CONFIG && CONFIG.company && CONFIG.company.whatsappSales)
        ? CONFIG.company.whatsappSales
        : null;
    if (!salesNumber) return;

    document.querySelectorAll('[data-whatsapp]').forEach(link => {
        const message = link.getAttribute('data-whatsapp-message') || '';
        const encoded = encodeURIComponent(message);
        link.setAttribute('href', `https://wa.me/${salesNumber}?text=${encoded}`);
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener');
    });
}

// Load and display properties
function loadProperties() {
    // B F Marques Empreendimentos - Real property data
    properties = [
        {
            id: 1,
            title: 'Condomínio Porto Novo - Rua Lourival Martins, 31',
            type: 'apartamento',
            location: 'Porto Novo, Rio de Janeiro - RJ',
            address: 'Rua Lourival Martins, 31, Porto Novo, Rio de Janeiro - RJ',
            mapsUrl: 'https://maps.app.goo.gl/FmuFKNprhngr2hGG9',
            price: 150000,
            bedrooms: 1,
            bathrooms: 1,
            area: 50,
            parking: 0,
            status: 'disponivel',
            images: [
                'assets/images/porto-novo/IMG_2689.jpg',
                'assets/images/porto-novo/IMG_2677.jpg',
                'assets/images/porto-novo/IMG_2673.jpg',
                'assets/images/porto-novo/IMG_2687.jpg',
                'assets/images/porto-novo/IMG_2680.jpg',
                'assets/images/porto-novo/IMG_2678.jpg',
                'assets/images/porto-novo/IMG_2690.jpg',
                'assets/images/porto-novo/IMG_2676.jpg'
            ],
            videos: [],
            description: 'Apartamentos modernos no Condomínio Porto Novo com opções de 1 e 2 quartos. Unidades sem vaga de garagem, ideais para quem busca praticidade e localização estratégica. Acabamento de qualidade com pisos cerâmicos, janelas com grades de segurança e boa ventilação natural.',
            features: ['Apartamentos de 1 e 2 quartos', 'Sem vaga de garagem', 'Acabamento moderno', 'Pisos cerâmicos', 'Grades de segurança', 'Boa ventilação', 'Localização estratégica', 'Fácil acesso ao transporte', 'Próximo ao comércio'],
            reservedUntil: null,
            reservedBy: null,
            matricula: '51.881 a 51.894',
            engineeringValue: 'R$ 162.906,09 a R$ 226.100,00'
        },
        {
            id: 2,
            title: 'Residencial Itaúna - Rua Alcio Souto',
            type: 'casa',
            location: 'Nova Cidade, Rio de Janeiro - RJ',
            address: 'Rua Alcio Souto, 348, Nova Cidade, Rio de Janeiro - RJ',
            mapsUrl: 'https://maps.app.goo.gl/gyF6ERJs1rrKHkbZ9',
            price: 155000,
            bedrooms: 1,
            bathrooms: 1,
            area: null,
            parking: 0,
            status: 'disponivel',
            images: [
                'assets/images/residencial-itauna/itauna-03.jpg',
                'assets/images/residencial-itauna/itauna-01.jpg',
                'assets/images/residencial-itauna/itauna-02.jpg',
                'assets/images/residencial-itauna/itauna-04.jpg',
                'assets/images/residencial-itauna/itauna-05.jpg',
                'assets/images/residencial-itauna/itauna-06.jpg',
                'assets/images/residencial-itauna/itauna-07.jpg',
                'assets/images/residencial-itauna/itauna-08.jpg',
                'assets/images/residencial-itauna/itauna-09.jpg'
            ],
            videos: [],
            description: 'Casas no Residencial Itaúna com opções de 1 quarto. Empreendimento moderno com acabamento de qualidade, ideal para primeira moradia ou investimento. Localização com boa infraestrutura urbana.',
            features: ['Casas de 1 Quarto', 'Acabamento Moderno', 'Boa Localização', 'Cozinha Planejada', 'Banheiro Social'],
            reservedUntil: null,
            reservedBy: null
        },
        {
            id: 3,
            title: 'Edifício Amendoeiras - Rua Lopes da Cruz, 136',
            type: 'apartamento',
            location: 'Amendoeira, Rio de Janeiro - RJ',
            address: 'Rua Lopes da Cruz, 136, Amendoeira, Rio de Janeiro - RJ',
            mapsUrl: 'https://maps.app.goo.gl/i3eExj2Wk3vD2xQNA',
            price: 160000,
            bedrooms: 1,
            bathrooms: 1,
            area: 45,
            parking: 0,
            status: 'disponivel',
            images: propertyMediaOverrides[3].images,
            videos: propertyMediaOverrides[3].videos,
            description: 'Apartamentos no Edifício Amendoeira com 20 unidades disponíveis (101 a 210). Apartamentos de 1 quarto com excelente aproveitamento de espaço. Prédio moderno em localização privilegiada com fácil acesso ao comércio e transporte.',
            features: ['20 Unidades Disponíveis', '1 Quarto', 'Área de Serviço', 'Localização Central', 'Próximo ao Comércio'],
            reservedUntil: null,
            reservedBy: null
        },
        {
            id: 4,
            title: 'Condomínio Laranjal - Rua Jussara, 178',
            type: 'casa',
            location: 'Laranjal, Rio de Janeiro - RJ',
            address: 'Rua Jussara, 178, Laranjal, Rio de Janeiro - RJ',
            mapsUrl: 'https://maps.app.goo.gl/sjoAjX93gB5aN8EV6',
            price: 145000,
            bedrooms: 1,
            bathrooms: 1,
            area: 48,
            parking: 1,
            status: 'disponivel',
            images: [
                'assets/images/laranjal/laranjal-01.jpg',
                'assets/images/laranjal/laranjal-02.jpg',
                'assets/images/laranjal/laranjal-03.jpg',
                'assets/images/laranjal/laranjal-04.jpg'
            ],
            videos: [],
            description: 'Casas no Condomínio Laranjal com 15 unidades disponíveis. Empreendimento familiar em bairro tranquilo, ideal para quem busca qualidade de vida e segurança.',
            features: ['15 Unidades', 'Casa Base a 14 Quartos', 'Condomínio Fechado', 'Bairro Tranquilo', 'Cozinha'],
            reservedUntil: null,
            reservedBy: null
        },
        {
            id: 5,
            title: 'Residencial Apolo - Itaboraí',
            type: 'casa',
            location: 'Apolo, Itaboraí - RJ',
            address: 'Rua Maria José Arruda Barbosa, LT 02 QD 18, Apolo, Itaboraí - RJ',
            mapsUrl: 'https://www.google.com/maps?q=Rua+Maria+Jos%C3%A9+Arruda+Barbosa+LT+02+QD+18+Apolo+Itabora%C3%AD',
            price: 135000,
            bedrooms: 1,
            bathrooms: 1,
            area: 42,
            parking: 0,
            status: 'disponivel',
            images: [
                'assets/images/apolo/apolo-01.jpg',
                'assets/images/apolo/apolo-02.jpg',
                'assets/images/apolo/apolo-03.jpg',
                'assets/images/apolo/apolo-04.jpg',
                'assets/images/apolo/apolo-05.jpg',
                'assets/images/apolo/apolo-06.jpg',
                'assets/images/apolo/apolo-07.jpg',
                'assets/images/apolo/apolo-08.jpg',
                'assets/images/apolo/apolo-09.jpg',
                'assets/images/apolo/apolo-10.jpg',
                'assets/images/apolo/apolo-11.jpg',
                'assets/images/apolo/apolo-12.jpg',
                'assets/images/apolo/apolo-13.jpg'
            ],
            videos: [
                'assets/videos/apolo/apolo-01.mp4'
            ],
            description: 'Casas no Residencial Apolo em Itaboraí. Empreendimento em região de crescimento, ideal para investimento. Ótimo custo-benefício para primeira moradia.',
            features: ['Região em Crescimento', 'Ótimo Custo-Benefício', 'Área de Serviço', 'Cozinha', 'Quintal', 'Boa Ventilação'],
            reservedUntil: null,
            reservedBy: null
        },
        {
            id: 6,
            title: 'Residencial Coelho - Rua Dr. Lopes da Cruz',
            type: 'casa',
            location: 'Coelho, Rio de Janeiro - RJ',
            address: 'Rua Lopes da Cruz, 122, Coelho, Rio de Janeiro - RJ',
            mapsUrl: 'https://maps.app.goo.gl/XBHZuNsdxTTVmnw66',
            price: 145000,
            bedrooms: 1,
            bathrooms: 1,
            area: 45,
            parking: 0,
            status: 'disponivel',
            images: [
                'assets/images/coelho/coelho-07.jpg',
                'assets/images/coelho/coelho-03.jpg',
                'assets/images/coelho/coelho-08.jpg',
                'assets/images/coelho/coelho-01.jpg',
                'assets/images/coelho/coelho-02.jpg',
                'assets/images/coelho/coelho-04.jpg',
                'assets/images/coelho/coelho-05.jpg',
                'assets/images/coelho/coelho-06.jpg'
            ],
            videos: [
                'assets/videos/coelho/coelho-01.mp4'
            ],
            description: 'Casas no Residencial Coelho. Empreendimento com excelente padrão de acabamento, localizado em área de fácil acesso. Ideal para famílias que buscam segurança e comodidade.',
            features: ['Condomínio Seguro', 'Bom Acabamento', 'Fácil Acesso', 'Cozinha Funcional', 'Área Externa'],
            reservedUntil: null,
            reservedBy: null,
            engineeringValue: 'R$ 165.336,19 a R$ 199.100,00'
        },
        {
            id: 7,
            title: 'Edifício Caçador - Rua Alcio Souto, 576',
            type: 'apartamento',
            location: 'Luiz Caçador, Rio de Janeiro - RJ',
            address: 'Rua Alcio Souto, 576, Luiz Caçador, Rio de Janeiro - RJ',
            mapsUrl: 'https://maps.app.goo.gl/N4CNvNQwx1KWBFCH6',
            price: 160000,
            bedrooms: 1,
            bathrooms: 1,
            area: 58,
            parking: 0,
            status: 'disponivel',
            images: [
                'assets/images/cacador/cacador-02.jpg',
                'assets/images/cacador/cacador-01.jpg',
                'assets/images/cacador/cacador-03.jpg',
                'assets/images/cacador/cacador-04.jpg',
                'assets/images/cacador/cacador-05.jpg',
                'assets/images/cacador/cacador-06.jpg',
                'assets/images/cacador/cacador-07.jpg',
                'assets/images/cacador/cacador-08.jpg'
            ],
            videos: [
                'assets/videos/cacador/cacador-01.mp4'
            ],
            description: 'Apartamentos no Edifício Caçador com 20 unidades disponíveis (101 a 210). Apartamentos de 1 quarto em prédio moderno. Excelente localização com infraestrutura completa no entorno.',
            features: ['20 Apartamentos', '1 Quarto', 'Prédio Moderno', 'Área de Serviço', 'Boa Localização'],
            reservedUntil: null,
            reservedBy: null
        },
        {
            id: 8,
            title: 'Casa Luxo Maricá',
            type: 'casa condominio',
            location: 'Maricá, Rio de Janeiro - RJ',
            address: 'Rua Irineu Ferreira Pinto, nº 374, Ponta Grossa, Maricá - RJ, CEP 24914-345',
            mapsUrl: 'https://www.google.com/maps?q=Rua%20Irineu%20Ferreira%20Pinto%2C%20374%2C%20Ponta%20Grossa%2C%20Maric%C3%A1%20-%20RJ%2C%20CEP%2024914-345',
            price: 1180000,
            bedrooms: 3,
            bathrooms: 3,
            area: 360,
            showArea: true,
            parking: 5,
            status: 'disponivel',
            images: [
                'assets/images/marica/foto1.jpeg',
                'assets/images/marica/marica-01.jpg',
                'assets/images/marica/marica-02.jpg',
                'assets/images/marica/marica-03.jpg',
                'assets/images/marica/marica-04.jpg',
                'assets/images/marica/marica-05.jpg',
                'assets/images/marica/marica-06.jpg',
                'assets/images/marica/marica-07.jpg',
                'assets/images/marica/marica-08.jpg',
                'assets/images/marica/marica-09.jpg',
                'assets/images/marica/marica-10.jpg',
                'assets/images/marica/marica-11.jpg',
                'assets/images/marica/marica-12.jpg',
                'assets/images/marica/marica-13.jpg',
                'assets/images/marica/marica-14.jpg',
                'assets/images/marica/marica-15.jpg',
                'assets/images/marica/marica-16.jpg',
                'assets/images/marica/marica-17.jpg',
                'assets/images/marica/marica-18.jpg',
                'assets/images/marica/marica-19.jpg',
                'assets/images/marica/marica-20.jpg',
                'assets/images/marica/marica-21.jpg',
                'assets/images/marica/marica-22.jpg',
                'assets/images/marica/marica-23.jpg',
                'assets/images/marica/marica-24.jpg',
                'assets/images/marica/marica-25.jpg',
                'assets/images/marica/marica-26.jpg',
                'assets/images/marica/marica-27.jpg',
                'assets/images/marica/marica-28.jpg',
                'assets/images/marica/marica-29.jpg',
                'assets/images/marica/marica-30.jpg',
                'assets/images/marica/marica-31.jpg',
                'assets/images/marica/marica-32.jpg',
                'assets/images/marica/marica-33.jpg'
            ],
            videos: [
                'assets/videos/marica/marica-01.mp4',
                'assets/videos/marica/marica-02.mp4'
            ],
            description: 'Casa de luxo no condomínio Elisa Beach, com lagoa, quadras de esporte, piscina, bosque, quadra de tênis, campo de futebol, parque infantil, salão de festas e academia. Casa moderna em Maricá com 3 suítes. Empreendimento de alto padrão com acabamento diferenciado, garagem coberta e localização privilegiada próxima às praias de Maricá. Ideal para quem busca qualidade de vida e investimento seguro.',
            features: ['3 Suítes', 'Piscina', 'Churrasqueira', 'Área Gourmet', 'Quintal', 'Portão Eletrônico', 'Localização Privilegiada', 'Alto Padrão'],
            reservedUntil: null,
            reservedBy: null
        }
    ];
    
    setTimeout(() => displayProperties(properties), 0);
    startHeroSlideshow(properties);
}

function startHeroSlideshow(list) {
    const container = document.getElementById('heroSlideshow');
    const dotsContainer = document.getElementById('heroDots');
    if (!container) return;
    
    const images = [];
    (list || []).forEach(item => {
        if (Array.isArray(item.images)) {
            item.images.slice(0, 2).forEach(img => images.push(img));
        }
    });
    if (images.length > 12) images.length = 12;
    if (images.length === 0) {
        images.push('assets/images/hero/hero-house.jpg.jpeg');
    }
    
    container.innerHTML = '';
    images.forEach((src, i) => {
        const slide = document.createElement('div');
        slide.className = 'hero-slide' + (i === 0 ? ' active' : '');
        slide.setAttribute('data-index', i);
        slide.innerHTML = `<img src="${src}" alt="Empreendimento ${i + 1}" loading="${i < 2 ? 'eager' : 'lazy'}">`;
        container.appendChild(slide);
    });
    
    if (dotsContainer && images.length > 1) {
        dotsContainer.innerHTML = '';
        images.forEach((_, i) => {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.className = 'hero-dot' + (i === 0 ? ' active' : '');
            dot.setAttribute('aria-label', `Foto ${i + 1} de ${images.length}`);
            dot.onclick = () => goToSlide(i);
            dotsContainer.appendChild(dot);
        });
    }
    
    let index = 0;
    let touchStartX = 0;
    let touchEndX = 0;
    
    function goToSlide(i) {
        index = ((i % images.length) + images.length) % images.length;
        container.querySelectorAll('.hero-slide').forEach((s, j) => s.classList.toggle('active', j === index));
        dotsContainer?.querySelectorAll('.hero-dot').forEach((d, j) => d.classList.toggle('active', j === index));
    }
    
    container.addEventListener('touchstart', e => { touchStartX = e.changedTouches?.[0]?.screenX ?? 0; }, { passive: true });
    container.addEventListener('touchend', e => {
        touchEndX = e.changedTouches?.[0]?.screenX ?? 0;
        const diff = touchStartX - touchEndX;
        if (Math.abs(diff) > 50) goToSlide(index + (diff > 0 ? 1 : -1));
    }, { passive: true });

    function onKeyDown(e) {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
        e.preventDefault();
        if (e.key === 'ArrowLeft') goToSlide(index - 1);
        else goToSlide(index + 1);
    }
    document.addEventListener('keydown', onKeyDown);
    window._heroSlideshowCleanup = () => document.removeEventListener('keydown', onKeyDown);

    window.goToSlide = goToSlide;

    setInterval(() => {
        goToSlide(index + 1);
    }, 6000);
}

// Display properties in the grid
function displayProperties(propertiesToShow) {
    const grid = document.getElementById('propertiesGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    if (propertiesToShow.length === 0) {
        grid.innerHTML = '<div class="no-properties">Nenhum imóvel encontrado com os filtros selecionados.</div>';
        return;
    }
    
    propertiesToShow.forEach(property => {
        const propertyCard = createPropertyCard(property);
        grid.appendChild(propertyCard);
    });
}

// Create property card element
function createPropertyCard(property) {
    const card = document.createElement('div');
    card.className = property.id === 3 ? 'property-card property-card--amendoeiras' : 'property-card';
    card.onclick = () => showPropertyDetails(property.id);
    
    const brokerView = typeof isBroker === 'function' ? isBroker() : false;
    const isAdminUser = !!localStorage.getItem('adminUser');
    const canViewFullDetails = brokerView || isAdminUser;
    const statusClass = `status-${property.status}`;
    const statusText = {
        'disponivel': 'Disponível',
        'reservado': 'Reservado',
        'vendido': 'Vendido'
    };
    
    const reserveButton = property.status === 'disponivel' 
        ? `<button class="btn-reserve" onclick="event.stopPropagation(); handleRestrictedAction('reserve', ${property.id})">Reservar</button>`
        : `<button class="btn-reserve" disabled>${statusText[property.status]}</button>`;
    
    const mediaOverride = getPropertyMediaOverride(property.id);
    const images = mediaOverride?.images || (Array.isArray(property.images) ? property.images : []);
    const mainImage = images.length > 0 ? images[0] : 'assets/images/placeholder.jpg';
    
    const highlight = getPropertyHighlight(property.id);
    
    const pricePrefix = property.title === 'Casa Luxo Maricá'
        ? ''
        : '<span class="price-prefix">À partir de:</span>';

    card.innerHTML = `
        <div class="property-image">
            <img src="${mainImage}" alt="${property.title}" onerror="this.src='assets/images/placeholder.jpg'">
            ${brokerView ? `<div class="property-status ${statusClass}">${statusText[property.status]}</div>` : ''}
            ${highlight ? `<div class="property-highlight ${highlight.className}">${highlight.text}</div>` : ''}
        </div>
        <div class="property-info">
            <h3 class="property-title">${property.title}</h3>
            <div class="property-location">
                <i class="fas fa-map-marker-alt"></i>
                ${property.location}
            </div>
            <div class="property-features">
                <div class="feature">
                    <i class="fas fa-bed"></i>
                    ${property.bedrooms} quartos
                </div>
                <div class="feature">
                    <i class="fas fa-bath"></i>
                    ${property.bathrooms} banheiros
                </div>
            </div>
            <div class="property-price">
                ${pricePrefix}
                R$ ${property.price.toLocaleString('pt-BR')}
            </div>
            <div class="property-actions">
                ${reserveButton}
                <button class="btn-details" onclick="event.stopPropagation(); handleRestrictedAction('details', ${property.id})">
                    Ver Detalhes
                </button>
                <button class="btn-documents" onclick="event.stopPropagation(); handleRestrictedAction('docs', ${property.id})">
                    <i class="fas fa-file-alt"></i> Docs
                </button>
            </div>
        </div>
    `;
    
    return card;
}

function getPropertyHighlight(propertyId) {
    if (typeof getPropertyUnits !== 'function') return null;
    
    const data = getPropertyUnits(propertyId);
    if (!data || !Array.isArray(data.units) || data.units.length === 0) return null;
    
    const total = data.units.length;
    const remaining = data.units.filter(unit => unit.status === 'disponivel').length;
    const soldPercent = (total - remaining) / total;
    
    if (remaining === 1) {
        return { text: 'Última unidade', className: 'highlight-last' };
    }
    if (remaining === 2) {
        return { text: 'Últimas 2 unidades', className: 'highlight-low' };
    }
    if (soldPercent >= 0.8) {
        return { text: '80% vendido', className: 'highlight-80' };
    }
    
    return null;
}

// Filter properties
function filterProperties() {
    const typeFilter = document.getElementById('typeFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    const priceFilter = parseFloat(document.getElementById('priceFilter').value) || Infinity;
    
    const filtered = properties.filter(property => {
        const matchesType = !typeFilter || property.type === typeFilter;
        const matchesStatus = !statusFilter || property.status === statusFilter;
        const matchesPrice = property.price <= priceFilter;
        
        return matchesType && matchesStatus && matchesPrice;
    });
    
    displayProperties(filtered);
}

// Show property details modal
function showPropertyDetails(propertyId) {
    const property = properties.find(p => p.id === propertyId);
    if (!property) return;
    
    const brokerView = typeof isBroker === 'function' ? isBroker() : false;
    const mediaOverride = getPropertyMediaOverride(property.id);
    const images = mediaOverride?.images || (Array.isArray(property.images) ? property.images : []);
    const videos = mediaOverride?.videos || (Array.isArray(property.videos) ? property.videos : []);
    const features = Array.isArray(property.features) ? property.features : [];
    const mainImage = images.length > 0 ? images[0] : 'assets/images/placeholder.jpg';
    const address = property.address || property.location || '';
    const mapsUrl = property.mapsUrl || (address ? `https://www.google.com/maps?q=${encodeURIComponent(address)}` : '');
    const mapEmbedUrl = address ? `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed` : '';
    
    const modal = document.getElementById('propertyModal');
    const detailsContainer = document.getElementById('propertyDetails');
    const isAdminUser = !!localStorage.getItem('adminUser');
    const canViewFullDetails = brokerView || isAdminUser;
    
    const statusText = {
        'disponivel': 'Disponível',
        'reservado': 'Reservado',
        'vendido': 'Vendido'
    };
    
    const reservationInfo = property.status === 'reservado' && property.reservedUntil
        ? `<div class="reservation-timer">
             <strong>Reservado até:</strong> ${formatDate(property.reservedUntil)}
             <br><strong>Por:</strong> ${property.reservedBy}
           </div>`
        : '';
    
    const actionButton = property.status === 'disponivel'
        ? `<button class="btn btn-primary" onclick="reserveProperty(${property.id})">Reservar Imóvel</button>`
        : `<button class="btn btn-primary" disabled>${statusText[property.status]}</button>`;
    
    const headerHTML = `
        <div class="property-detail-header">
            <div>
                <h2 class="property-detail-title">${property.title}</h2>
                <div class="property-location">
                    <i class="fas fa-map-marker-alt"></i>
                    ${property.location}
                </div>
            </div>
            <div class="property-detail-actions">
                <div class="property-detail-price">
                    R$ ${property.price.toLocaleString('pt-BR')}
                </div>
                <button class="btn-scroll-down" onclick="scrollToBottom()" title="Rolar para o final">
                    <i class="fas fa-chevron-down"></i>
                </button>
            </div>
        </div>
    `;
    
    currentGalleryImages = images;
    currentGalleryIndex = 0;
    currentGalleryMedia = [
        ...images.map(src => ({ type: 'image', src })),
        ...videos.map(src => ({ type: 'video', src }))
    ];
    currentGalleryMediaIndex = 0;
    
    const galleryHTML = `
        <div class="property-gallery">
            <div class="gallery-main" id="galleryMain">
                <button class="gallery-nav gallery-nav-left" onclick="event.stopPropagation(); changeGalleryByOffset(-1)" aria-label="Foto anterior">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <button class="gallery-nav gallery-nav-right" onclick="event.stopPropagation(); changeGalleryByOffset(1)" aria-label="Próxima foto">
                    <i class="fas fa-chevron-right"></i>
                </button>
                <div class="gallery-main-media" id="galleryMainMedia">
                    <img src="${mainImage}" alt="${property.title}" style="cursor: zoom-in;" onclick="showImageLightbox('${mainImage}', '${property.title}')">
                </div>
            </div>
            <div class="gallery-thumbs" id="galleryThumbs"></div>
        </div>
    `;
    
    const summaryHTML = `
        ${headerHTML}
        ${galleryHTML}
        <div class="detail-section">
            <h4>Descrição</h4>
            <p>${property.description}</p>
        </div>
        ${address ? `
        <div class="detail-section">
            <h4>Endereço</h4>
            <p>${address}</p>
            ${mapsUrl ? `<a class="map-link" href="${mapsUrl}" target="_blank" rel="noopener">Abrir no Google Maps</a>` : ''}
            ${mapEmbedUrl ? `
            <div class="mini-map">
                <iframe src="${mapEmbedUrl}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>
            </div>
            ` : ''}
        </div>
        ` : ''}
    `;
    
    const fullHTML = `
        ${headerHTML}
        ${galleryHTML}
        <div class="property-details-grid">
            <div class="detail-section">
                <h4>Características</h4>
                <ul class="detail-list">
                    <li><span>Quartos:</span> <span>${property.bedrooms}</span></li>
                    <li><span>Banheiros:</span> <span>${property.bathrooms}</span></li>
                    ${property.showArea && property.area ? `<li><span>Área:</span> <span>${property.area}m²</span></li>` : ''}
                    <li><span>Vagas:</span> <span>${property.parking}</span></li>
                    <li><span>Tipo:</span> <span>${property.type}</span></li>
                    ${brokerView ? `<li><span>Status:</span> <span>${statusText[property.status]}</span></li>` : ''}
                </ul>
            </div>
            
            <div class="detail-section">
                <h4>Comodidades</h4>
                <ul class="detail-list">
                    ${features.map(feature => `<li>${feature}</li>`).join('')}
                </ul>
            </div>
        </div>
        
        <div class="detail-section">
            <h4>Descrição</h4>
            <p>${property.description}</p>
        </div>

        ${address ? `
        <div class="detail-section">
            <h4>Endereço</h4>
            <p>${address}</p>
            ${mapsUrl ? `<a class="map-link" href="${mapsUrl}" target="_blank" rel="noopener">Abrir no Google Maps</a>` : ''}
            ${mapEmbedUrl ? `
            <div class="mini-map">
                <iframe src="${mapEmbedUrl}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>
            </div>
            ` : ''}
        </div>
        ` : ''}
        
        ${createUnitsTable(propertyId)}
        
        <div class="reservation-section">
            ${brokerView ? reservationInfo : ''}
            ${brokerView ? actionButton : `<button class="btn btn-primary" onclick="scrollToSection('contact')">Fale Conosco</button>`}
        </div>
    `;
    
    detailsContainer.innerHTML = canViewFullDetails ? fullHTML : summaryHTML;
    renderGalleryThumbs();
    generateVideoThumbs();
    setTimeout(() => {
        renderGalleryThumbs();
        generateVideoThumbs();
    }, 300);
    setTimeout(() => {
        renderGalleryThumbs();
        generateVideoThumbs();
    }, 900);
    
    modal.style.display = 'block';

    // Add smooth scroll behavior and scroll to top
    const modalContent = modal.querySelector('.modal-content');
    modalContent.scrollTop = 0;

    // Add scroll indicator
    addScrollIndicator(modalContent);

    // Setas do teclado e swipe na galeria (antes de abrir lightbox)
    setTimeout(setupGalleryNavigation, 150);
}

function handleRestrictedAction(action, propertyId) {
    const brokerView = typeof isBroker === 'function' ? isBroker() : false;
    const isAdminUser = !!localStorage.getItem('adminUser');
    const canViewFullDetails = brokerView || isAdminUser;
    
    if (!canViewFullDetails) {
        showRestrictedAccessModal();
        return;
    }
    
    if (action === 'details') {
        showPropertyDetails(propertyId);
        return;
    }
    
    if (action === 'reserve') {
        reserveProperty(propertyId);
        return;
    }
    
    if (action === 'docs') {
        showDocumentsModal(propertyId);
    }
}

function showRestrictedAccessModal() {
    let modal = document.getElementById('restrictedAccessModal');
    
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'restrictedAccessModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content restricted-modal">
                <span class="close" onclick="closeRestrictedAccessModal()">&times;</span>
                <h3>Acesso restrito</h3>
                <p>Para utilizar/visualizar todas as informações e funcionalidades faça o login.</p>
                <button class="btn btn-primary" onclick="closeRestrictedAccessModal()">Fechar</button>
            </div>
        `;
        
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeRestrictedAccessModal();
            }
        });
        
        document.body.appendChild(modal);
    }
    
    modal.style.display = 'block';
}

function closeRestrictedAccessModal() {
    const modal = document.getElementById('restrictedAccessModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Change gallery image/video
function changeGalleryImage(src, thumb) {
    if (typeof currentGalleryImages !== 'undefined') {
        const idx = Number(thumb?.dataset?.index);
        if (!Number.isNaN(idx)) currentGalleryIndex = idx;
    }
    if (Array.isArray(currentGalleryMedia)) {
        const mediaIndex = currentGalleryMedia.findIndex(item => item.type === 'image' && item.src === src);
        if (mediaIndex >= 0) currentGalleryMediaIndex = mediaIndex;
    }
    const main = document.getElementById('galleryMain');
    const media = document.getElementById('galleryMainMedia');
    if (main) main.classList.remove('is-video');
    if (media) {
        media.innerHTML = `<img src="${src}" alt="Foto do imóvel" style="cursor: zoom-in;" onclick="showImageLightbox('${src}', 'Foto do imóvel')">`;
    }
    
    // Update active thumb
    document.querySelectorAll('.thumb').forEach(t => t.classList.remove('active'));
    if (thumb) thumb.classList.add('active');
    
    // Enhance gallery after image change
    setTimeout(enhanceImageGallery, 100);
}

function changeGalleryByOffset(offset) {
    if (!currentGalleryMedia || currentGalleryMedia.length === 0) return;
    
    const total = currentGalleryMedia.length;
    currentGalleryMediaIndex = (currentGalleryMediaIndex + offset + total) % total;
    const nextItem = currentGalleryMedia[currentGalleryMediaIndex];
    
    const main = document.getElementById('galleryMain');
    const media = document.getElementById('galleryMainMedia');
    if (main && media && nextItem) {
        if (nextItem.type === 'video') {
            main.classList.add('is-video');
            media.innerHTML = `<video src="${nextItem.src}" controls autoplay muted playsinline preload="metadata"></video>`;
            const video = media.querySelector('video');
            if (video) {
                video.load();
                const playPromise = video.play();
                if (playPromise && typeof playPromise.catch === 'function') {
                    playPromise.catch(() => {});
                }
            }
        } else {
            main.classList.remove('is-video');
            media.innerHTML = `<img src="${nextItem.src}" alt="Foto do imóvel" style="cursor: zoom-in;" onclick="showImageLightbox('${nextItem.src}', 'Foto do imóvel')">`;
        }
    }
    
    document.querySelectorAll('.thumb').forEach(t => t.classList.remove('active'));
    if (nextItem?.type === 'image') {
        const idx = currentGalleryImages.indexOf(nextItem.src);
        if (idx >= 0) {
            currentGalleryIndex = idx;
            const activeThumb = document.querySelector(`.thumb[data-index="${currentGalleryIndex}"]`);
            if (activeThumb) activeThumb.classList.add('active');
        }
    } else {
        const activeThumb = document.querySelector(`.video-thumb[data-video="${nextItem?.src}"]`);
        if (activeThumb) activeThumb.classList.add('active');
    }
    
    setTimeout(enhanceImageGallery, 100);
}

function changeGalleryVideo(src, thumb) {
    const main = document.getElementById('galleryMain');
    const media = document.getElementById('galleryMainMedia');
    if (main) main.classList.add('is-video');
    if (media) {
        media.innerHTML = `<video src="${src}" controls autoplay muted playsinline preload="metadata"></video>`;
    }
    
    // Update active thumb
    document.querySelectorAll('.thumb').forEach(t => t.classList.remove('active'));
    if (thumb) thumb.classList.add('active');
    
    if (Array.isArray(currentGalleryMedia)) {
        const mediaIndex = currentGalleryMedia.findIndex(item => item.type === 'video' && item.src === src);
        if (mediaIndex >= 0) currentGalleryMediaIndex = mediaIndex;
    }
    
    const video = media ? media.querySelector('video') : null;
    if (video) {
        video.load();
        const attemptPlay = () => {
            const playPromise = video.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch(() => {});
            }
        };
        if (video.readyState >= 2) {
            attemptPlay();
        } else {
            video.addEventListener('loadedmetadata', attemptPlay, { once: true });
        }
    }
}

function generateVideoThumbs() {
    document.querySelectorAll('.video-thumb').forEach(thumb => {
        const src = thumb.getAttribute('data-video');
        if (!src || thumb.dataset.thumbReady === 'true') return;
        thumb.dataset.thumbReady = 'true';
        
        const video = document.createElement('video');
        video.src = src;
        video.muted = true;
        video.playsInline = true;
        video.preload = 'metadata';
        
        const capture = () => {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth || 160;
            canvas.height = video.videoHeight || 120;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                thumb.style.backgroundImage = `url('${dataUrl}')`;
                thumb.style.backgroundSize = 'cover';
                thumb.style.backgroundPosition = 'center';
            }
        };
        
        video.addEventListener('loadedmetadata', () => {
            try {
                video.currentTime = 0.1;
            } catch (e) {
                capture();
            }
        }, { once: true });
        
        video.addEventListener('seeked', () => {
            capture();
        }, { once: true });
        
        video.load();
    });
}

function renderGalleryThumbs() {
    const container = document.getElementById('galleryThumbs');
    if (!container) return;
    
    const imageThumbs = currentGalleryImages.map((img, index) => `
        <div class="thumb ${index === currentGalleryIndex ? 'active' : ''}" data-index="${index}" onclick="changeGalleryImage('${img}', this, ${index})">
            <img src="${img}" alt="Foto ${index + 1}">
        </div>
    `);
    
    const videoThumbs = (currentGalleryMedia || [])
        .filter(item => item.type === 'video')
        .map(item => `
            <div class="thumb video-thumb ${item.src === (currentGalleryMedia[currentGalleryMediaIndex]?.src) ? 'active' : ''}" data-video="${item.src}" onclick="changeGalleryVideo('${item.src}', this)" style="position: relative; overflow: hidden;">
                <div class="video-play-overlay" aria-hidden="true">
                    <span>▶</span>
                </div>
            </div>
        `);
    
    container.innerHTML = [...imageThumbs, ...videoThumbs].join('');
    
    // Overlay fica sempre visível (sem vídeo no thumb)
}

// Close property modal
function closePropertyModal() {
    removeGalleryNavigation();
    const el = document.getElementById('propertyModal');
    if (el) el.style.display = 'none';
}

// Galeria: navegação por setas (desktop) e swipe (mobile)
let galleryKeyHandler = null;

function setupGalleryNavigation() {
    removeGalleryNavigation();
    const galleryMain = document.getElementById('galleryMain');
    if (!galleryMain) return;

    galleryKeyHandler = function(e) {
        if (document.getElementById('imageLightbox')) return;
        const gm = document.getElementById('galleryMain');
        if (!gm || !currentGalleryMedia?.length) return;
        if (e.key === 'ArrowLeft') { e.preventDefault(); changeGalleryByOffset(-1); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); changeGalleryByOffset(1); }
    };
    document.addEventListener('keydown', galleryKeyHandler, true);

    let touchStartX = 0;
    galleryMain.style.touchAction = 'pan-y';
    galleryMain.addEventListener('touchstart', e => {
        touchStartX = e.touches?.[0]?.clientX ?? e.changedTouches?.[0]?.clientX ?? 0;
    }, { passive: true });
    galleryMain.addEventListener('touchend', e => {
        const t = e.changedTouches?.[0];
        if (!t) return;
        const touchEndX = t.clientX;
        if (touchStartX - touchEndX > 50) changeGalleryByOffset(1);
        else if (touchEndX - touchStartX > 50) changeGalleryByOffset(-1);
    }, { passive: true });
}

function removeGalleryNavigation() {
    if (galleryKeyHandler) {
        document.removeEventListener('keydown', galleryKeyHandler, true);
        galleryKeyHandler = null;
    }
}

// Handle contact form submission (mantido para compatibilidade, mas agora usa contact-forms.js)
function handleContactForm(e) {
    // Este formulário agora é gerenciado por contact-forms.js
    // Mantido apenas para compatibilidade
}

// Show success/error messages
function showMessage(text, type = 'success') {
    // Remove existing messages
    const existingMessages = document.querySelectorAll('.message');
    existingMessages.forEach(msg => msg.remove());
    
    const message = document.createElement('div');
    message.className = `message ${type}`;
    message.textContent = text;
    
    // Insert at the top of the page
    document.body.insertBefore(message, document.body.firstChild);
    
    // Remove after 5 seconds
    setTimeout(() => {
        message.remove();
    }, 5000);
}

// Format date for display
function formatDate(date) {
    return new Date(date).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Check user session
function checkUserSession() {
    const userData = localStorage.getItem('currentUser');
    if (userData) {
        currentUser = JSON.parse(userData);
        updateUIForLoggedUser();
    }
}

// Update UI for logged user
function updateUIForLoggedUser() {
    const loginButton = document.querySelector('.btn-login');
    if (loginButton && currentUser) {
        loginButton.innerHTML = `<i class="fas fa-user"></i> ${currentUser.name}`;
        loginButton.onclick = () => {
            if (confirm('Deseja fazer logout?')) {
                logout();
            }
        };
    }

    if (typeof isBroker === 'function' && isBroker()) {
        document.body.classList.add('is-broker');
    }
}

// Logout function
function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    
    const loginButton = document.querySelector('.btn-login');
    if (loginButton) {
        loginButton.innerHTML = '<i class="fas fa-user"></i> Área do Corretor';
        loginButton.onclick = openLoginModal;
    }
    
    document.body.classList.remove('is-broker');
    
    showMessage('Logout realizado com sucesso!', 'success');
}

// Utility function to generate UUID
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Add scroll indicator to modal
function addScrollIndicator(container) {
    // Remove existing indicator
    const existingIndicator = container.querySelector('.scroll-indicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }
    
    // Create scroll indicator
    const scrollIndicator = document.createElement('div');
    scrollIndicator.className = 'scroll-indicator';
    scrollIndicator.innerHTML = `
        <div class="scroll-progress"></div>
        <div class="scroll-hint">
            <i class="fas fa-chevron-down"></i>
            <span>Role para ver mais</span>
        </div>
    `;
    
    container.appendChild(scrollIndicator);
    
    // Update scroll progress
    function updateScrollProgress() {
        const scrollTop = container.scrollTop;
        const scrollHeight = container.scrollHeight - container.clientHeight;
        const scrollPercentage = (scrollTop / scrollHeight) * 100;
        
        const progressBar = scrollIndicator.querySelector('.scroll-progress');
        const hint = scrollIndicator.querySelector('.scroll-hint');
        
        progressBar.style.width = scrollPercentage + '%';
        
        // Hide hint when scrolled to bottom
        if (scrollPercentage > 90) {
            hint.style.opacity = '0';
        } else {
            hint.style.opacity = '1';
        }
    }
    
    // Add scroll listener
    container.addEventListener('scroll', updateScrollProgress);
    
    // Initial update
    setTimeout(updateScrollProgress, 100);
}

// Enhanced image gallery functionality
function enhanceImageGallery() {
    const galleryMain = document.getElementById('galleryMain');
    if (!galleryMain) return;

    galleryMain.style.cursor = 'zoom-in';

    if (galleryMain.dataset.clickEnhanced) return;
    galleryMain.dataset.clickEnhanced = '1';
    galleryMain.addEventListener('click', function(e) {
        if (e.target.closest('.gallery-nav')) return;
        const img = this.querySelector('img');
        const video = this.querySelector('video');
        if (img) showImageLightbox(img.src, img.alt);
        else if (video) showImageLightbox(video.src, 'Vídeo');
    });
}

// Lightbox state for navigation
let lightboxMedia = [];
let lightboxIndex = 0;
let lightboxKeyHandler = null;

// Show image lightbox (usa currentGalleryMedia se disponível para navegação)
function showImageLightbox(src, alt) {
    lightboxMedia = Array.isArray(currentGalleryMedia) && currentGalleryMedia.length > 0
        ? currentGalleryMedia
        : [{ type: 'image', src }];
    const startIdx = lightboxMedia.findIndex(m => m.src === src);
    lightboxIndex = startIdx >= 0 ? startIdx : 0;

    const lightbox = document.createElement('div');
    lightbox.className = 'image-lightbox';
    lightbox.id = 'imageLightbox';
    lightbox.setAttribute('tabindex', '-1');
    lightbox.innerHTML = `
        <div class="lightbox-content">
            <span class="lightbox-close" onclick="closeLightbox()" aria-label="Fechar">&times;</span>
            <button class="lightbox-nav lightbox-prev" onclick="lightboxNav(-1)" aria-label="Anterior"><i class="fas fa-chevron-left"></i></button>
            <button class="lightbox-nav lightbox-next" onclick="lightboxNav(1)" aria-label="Próxima"><i class="fas fa-chevron-right"></i></button>
            <div class="lightbox-media" id="lightboxMedia"></div>
        </div>
    `;

    document.body.appendChild(lightbox);
    lightbox.focus();
    renderLightboxMedia();

    lightbox.addEventListener('click', function(e) {
        if (e.target === lightbox) closeLightbox();
    });

    lightboxKeyHandler = function(e) {
        if (e.key === 'Escape') closeLightbox();
        else if (e.key === 'ArrowLeft') { e.preventDefault(); lightboxNav(-1); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); lightboxNav(1); }
    };
    document.addEventListener('keydown', lightboxKeyHandler, true);

    let touchStartX = 0;
    const content = lightbox.querySelector('.lightbox-content');
    content.addEventListener('touchstart', e => { touchStartX = e.changedTouches?.[0]?.screenX ?? 0; }, { passive: true });
    content.addEventListener('touchend', e => {
        const touchEndX = e.changedTouches?.[0]?.screenX ?? 0;
        if (touchStartX - touchEndX > 50) lightboxNav(1);
        else if (touchEndX - touchStartX > 50) lightboxNav(-1);
    }, { passive: true });
}

function lightboxNav(delta) {
    if (lightboxMedia.length === 0) return;
    lightboxIndex = (lightboxIndex + delta + lightboxMedia.length) % lightboxMedia.length;
    renderLightboxMedia();
}

function renderLightboxMedia() {
    const container = document.getElementById('lightboxMedia');
    if (!container || lightboxMedia.length === 0) return;
    const item = lightboxMedia[lightboxIndex];
    if (item.type === 'video') {
        container.innerHTML = `<video src="${item.src}" controls autoplay playsinline preload="metadata"></video>`;
    } else {
        container.innerHTML = `<img src="${item.src}" alt="Foto do imóvel">`;
    }
}

// Close lightbox
function closeLightbox() {
    if (lightboxKeyHandler) {
        document.removeEventListener('keydown', lightboxKeyHandler, true);
        lightboxKeyHandler = null;
    }
    const lightbox = document.getElementById('imageLightbox');
    if (lightbox) lightbox.remove();
}

// Scroll to bottom of modal
function scrollToBottom() {
    const modalContent = document.querySelector('.modal-content');
    if (modalContent) {
        modalContent.scrollTo({
            top: modalContent.scrollHeight,
            behavior: 'smooth'
        });
    }
}

// Scroll to top of modal
function scrollToTop() {
    const modalContent = document.querySelector('.modal-content');
    if (modalContent) {
        modalContent.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }
}
