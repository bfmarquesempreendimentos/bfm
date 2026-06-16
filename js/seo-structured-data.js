/**
 * JSON-LD (Schema.org) para SEO — compatível IE11+ (sem arrow functions no escopo global se necessário).
 */
(function() {
    var SITE = 'https://bfmarquesempreendimentos.github.io/bfm';
    var COMPANY = {
        '@type': 'RealEstateAgent',
        name: 'B F Marques Empreendimentos',
        url: SITE + '/',
        logo: SITE + '/assets/images/logo-bf-marques.png',
        telephone: '+55-21-99759-0814',
        email: 'bfmarquesempreendimentos@gmail.com',
        address: {
            '@type': 'PostalAddress',
            addressLocality: 'São Gonçalo',
            addressRegion: 'RJ',
            addressCountry: 'BR'
        },
        areaServed: ['São Gonçalo', 'Itaboraí', 'Maricá', 'Niterói'],
        foundingDate: '2010-04-05'
    };

    function injectJsonLd(obj) {
        if (!obj || typeof document === 'undefined') return;
        var script = document.createElement('script');
        script.type = 'application/ld+json';
        script.text = JSON.stringify(obj);
        document.head.appendChild(script);
    }

    function initHomeSeo() {
        injectJsonLd({
            '@context': 'https://schema.org',
            '@graph': [
                COMPANY,
                {
                    '@type': 'WebSite',
                    name: 'B F Marques Empreendimentos',
                    url: SITE + '/',
                    potentialAction: {
                        '@type': 'SearchAction',
                        target: SITE + '/?q={search_term_string}',
                        'query-input': 'required name=search_term_string'
                    }
                }
            ]
        });
    }

    function initPropertySeo(properties) {
        if (!properties || !properties.length) return;
        var items = [];
        var i;
        for (i = 0; i < properties.length && i < 12; i++) {
            var p = properties[i];
            if (p.hideFromSite) continue;
            items.push({
                '@type': 'Product',
                name: p.title || ('Imóvel ' + p.id),
                description: p.description || p.location || '',
                category: p.type || 'Imóvel',
                offers: {
                    '@type': 'Offer',
                    price: p.price || 0,
                    priceCurrency: 'BRL',
                    availability: p.status === 'disponivel'
                        ? 'https://schema.org/InStock'
                        : 'https://schema.org/OutOfStock',
                    url: SITE + '/?p=imovel-' + p.id + '#imovel=' + p.id
                }
            });
        }
        if (items.length) {
            injectJsonLd({ '@context': 'https://schema.org', '@graph': items });
        }
    }

    function boot() {
        var page = document.body && document.body.getAttribute('data-seo-page');
        if (page === 'home' || document.getElementById('properties')) {
            initHomeSeo();
            if (typeof properties !== 'undefined' && properties.length) {
                initPropertySeo(properties);
            } else {
                setTimeout(function() {
                    if (typeof properties !== 'undefined') initPropertySeo(properties);
                }, 1500);
            }
        } else if (page === 'contact') {
            injectJsonLd({ '@context': 'https://schema.org', '@graph': [COMPANY] });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
