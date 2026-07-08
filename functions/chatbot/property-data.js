const SITE_BASE_URL = 'https://bfmarquesempreendimentos.github.io/bfm';

/** Empreendimentos fora de oferta (vendidos / retirados do portfólio ativo). */
var OFFERING_EXCLUDED_PROPERTY_IDS = { 1: true };

const properties = [
  {
    id: 1,
    title: 'Condomínio Porto Novo',
    type: 'apartamento',
    location: 'Porto Novo, São Gonçalo - RJ',
    address: 'Rua Lourival Martins, 31',
    price: 150000,
    bedrooms: '1 e 2 quartos',
    bathrooms: 1,
    area: 50,
    parking: 0,
    status: 'vendido',
    description: 'Apartamentos modernos com opções de 1 e 2 quartos. Acabamento de qualidade, pisos cerâmicos, janelas com grades de segurança e boa ventilação natural.',
    features: ['1 e 2 quartos', 'Acabamento moderno', 'Pisos cerâmicos', 'Grades de segurança', 'Boa ventilação', 'Próximo ao comércio'],
    mcmv: true,
    image: `${SITE_BASE_URL}/assets/images/porto-novo/IMG_2689.jpg`,
    gallery: [
      `${SITE_BASE_URL}/assets/images/porto-novo/IMG_2689.jpg`,
      `${SITE_BASE_URL}/assets/images/porto-novo/IMG_2673.jpg`,
      `${SITE_BASE_URL}/assets/images/porto-novo/IMG_2680.jpg`,
    ],
    videos: [],
    mapsUrl: 'https://maps.app.goo.gl/FmuFKNprhngr2hGG9',
  },
  {
    id: 2,
    title: 'Residencial Itaúna',
    type: 'casa',
    location: 'Nova Cidade, São Gonçalo - RJ',
    address: 'Rua Alcio Souto, 348',
    price: 150000,
    bedrooms: '1 quarto',
    bathrooms: 1,
    area: null,
    parking: 0,
    status: 'disponivel',
    description: 'Casas com 1 quarto, acabamento moderno. Ideal para primeira moradia ou investimento.',
    features: ['1 quarto', 'Acabamento moderno', 'Cozinha planejada', 'Banheiro social'],
    mcmv: true,
    image: `${SITE_BASE_URL}/assets/images/residencial-itauna/itauna-03.jpg`,
    gallery: [
      `${SITE_BASE_URL}/assets/images/residencial-itauna/itauna-01.jpg`,
      `${SITE_BASE_URL}/assets/images/residencial-itauna/itauna-02.jpg`,
      `${SITE_BASE_URL}/assets/images/residencial-itauna/itauna-03.jpg`,
      `${SITE_BASE_URL}/assets/images/residencial-itauna/itauna-04.jpg`,
      `${SITE_BASE_URL}/assets/images/residencial-itauna/itauna-05.jpg`,
    ],
    videos: [],
    mapsUrl: 'https://maps.app.goo.gl/gyF6ERJs1rrKHkbZ9',
  },
  {
    id: 3,
    title: 'Edifício Bandeirantes',
    type: 'apartamento',
    location: 'Amendoeira, São Gonçalo - RJ',
    address: 'Rua Lopes da Cruz, 136',
    price: 160000,
    bedrooms: '1 quarto',
    bathrooms: 1,
    area: 45,
    parking: 0,
    status: 'disponivel',
    description: '20 unidades (101 a 210). Apartamentos de 1 quarto em localização privilegiada.',
    features: ['20 unidades', '1 quarto', 'Área de serviço', 'Localização central', 'Próximo ao comércio'],
    mcmv: true,
    image: `${SITE_BASE_URL}/assets/images/amendoeiras/amendoeiras-08.jpg`,
    gallery: [
      `${SITE_BASE_URL}/assets/images/amendoeiras/amendoeiras-08.jpg`,
      `${SITE_BASE_URL}/assets/images/amendoeiras/amendoeiras-01.jpg`,
      `${SITE_BASE_URL}/assets/images/amendoeiras/amendoeiras-02.jpg`,
      `${SITE_BASE_URL}/assets/images/amendoeiras/amendoeiras-03.jpg`,
      `${SITE_BASE_URL}/assets/images/amendoeiras/amendoeiras-04.jpg`,
    ],
    videos: [
      `${SITE_BASE_URL}/assets/videos/amendoeiras/amendoeiras-01.mp4`,
      `${SITE_BASE_URL}/assets/videos/amendoeiras/amendoeiras-02.mp4`,
      `${SITE_BASE_URL}/assets/videos/amendoeiras/amendoeiras-03.mp4`,
    ],
    mapsUrl: 'https://maps.app.goo.gl/i3eExj2Wk3vD2xQNA',
  },
  {
    id: 4,
    title: 'Condomínio Laranjal',
    type: 'casa',
    location: 'Laranjal, São Gonçalo - RJ',
    address: 'Rua Jussara, 178',
    price: 145000,
    bedrooms: '1 quarto',
    bathrooms: 1,
    area: 48,
    parking: 1,
    status: 'disponivel',
    description: '15 unidades em condomínio fechado. Bairro tranquilo, ideal para famílias.',
    features: ['15 unidades', 'Condomínio fechado', 'Bairro tranquilo', '1 vaga de garagem'],
    mcmv: true,
    image: `${SITE_BASE_URL}/assets/images/laranjal/laranjal-01.jpg`,
    gallery: [
      `${SITE_BASE_URL}/assets/images/laranjal/laranjal-01.jpg`,
      `${SITE_BASE_URL}/assets/images/laranjal/laranjal-02.jpg`,
      `${SITE_BASE_URL}/assets/images/laranjal/laranjal-03.jpg`,
      `${SITE_BASE_URL}/assets/images/laranjal/laranjal-04.jpg`,
    ],
    videos: [],
    mapsUrl: 'https://maps.app.goo.gl/sjoAjX93gB5aN8EV6',
  },
  {
    id: 5,
    title: 'Residencial Apolo',
    type: 'casa',
    location: 'Apolo, Itaboraí - RJ',
    address: 'Rua Maria José Arruda Barbosa, LT 02 QD 18, Apolo, Itaboraí - RJ',
    price: 130000,
    bedrooms: '1 quarto',
    bathrooms: 1,
    area: 42,
    parking: 0,
    status: 'disponivel',
    description: 'Casas em região de crescimento. Ótimo custo-benefício para primeira moradia.',
    features: ['Região em crescimento', 'Ótimo custo-benefício', 'Quintal', 'Área de serviço'],
    mcmv: true,
    image: `${SITE_BASE_URL}/assets/images/apolo/apolo-01.jpg`,
    gallery: [
      `${SITE_BASE_URL}/assets/images/apolo/apolo-01.jpg`,
      `${SITE_BASE_URL}/assets/images/apolo/apolo-02.jpg`,
      `${SITE_BASE_URL}/assets/images/apolo/apolo-03.jpg`,
      `${SITE_BASE_URL}/assets/images/apolo/apolo-04.jpg`,
    ],
    videos: [`${SITE_BASE_URL}/assets/videos/apolo/apolo-01.mp4`],
    mapsUrl: 'https://maps.app.goo.gl/SKmfSAxpZ3ercJ646',
  },
  {
    id: 6,
    title: 'Residencial Coelho',
    type: 'casa',
    location: 'Coelho, São Gonçalo - RJ',
    address: 'Rua Lopes da Cruz, 122',
    price: 145000,
    bedrooms: '1 quarto',
    bathrooms: 1,
    area: 45,
    parking: 0,
    status: 'disponivel',
    description: 'Casas com excelente padrão de acabamento em área de fácil acesso.',
    features: ['Condomínio seguro', 'Bom acabamento', 'Fácil acesso', 'Área externa'],
    mcmv: true,
    image: `${SITE_BASE_URL}/assets/images/coelho/coelho-07.jpg`,
    gallery: [
      `${SITE_BASE_URL}/assets/images/coelho/coelho-07.jpg`,
      `${SITE_BASE_URL}/assets/images/coelho/coelho-01.jpg`,
      `${SITE_BASE_URL}/assets/images/coelho/coelho-02.jpg`,
      `${SITE_BASE_URL}/assets/images/coelho/coelho-03.jpg`,
    ],
    videos: [`${SITE_BASE_URL}/assets/videos/coelho/coelho-01.mp4`],
    mapsUrl: 'https://maps.app.goo.gl/XBHZuNsdxTTVmnw66',
  },
  {
    id: 7,
    title: 'Edifício Nova Cidade',
    type: 'apartamento',
    location: 'Luiz Caçador, São Gonçalo - RJ',
    address: 'Rua Alcio Souto, 576',
    price: 160000,
    bedrooms: '1 quarto',
    bathrooms: 1,
    area: 58,
    parking: 0,
    status: 'disponivel',
    description: '20 unidades (101 a 210). Prédio moderno com infraestrutura completa no entorno.',
    features: ['20 apartamentos', '1 quarto', 'Prédio moderno', 'Área de serviço'],
    mcmv: true,
    image: `${SITE_BASE_URL}/assets/images/cacador/cacador-02.jpg`,
    gallery: [
      `${SITE_BASE_URL}/assets/images/cacador/cacador-02.jpg`,
      `${SITE_BASE_URL}/assets/images/cacador/cacador-01.jpg`,
      `${SITE_BASE_URL}/assets/images/cacador/cacador-03.jpg`,
      `${SITE_BASE_URL}/assets/images/cacador/cacador-04.jpg`,
    ],
    videos: [`${SITE_BASE_URL}/assets/videos/cacador/cacador-01.mp4`],
    mapsUrl: 'https://maps.app.goo.gl/N4CNvNQwx1KWBFCH6',
  },
  {
    id: 8,
    title: 'Casa Luxo Maricá',
    type: 'casa condomínio',
    location: 'Ponta Grossa, Maricá - RJ',
    address: 'Rua Irineu Ferreira Pinto, 374',
    price: 1180000,
    bedrooms: '3 suítes',
    bathrooms: 3,
    area: 360,
    parking: 5,
    status: 'disponivel',
    description: 'Casa de alto padrão com 3 suítes, 360m², 5 vagas. Piscina, churrasqueira, espaço gourmet.',
    features: ['3 suítes', '360m²', '5 vagas', 'Piscina', 'Churrasqueira', 'Espaço gourmet', 'Condomínio fechado'],
    mcmv: false,
    image: `${SITE_BASE_URL}/assets/images/marica/foto1.jpeg`,
    gallery: [
      `${SITE_BASE_URL}/assets/images/marica/foto1.jpeg`,
      `${SITE_BASE_URL}/assets/images/marica/marica-01.jpg`,
      `${SITE_BASE_URL}/assets/images/marica/marica-02.jpg`,
    ],
    videos: [
      `${SITE_BASE_URL}/assets/videos/marica/marica-01.mp4`,
      `${SITE_BASE_URL}/assets/videos/marica/marica-02.mp4`,
    ],
    mapsUrl: 'https://www.google.com/maps?q=Rua+Irineu+Ferreira+Pinto+374+Maricá+RJ',
  },
];

var PROPERTY_SLUGS = {
  1: 'porto-novo',
  2: 'residencial-itauna',
  3: 'edificio-bandeirantes',
  4: 'condominio-laranjal',
  5: 'residencial-apolo',
  6: 'residencial-coelho',
  7: 'edificio-nova-cidade',
  8: 'casa-luxo-marica',
};

function getPropertySlug(property) {
  if (!property || property.id == null) return '';
  return PROPERTY_SLUGS[property.id] || ('imovel-' + property.id);
}

var PROPERTY_SLUG_ALIASES = {
  'edificio-amendoeiras': 3,
  'edificio-cacador': 7,
};

function getPropertyIdFromSlug(slug) {
  var s = String(slug || '').trim().toLowerCase();
  if (!s) return null;
  var keys = Object.keys(PROPERTY_SLUGS);
  var i;
  for (i = 0; i < keys.length; i++) {
    if (PROPERTY_SLUGS[keys[i]] === s) return Number(keys[i]);
  }
  if (PROPERTY_SLUG_ALIASES[s]) return PROPERTY_SLUG_ALIASES[s];
  if (/^imovel-(\d+)$/.test(s)) return Number(s.replace('imovel-', ''));
  return null;
}

function isPropertyOffered(p) {
  if (!p || p.id == null) return false;
  if (OFFERING_EXCLUDED_PROPERTY_IDS[Number(p.id)]) return false;
  var st = String(p.status || '').toLowerCase();
  if (st === 'vendido') return false;
  return true;
}

function getOfferedProperties() {
  var out = [];
  var i;
  for (i = 0; i < properties.length; i++) {
    if (isPropertyOffered(properties[i])) out.push(properties[i]);
  }
  return out;
}

function getPropertyById(id) {
  var n = Number(id);
  return properties.filter(function(p) { return p.id === n; })[0] || null;
}

/** URL do site que abre o modal do empreendimento (slug + hash — GitHub Pages). */
function getPropertyPageUrl(property, siteBase) {
  var base = String(siteBase || SITE_BASE_URL).replace(/\/$/, '');
  if (!property || property.id == null) return base + '/';
  var slug = getPropertySlug(property);
  return base + '/?p=' + encodeURIComponent(slug) + '#imovel=' + property.id;
}

/** Listas únicas de URLs públicas (HTTPS) para envio pelo WhatsApp */
function getPropertyMediaLists(p) {
  if (!p) return { images: [], videos: [] };
  var baseList = (p.gallery && p.gallery.length) ? p.gallery.slice() : (p.image ? [p.image] : []);
  var seen = {};
  var images = [];
  for (var i = 0; i < baseList.length; i++) {
    var u = baseList[i];
    if (u && !seen[u]) {
      seen[u] = 1;
      images.push(u);
    }
  }
  var videos = (p.videos && p.videos.length) ? p.videos.slice() : [];
  return { images: images, videos: videos };
}

function filterProperties(filters) {
  filters = filters || {};
  var result = getOfferedProperties();
  if (filters.type) result = result.filter(function(p) { return p.type.indexOf(filters.type) >= 0; });
  if (filters.maxPrice) result = result.filter(function(p) { return p.price <= filters.maxPrice; });
  if (filters.mcmv) result = result.filter(function(p) { return p.mcmv === true; });
  if (filters.location) {
    var loc = String(filters.location).toLowerCase();
    result = result.filter(function(p) { return p.location.toLowerCase().indexOf(loc) >= 0; });
  }
  return result;
}

function formatPropertyShort(p) {
  const priceStr = p.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return `🏠 *${p.title}*\n📍 ${p.location}\n💰 ${priceStr}\n🛏 ${p.bedrooms} | 📐 ${p.area ? p.area + 'm²' : 'Consulte'}`;
}

function formatPropertyFull(p) {
  const priceStr = p.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  let text = `🏠 *${p.title}*\n\n`;
  text += `📍 *Endereço:* ${p.address}\n`;
  text += `📍 *Bairro:* ${p.location}\n`;
  text += `💰 *Preço:* ${priceStr}\n`;
  text += `🛏 *Quartos:* ${p.bedrooms}\n`;
  text += `🚿 *Banheiros:* ${p.bathrooms}\n`;
  if (p.area) text += `📐 *Área:* ${p.area}m²\n`;
  text += `🚗 *Vagas:* ${p.parking}\n`;
  text += `${p.mcmv ? '✅' : '❌'} *MCMV:* ${p.mcmv ? 'Sim - Aceita financiamento' : 'Não se aplica'}\n\n`;
  text += `📝 ${p.description}\n\n`;
  text += `✨ *Diferenciais:* ${p.features.join(' • ')}\n\n`;
  text += `🗺️ *Mapa:* ${p.mapsUrl}`;
  return text;
}

function getPropertiesSummaryForAI() {
  return getOfferedProperties().map(function(p) {
    var priceStr = p.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    return 'ID ' + p.id + ': ' + p.title + ' | ' + p.type + ' | ' + p.location + ' | ' + priceStr + ' | ' + p.bedrooms + ' | ' + (p.area ? p.area + 'm²' : 'N/A') + ' | ' + p.parking + ' vagas | MCMV: ' + (p.mcmv ? 'Sim' : 'Não') + ' | ' + p.description;
  }).join('\n');
}

function getSoldPropertyReply(propertyId) {
  if (Number(propertyId) === 1) {
    return 'O *Condomínio Porto Novo* já foi totalmente vendido e não faz mais parte do nosso portfólio ativo. Posso te mostrar opções MCMV disponíveis hoje: Residencial Itaúna, Edifício Bandeirantes, Condomínio Laranjal, Residencial Apolo, Residencial Coelho ou Edifício Nova Cidade — é só pedir que eu listo com valores e fotos.';
  }
  return 'Este empreendimento não está mais disponível para venda. Use listar_imoveis para ver as opções atuais.';
}

module.exports = {
  properties,
  OFFERING_EXCLUDED_PROPERTY_IDS,
  isPropertyOffered,
  getOfferedProperties,
  getPropertyById,
  getPropertySlug,
  getPropertyIdFromSlug,
  PROPERTY_SLUGS,
  getPropertyPageUrl,
  getPropertyMediaLists,
  filterProperties,
  formatPropertyShort,
  formatPropertyFull,
  getPropertiesSummaryForAI,
  getSoldPropertyReply,
  SITE_BASE_URL,
};
