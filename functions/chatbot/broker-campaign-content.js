/**
 * Conteúdo da campanha semanal para corretores parceiros.
 * Uma mensagem principal + mídias (sem template Meta na rotina).
 */
const {
  properties,
  getPropertyById,
  getPropertyMediaLists,
  getPropertyPageUrl,
  SITE_BASE_URL,
} = require('./property-data');
const { sanitizeWhatsAppTemplateParam } = require('./whatsapp-api');

const MARKET_SNIPPETS = [
  {
    title: 'Minha Casa Minha Vida',
    text: 'Confirme renda e CPF antes da simulação. Destaque unidades MCMV e condições comerciais com nossa equipe.',
  },
  {
    title: 'Crédito imobiliário',
    text: 'Atualize simulação no banco. ITBI e registro grátis quando aplicável nos nossos lançamentos.',
  },
  {
    title: 'Mercado região metropolitana',
    text: 'Demanda alta em entrada e MCMV em São Gonçalo e entorno. Estoque com visita agendada.',
  },
  {
    title: 'Documentação',
    text: 'RG, CPF, renda e residência organizados aceleram aprovação do financiamento.',
  },
  {
    title: 'Atendimento ao lead',
    text: 'Resposta no mesmo dia + fotos + link do site = mais visita e mais venda.',
  },
  {
    title: 'Parceria corretor',
    text: 'Use o material oficial da semana nos seus canais. Dúvidas: WhatsApp comercial abaixo.',
  },
  {
    title: 'Taxa e condições',
    text: 'Revise taxa de juros e prazo com o banco do cliente. Nossa equipe ajuda na simulação.',
  },
  {
    title: 'Visitas agendadas',
    text: 'Confirme data e horário com antecedência. Leve o link do empreendimento no celular.',
  },
  {
    title: 'Lançamentos',
    text: 'Novas unidades entram no site em tempo real. Confira o portfólio antes de falar com o lead.',
  },
  {
    title: 'Comissão e parceria',
    text: 'Mantenha cadastro atualizado no painel. Material da semana é para repasse imediato ao cliente.',
  },
];

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

function getDayIndex(date) {
  var t = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor(t.getTime() / 86400000);
}

function getMarketSnippetForDate(now) {
  var day = getDayIndex(now);
  var week = getWeekOfYearNumber(now);
  var idx = (day + week) % MARKET_SNIPPETS.length;
  if (idx < 0) idx = 0;
  return MARKET_SNIPPETS[idx];
}

function getFeaturedPropertyForWeek(week, overrideId) {
  if (overrideId === '' || overrideId === 0 || overrideId === '0') overrideId = null;
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
  var n = Math.round(Number(price));
  var parts = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return 'R$ ' + parts + ',00';
}

function brokerFirstName(broker) {
  return String((broker && broker.name) || '').trim().split(' ')[0] || 'Corretor(a)';
}

function pickFeaturesLine(p, maxCount) {
  var feats = p.features || [];
  if (!feats.length) return '';
  var line = '';
  var i;
  for (i = 0; i < feats.length && i < (maxCount || 2); i++) {
    line += (i > 0 ? ' | ' : '') + feats[i];
  }
  return line;
}

function getOtherPropertiesTeaser(featured, maxNames) {
  var pool = getCampaignPropertyPool();
  var names = [];
  var i;
  maxNames = maxNames || 4;
  for (i = 0; i < pool.length && names.length < maxNames; i++) {
    if (featured && pool[i].id === featured.id) continue;
    names.push(pool[i].title);
  }
  if (!names.length) return '';
  return 'Outras opções no site: ' + names.join(', ') + ' e mais.';
}

function resolveMarketSnippet(config, now) {
  var title = config.marketNewsTitle != null ? String(config.marketNewsTitle).trim() : '';
  var text = config.marketNewsText != null ? String(config.marketNewsText).trim() : '';
  if (title && text) return { title: title, text: text };
  return getMarketSnippetForDate(now);
}

function buildCampaignContext(config, broker, now) {
  var week = getWeekOfYearNumber(now);
  var tips = Array.isArray(config.usefulTips) ? config.usefulTips : [];
  var day = getDayIndex(now);
  var tipIdx = tips.length ? (day + week - 1) % tips.length : -1;
  var tip = tipIdx >= 0 ? tips[tipIdx] : '';
  var overrideId = config.featuredPropertyId;
  if (overrideId === '' || overrideId === 0 || overrideId === '0') overrideId = null;
  var featured = getFeaturedPropertyForWeek(week, overrideId);
  var siteUrl = config.siteUrl || SITE_BASE_URL + '/';
  var market = resolveMarketSnippet(config, now);
  return {
    week: week,
    firstName: brokerFirstName(broker),
    siteUrl: siteUrl,
    propertyUrl: featured ? getPropertyPageUrl(featured, siteUrl) : siteUrl,
    contato: config.whatsappContato || '(21) 99759-0814',
    cta: config.ctaText || 'Divulgue para seus leads e traga visitas agendadas.',
    tip: tip,
    featured: featured,
    market: market,
    othersTeaser: featured ? getOtherPropertiesTeaser(featured, 4) : '',
    maxImages: config.campaignMaxImages != null ? Number(config.campaignMaxImages) : 2,
    maxVideos: config.campaignMaxVideos != null ? Number(config.campaignMaxVideos) : 1,
  };
}

/** Mensagem principal da campanha (texto livre ou {{1}} no fallback de template). */
function buildPremiumFollowUpText(config, broker, now) {
  var ctx = buildCampaignContext(config, broker, now);
  var f = ctx.featured;
  var parts = [];

  parts.push('🏡 *B F MARQUES EMPREENDIMENTOS*');
  parts.push('Material oficial para corretores — semana ' + ctx.week);
  parts.push('');
  parts.push('Olá, *' + ctx.firstName + '*! Obrigado pela parceria.');

  if (f) {
    parts.push('');
    parts.push('*⭐ Destaque desta semana: ' + f.title + '*');
    parts.push('📍 ' + f.location);
    parts.push('💰 *' + formatPriceBr(f.price) + '*');
    if (f.mcmv) parts.push('✅ Minha Casa Minha Vida');
    var featLine = pickFeaturesLine(f, 3);
    if (featLine) parts.push('✨ ' + featLine);
    if (f.description) {
      parts.push('📝 ' + String(f.description).substring(0, 200));
    }
    if (f.mapsUrl) parts.push('🗺️ Mapa: ' + f.mapsUrl);
    parts.push('');
    parts.push('*🔗 Página do empreendimento (fotos, vídeos, unidades):*');
    parts.push(ctx.propertyUrl);
  }

  parts.push('');
  parts.push('*🌐 Portfólio completo (todos os imóveis):*');
  parts.push(ctx.siteUrl);
  if (ctx.othersTeaser) parts.push(ctx.othersTeaser);

  parts.push('');
  parts.push('📰 *' + ctx.market.title + '*');
  parts.push(ctx.market.text);
  if (ctx.tip) parts.push('💡 ' + ctx.tip);

  parts.push('');
  parts.push('📷 A seguir: fotos e vídeo do destaque para repassar ao cliente.');
  parts.push('');
  parts.push('✅ ' + ctx.cta);
  parts.push('Suporte: ' + ctx.contato);

  return parts.join('\n');
}

function buildRichCampaignSingleBody(config, broker, now) {
  return sanitizeWhatsAppTemplateParam(buildPremiumFollowUpText(config, broker, now));
}

function buildSimpleCampaignSingleBody(config, broker, now) {
  return buildRichCampaignSingleBody(config, broker, now);
}

function buildCampanhaCorretorBodyComponents(config, broker, now, useSimple) {
  var bodyText = useSimple
    ? buildSimpleCampaignSingleBody(config, broker, now)
    : buildRichCampaignSingleBody(config, broker, now);
  return [{
    type: 'body',
    parameters: [{ type: 'text', text: bodyText }],
  }];
}

function delayMs(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms);
  });
}

function buildMediaCaptions(config, broker, now) {
  var ctx = buildCampaignContext(config, broker, now);
  var f = ctx.featured;
  if (!f) {
    return ['B F Marques — ' + ctx.siteUrl];
  }
  return [
    '⭐ ' + f.title + ' — ' + formatPriceBr(f.price),
    '🏡 ' + f.title + ' (fotos, vídeos, unidades)',
    '🎬 Tour — ' + f.title,
  ];
}

/**
 * Fotos e vídeo (sem texto duplicado se includeText for false).
 */
async function sendBrokerCampaignFollowUpMedia(
  waPhone, config, broker, now, waSendOpts, sendTextMessage, sendImageMessage, sendVideoMessage, options
) {
  options = options || {};
  var week = getWeekOfYearNumber(now);
  var featured = getFeaturedPropertyForWeek(week, config.featuredPropertyId);
  if (!featured) {
    return { sent: 0, textSent: false, skipped: true, reason: 'Sem empreendimento em destaque' };
  }

  var ctx = buildCampaignContext(config, broker, now);
  var sent = 0;
  var errors = [];
  var textSent = false;
  var waMessageId = '';
  var captions = buildMediaCaptions(config, broker, now);
  var maxImg = ctx.maxImages > 0 ? ctx.maxImages : 2;
  var maxVid = ctx.maxVideos > 0 ? ctx.maxVideos : 1;

  if (sendTextMessage && options.includeText !== false) {
    try {
      var txtResp = await sendTextMessage(waPhone, buildPremiumFollowUpText(config, broker, now), waSendOpts);
      textSent = true;
      waMessageId = (txtResp && txtResp.messageId) ? txtResp.messageId : '';
      sent += 1;
      await delayMs(1200);
    } catch (txtErr) {
      var txtMsg = txtErr.message || String(txtErr);
      if (/template|24.?hour|re-engagement|janela|131047|131026|470|outside/i.test(txtMsg)) {
        throw txtErr;
      }
      errors.push('texto: ' + txtMsg);
    }
  }

  var media = getPropertyMediaLists(featured);
  var images = media.images.slice(0, maxImg);
  var videos = media.videos.slice(0, maxVid);
  var i;

  for (i = 0; i < images.length; i++) {
    try {
      var cap = captions[i] || captions[0] || featured.title;
      var imgResp = await sendImageMessage(waPhone, images[i], cap, waSendOpts);
      if (imgResp && imgResp.messageId) waMessageId = imgResp.messageId;
      sent += 1;
      if (i < images.length - 1) await delayMs(1100);
    } catch (imgErr) {
      errors.push('imagem: ' + (imgErr.message || String(imgErr)));
      break;
    }
  }

  if (videos.length) {
    try {
      await delayMs(700);
      var vCap = captions[2] || captions[1] || ('Tour ' + featured.title + ' — ' + ctx.propertyUrl);
      var vidResp = await sendVideoMessage(waPhone, videos[0], vCap, waSendOpts);
      if (vidResp && vidResp.messageId) waMessageId = vidResp.messageId;
      sent += 1;
    } catch (vidErr) {
      errors.push('video: ' + (vidErr.message || String(vidErr)));
    }
  }

  return {
    sent: sent,
    textSent: textSent,
    featuredId: featured.id,
    featuredTitle: featured.title,
    featuredPropertyUrl: ctx.propertyUrl,
    errors: errors,
    waMessageId: waMessageId,
  };
}

/**
 * Campanha direta: 1 texto + até 2 fotos + 1 vídeo (sem template Meta).
 */
async function sendBrokerCampaignDirect(
  waPhone, config, broker, now, waSendOpts, sendTextMessage, sendImageMessage, sendVideoMessage
) {
  var media = await sendBrokerCampaignFollowUpMedia(
    waPhone, config, broker, now, waSendOpts,
    sendTextMessage, sendImageMessage, sendVideoMessage,
    { includeText: true }
  );
  if (!media.textSent) {
    if (media.errors && media.errors.length) {
      throw new Error(media.errors.join('; '));
    }
    var noTextErr = new Error(
      'Texto livre não enviado (corretor fora da janela 24h ou bloqueio Meta). Use template aprovado.'
    );
    noTextErr.code = 'NEEDS_TEMPLATE';
    throw noTextErr;
  }
  return {
    mode: 'direct',
    templateName: '',
    componentsVariant: 'premium_text_media',
    sentTo: waPhone,
    waMessageId: media.waMessageId || '',
    media: media,
  };
}

function getCampaignPropertiesForAdmin() {
  var pool = getCampaignPropertyPool();
  var out = [];
  var i;
  for (i = 0; i < pool.length; i++) {
    out.push({
      id: pool[i].id,
      title: pool[i].title,
      price: formatPriceBr(pool[i].price),
    });
  }
  return out;
}

function getCampaignWeekPreview(now, config) {
  var week = getWeekOfYearNumber(now);
  var overrideId = config && config.featuredPropertyId;
  if (overrideId === '' || overrideId === 0 || overrideId === '0') overrideId = null;
  var featured = getFeaturedPropertyForWeek(week, overrideId);
  var market = config ? resolveMarketSnippet(config, now) : getMarketSnippetForDate(now);
  var siteUrl = (config && config.siteUrl) || SITE_BASE_URL + '/';
  var customMarket = !!(config && String(config.marketNewsTitle || '').trim() &&
    String(config.marketNewsText || '').trim());
  return {
    week: week,
    featuredPropertyId: featured ? featured.id : null,
    featuredPropertyTitle: featured ? featured.title : '',
    featuredPrice: featured ? formatPriceBr(featured.price) : '',
    featuredPropertyUrl: featured ? getPropertyPageUrl(featured, siteUrl) : '',
    featuredManual: overrideId != null && overrideId !== '' && !isNaN(Number(overrideId)),
    marketSnippetTitle: market.title,
    marketSnippetText: market.text,
    marketCustom: customMarket,
    poolSize: getCampaignPropertyPool().length,
    siteUrl: siteUrl,
  };
}

module.exports = {
  buildRichCampaignSingleBody,
  buildPremiumFollowUpText,
  buildSimpleCampaignSingleBody,
  buildCampanhaCorretorBodyComponents,
  sendBrokerCampaignFollowUpMedia,
  sendBrokerCampaignDirect,
  getFeaturedPropertyForWeek,
  getCampaignWeekPreview,
  getCampaignPropertiesForAdmin,
  getWeekOfYearNumber,
  getPropertyPageUrl,
  resolveMarketSnippet,
  MARKET_SNIPPETS,
};
