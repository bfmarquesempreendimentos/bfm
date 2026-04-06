const SITE_BASE_URL = 'https://bfmarquesempreendimentos.github.io/bfm';

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
    status: 'disponivel',
    description: 'Apartamentos modernos com opções de 1 e 2 quartos. Acabamento de qualidade, pisos cerâmicos, janelas com grades de segurança e boa ventilação natural.',
    features: ['1 e 2 quartos', 'Acabamento moderno', 'Pisos cerâmicos', 'Grades de segurança', 'Boa ventilação', 'Próximo ao comércio'],
    mcmv: true,
    image: `${SITE_BASE_URL}/assets/images/porto-novo/IMG_2689.jpg`,
    mapsUrl: 'https://maps.app.goo.gl/FmuFKNprhngr2hGG9',
  },
  {
    id: 2,
    title: 'Residencial Itaúna',
    type: 'casa',
    location: 'Nova Cidade, São Gonçalo - RJ',
    address: 'Rua Alcio Souto, 348',
    price: 155000,
    bedrooms: '1 quarto',
    bathrooms: 1,
    area: null,
    parking: 0,
    status: 'disponivel',
    description: 'Casas com 1 quarto, acabamento moderno. Ideal para primeira moradia ou investimento.',
    features: ['1 quarto', 'Acabamento moderno', 'Cozinha planejada', 'Banheiro social'],
    mcmv: true,
    image: `${SITE_BASE_URL}/assets/images/residencial-itauna/itauna-03.jpg`,
    mapsUrl: 'https://maps.app.goo.gl/gyF6ERJs1rrKHkbZ9',
  },
  {
    id: 3,
    title: 'Edifício Amendoeiras',
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
    mapsUrl: 'https://maps.app.goo.gl/XBHZuNsdxTTVmnw66',
  },
  {
    id: 7,
    title: 'Edifício Caçador',
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
    mapsUrl: 'https://www.google.com/maps?q=Rua+Irineu+Ferreira+Pinto+374+Maricá+RJ',
  },
];

function getPropertyById(id) {
  return properties.find(p => p.id === id) || null;
}

function filterProperties(filters = {}) {
  let result = [...properties];
  if (filters.type) result = result.filter(p => p.type.includes(filters.type));
  if (filters.maxPrice) result = result.filter(p => p.price <= filters.maxPrice);
  if (filters.mcmv) result = result.filter(p => p.mcmv === true);
  if (filters.location) result = result.filter(p => p.location.toLowerCase().includes(filters.location.toLowerCase()));
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
  return properties.map(p => {
    const priceStr = p.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    return `ID ${p.id}: ${p.title} | ${p.type} | ${p.location} | ${priceStr} | ${p.bedrooms} | ${p.area ? p.area + 'm²' : 'N/A'} | ${p.parking} vagas | MCMV: ${p.mcmv ? 'Sim' : 'Não'} | ${p.description}`;
  }).join('\n');
}

module.exports = {
  properties,
  getPropertyById,
  filterProperties,
  formatPropertyShort,
  formatPropertyFull,
  getPropertiesSummaryForAI,
  SITE_BASE_URL,
};
