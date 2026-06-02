/**
 * Conteúdo da campanha semanal para corretores parceiros.
 * Rotação por semana: empreendimento em destaque + notícia MCMV/mercado + mídias.
 */
const {
  properties,
  getPropertyById,
  getPropertyMediaLists,
  formatPropertyShort,
  SITE_BASE_URL,
} = require('./property-data');

const MARKET_SNIPPETS = [
  {
    title: 'Minha Casa Minha Vida',
    text: 'Confirme renda familiar e CPF sem pendências antes da simulação. Unidades MCMV da B F Marques têm condições especiais para o corretor apresentar.',
  },
  {
    title: 'Crédito imobiliário',
    text: 'Taxas e faixas de renda mudam ao longo do ano. Atualize a simulação do cliente no banco e destaque ITBI/registro quando aplicável nos nossos lançamentos.',
  },
  {
    title: 'Atendimento ao lead',
    text: 'Resposta no mesmo dia aumenta visita agendada. Envie 2 ou 3 fotos do empreendimento + link do site e feche com data para visita.',
  },
  {
    title: 'Documentação do comprador',
    text: 'RG, CPF, comprovante de renda e residência aceleram aprovação. Antecipe a lista para o cliente MCMV não desistir no meio do processo.',
  },
  {
    title: 'Mercado São Gonçalo / Niterói',
    text: 'Demanda forte em apartamentos compactos e casas de entrada. Nossos empreendimentos em São Gonçalo e região seguem com estoque para visita.',
  },
  {
    title: 'Parceria corretor',
    text: 'Use o material da semana (fotos abaixo) nos seus grupos e stories. Dúvidas comerciais: fale com a equipe B F Marques no WhatsApp de suporte.',
  },
];

/** Empreendimentos que entram na rotação da campanha (disponíveis, foco MCMV + portfólio). */
function getCampaignPropertyPool() {
  var out = [];
  var i;
  for (i = 0; i < properties.length; i++) {
    if (properties[i].status === 'disponivel') out.push(properties[i]);
  }
  return out;
}

function getWeekOfYearNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function getMarketSnippetForWeek(week) {
  var idx = (week - 1) % MARKET_SNIPPETS.length;
  if (idx < 0) idx = 0;
  return MARKET_SNIPPETS[idx];
}

function getFeaturedPropertyForWeek(week, overrideId) {
  if (overrideId != null) {
    var forced = getPropertyById(Number(overrideId));
    if (forced && forced.status === 'disponivel') return forced;
  }
  var pool = getCampaignPropertyPool();
  if (!pool.length) return null;
  var idx = (week - 1) % pool.length;
  if (idx < 0) idx = 0;
  return pool[idx];
}

function formatPriceBr(price) {
  if (!price || price <= 0) return 'Consulte condições comerciais';
  return price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function brokerFirstName(broker) {
  return String((broker && broker.name) || '').trim().split(' ')[0] || 'Corretor(a)';
}

/**
 * Texto completo para {{1}} do template campanha_corretor_msg (máx. 1024 caracteres).
 */
function buildRichCampaignSingleBody(config, broker, now) {
  var week = getWeekOfYearNumber(now);
  var tips = Array.isArray(config.usefulTips) ? config.usefulTips : [];
  var tip = tips.length ? tips[(week - 1) % tips.length] : '';
  var featured = getFeaturedPropertyForWeek(week, config.featuredPropertyId);
  var market = getMarketSnippetForWeek(week);
  var firstName = brokerFirstName(broker);
  var siteUrl = config.siteUrl || SITE_BASE_URL + '/';
  var contato = config.whatsappContato || '(21) 99759-0814';

  if (!featured) {
    return (
      'Olá, ' + firstName + '! 🏡 Atualização semanal B F Marques\n\n' +
      '🌐 Portfólio completo: ' + siteUrl + '\n' +
      (tip ? ('💡 ' + tip + '\n') : '') +
      '📰 ' + market.title + ': ' + market.text + '\n\n' +
      '✅ ' + (config.ctaText || 'Divulgue nossos empreendimentos para seus leads.') + '\n' +
      'Suporte: ' + contato
    ).substring(0, 1024);
  }

  var priceStr = formatPriceBr(featured.price);
  var mcmvLine = featured.mcmv ? '✅ Aceita Minha Casa Minha Vida\n' : '';
  var descShort = String(featured.description || '').substring(0, 140);
  if (featured.description && featured.description.length > 140) descShort += '…';

  var text = (
    'Olá, ' + firstName + '! Semana B F Marques 🏡\n\n' +
    '⭐ *DESTAQUE DA SEMANA*\n' +
    formatPropertyShort(featured) + '\n' +
    mcmvLine +
    (descShort ? ('📝 ' + descShort + '\n') : '') +
    '🗺️ ' + (featured.mapsUrl || siteUrl) + '\n\n' +
    '📰 *' + market.title + '*\n' + market.text + '\n\n' +
    '🌐 Todos os imóveis: ' + siteUrl + '\n' +
    (tip ? ('💡 ' + tip + '\n') : '') +
    '✅ ' + (config.ctaText || 'Use as fotos/vídeo a seguir na divulgação.') + '\n\n' +
    '📷 Em seguida enviamos fotos' +
    (featured.videos && featured.videos.length ? ' e vídeo' : '') +
    ' deste empreendimento.\n' +
    'Suporte comercial: ' + contato
  );

  return text.substring(0, 1024);
}

function buildCampanhaCorretorBodyComponents(config, broker, now) {
  return [{
    type: 'body',
    parameters: [{ type: 'text', text: buildRichCampaignSingleBody(config, broker, now) }],
  }];
}

function buildCampanhaWithImageHeader(config, broker, now) {
  var week = getWeekOfYearNumber(now);
  var featured = getFeaturedPropertyForWeek(week, config.featuredPropertyId);
  if (!featured || !featured.image) return null;
  var body = buildCampanhaCorretorBodyComponents(config, broker, now);
  return [
    {
      type: 'header',
      parameters: [{
        type: 'image',
        image: { link: featured.image },
      }],
    },
  ].concat(body);
}

function delayMs(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms);
  });
}

/**
 * Após o template, envia fotos e vídeo do empreendimento da semana (quando a Meta permitir).
 */
async function sendBrokerCampaignFollowUpMedia(waPhone, config, now, waSendOpts, sendImageMessage, sendVideoMessage) {
  var week = getWeekOfYearNumber(now);
  var featured = getFeaturedPropertyForWeek(week, config.featuredPropertyId);
  if (!featured) return { sent: 0, skipped: true, reason: 'Sem empreendimento em destaque' };

  var media = getPropertyMediaLists(featured);
  var images = media.images.slice(0, 3);
  var videos = media.videos.slice(0, 1);
  var sent = 0;
  var errors = [];
  var i;
  var captionBase = '📷 ' + featured.title + ' — B F Marques';

  for (i = 0; i < images.length; i++) {
    try {
      await sendImageMessage(
        waPhone,
        images[i],
        i === 0 ? captionBase : '',
        waSendOpts
      );
      sent += 1;
      await delayMs(1200);
    } catch (imgErr) {
      errors.push(imgErr.message || String(imgErr));
      break;
    }
  }

  if (videos.length && sent > 0) {
    try {
      await delayMs(800);
      await sendVideoMessage(waPhone, videos[0], '🎬 ' + featured.title, waSendOpts);
      sent += 1;
    } catch (vidErr) {
      errors.push(vidErr.message || String(vidErr));
    }
  }

  return {
    sent: sent,
    featuredId: featured.id,
    featuredTitle: featured.title,
    errors: errors,
  };
}

function getCampaignWeekPreview(now, config) {
  var week = getWeekOfYearNumber(now);
  var featured = getFeaturedPropertyForWeek(week, config && config.featuredPropertyId);
  var market = getMarketSnippetForWeek(week);
  return {
    week: week,
    featuredPropertyId: featured ? featured.id : null,
    featuredPropertyTitle: featured ? featured.title : '',
    marketSnippetTitle: market.title,
    poolSize: getCampaignPropertyPool().length,
  };
}

module.exports = {
  buildRichCampaignSingleBody,
  buildCampanhaCorretorBodyComponents,
  buildCampanhaWithImageHeader,
  sendBrokerCampaignFollowUpMedia,
  getFeaturedPropertyForWeek,
  getCampaignWeekPreview,
  getWeekOfYearNumber,
  MARKET_SNIPPETS,
};
