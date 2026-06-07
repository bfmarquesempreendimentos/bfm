/**
 * Conteúdo da campanha semanal para corretores parceiros.
 * Uma mensagem principal + mídias (sem template Meta na rotina).
 */
const {
  properties,
  getPropertyById,
  getPropertyMediaLists,
  getPropertyPageUrl,
  getPropertySlug,
  SITE_BASE_URL,
} = require('./property-data');
const { sanitizeWhatsAppTemplateParam } = require('./whatsapp-api');
const { BRUNO_CORRETOR_PHONE_DISPLAY } = require('./lead-manager');
const propertyUnitsBase = require('./property-units-data');

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

function getBrokerCampaignSupportLine(config) {
  var phone = (config && config.whatsappContato) ? String(config.whatsappContato).trim() : '';
  if (!phone) phone = BRUNO_CORRETOR_PHONE_DISPLAY;
  return 'Bruno Marques ' + phone;
}

function getPortfolioUrl(siteUrl) {
  return String(siteUrl || SITE_BASE_URL + '/').replace(/#.*$/, '');
}

function getPropertyAddressLine(property) {
  if (!property) return '';
  var addr = property.address ? String(property.address).trim() : '';
  var loc = property.location ? String(property.location).trim() : '';
  if (addr && loc) return addr + ', ' + loc;
  return addr || loc || '';
}

/** Remove acentos e caracteres que a Meta costuma rejeitar no {{1}} (erro 132018). */
function stripAccentsForTemplate(text) {
  var s = String(text || '');
  var map = {
    'á': 'a', 'à': 'a', 'ã': 'a', 'â': 'a', 'ä': 'a',
    'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
    'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
    'ó': 'o', 'ò': 'o', 'õ': 'o', 'ô': 'o', 'ö': 'o',
    'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
    'ç': 'c', 'ñ': 'n',
    'Á': 'A', 'À': 'A', 'Ã': 'A', 'Â': 'A', 'Ä': 'A',
    'É': 'E', 'È': 'E', 'Ê': 'E', 'Ë': 'E',
    'Í': 'I', 'Ì': 'I', 'Î': 'I', 'Ï': 'I',
    'Ó': 'O', 'Ò': 'O', 'Õ': 'O', 'Ô': 'O', 'Ö': 'O',
    'Ú': 'U', 'Ù': 'U', 'Û': 'U', 'Ü': 'U',
    'Ç': 'C', 'Ñ': 'N',
  };
  var out = '';
  var i;
  for (i = 0; i < s.length; i++) {
    out += map[s.charAt(i)] != null ? map[s.charAt(i)] : s.charAt(i);
  }
  return out;
}

function normAlnumUnitCampaign(s) {
  var lower = String(s || '').toLowerCase();
  var parts = lower.match(/[a-z\u00e0-\u00ff]+|\d+/g);
  if (!parts) return '';
  var out = '';
  var i;
  for (i = 0; i < parts.length; i++) {
    if (/^\d+$/.test(parts[i])) out += String(parseInt(parts[i], 10));
    else out += parts[i];
  }
  return out;
}

function lookupEngineeringValueSync(engineeringValues, unitCode) {
  if (!engineeringValues || !unitCode) return null;
  var keys = Object.keys(engineeringValues);
  var target = normAlnumUnitCampaign(unitCode);
  var i;
  for (i = 0; i < keys.length; i++) {
    if (normAlnumUnitCampaign(keys[i]) === target) return engineeringValues[keys[i]];
  }
  for (i = 0; i < keys.length; i++) {
    var nk = normAlnumUnitCampaign(keys[i]);
    if (nk && target && (nk.indexOf(target) >= 0 || target.indexOf(nk) >= 0)) {
      return engineeringValues[keys[i]];
    }
  }
  return null;
}

function parseBrlMoneyString(str) {
  if (str == null || str === '') return null;
  if (typeof str === 'number' && !isNaN(str)) return str;
  var s = String(str).replace(/[^\d,.-]/g, '');
  var lastComma = s.lastIndexOf(',');
  var lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    s = s.replace(/,/g, '');
  }
  var n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function getCampaignPriceSnapshot(propertyId) {
  var raw = propertyUnitsBase[propertyId] || propertyUnitsBase[String(propertyId)];
  var out = {
    minSale: null,
    maxEng: null,
    maxEngDisplay: '',
    disponivelCount: 0,
    examples: [],
  };
  if (!raw || !raw.units) return out;

  var i;
  var u;
  var st;
  var eng;
  var engNum;
  for (i = 0; i < raw.units.length; i++) {
    u = raw.units[i];
    st = String(u.status || '').toLowerCase();
    if (st === 'disponivel') {
      out.disponivelCount++;
      if (out.minSale == null || u.price < out.minSale) out.minSale = u.price;
    }
  }

  var engKeys = raw.engineeringValues ? Object.keys(raw.engineeringValues) : [];
  for (i = 0; i < engKeys.length; i++) {
    engNum = parseBrlMoneyString(raw.engineeringValues[engKeys[i]]);
    if (engNum != null && (out.maxEng == null || engNum > out.maxEng)) {
      out.maxEng = engNum;
      out.maxEngDisplay = raw.engineeringValues[engKeys[i]];
    }
  }

  for (i = 0; i < raw.units.length; i++) {
    u = raw.units[i];
    if (String(u.status || '').toLowerCase() !== 'disponivel') continue;
    eng = lookupEngineeringValueSync(raw.engineeringValues, u.code);
    engNum = parseBrlMoneyString(eng);
    if (engNum != null && engNum > u.price) {
      out.examples.push({
        code: stripAccentsForTemplate(u.code),
        sale: u.price,
        eng: eng,
        gap: engNum - u.price,
      });
    }
  }
  out.examples.sort(function(a, b) { return b.gap - a.gap; });
  return out;
}

/** Menor venda disponivel + maior engenharia do predio + ate 3 exemplos (eng > venda). */
function buildCampaignPriceSummary(propertyId, maxExamples, forTemplate) {
  maxExamples = maxExamples != null ? maxExamples : 3;
  var snap = getCampaignPriceSnapshot(propertyId);
  var parts = [];
  var exSep = forTemplate ? ' / ' : ' | ';

  if (snap.minSale != null) {
    parts.push('Venda a partir de ' + formatPriceBr(snap.minSale));
  } else if (snap.disponivelCount === 0) {
    return 'Sem unidades disponiveis no momento. Consulte o site.';
  }

  if (snap.maxEngDisplay) {
    parts.push('Engenharia ate ' + String(snap.maxEngDisplay).replace(/\s/g, '') + ' (referencia do predio)');
  }

  if (maxExamples > 0 && snap.examples.length) {
    var exParts = [];
    var i;
    for (i = 0; i < snap.examples.length && exParts.length < maxExamples; i++) {
      exParts.push(
        snap.examples[i].code + ' Venda ' + formatPriceBr(snap.examples[i].sale) +
        ' Eng ' + String(snap.examples[i].eng).replace(/\s/g, '')
      );
    }
    parts.push('Ex.: engenharia maior que venda - ' + exParts.join(exSep));
  }

  if (!parts.length) return '';
  return parts.join('. ');
}

function getFeaturedMinSalePrice(property) {
  if (!property) return null;
  var snap = getCampaignPriceSnapshot(property.id);
  if (snap.minSale != null) return snap.minSale;
  return property.price != null ? property.price : null;
}

function pickFeaturesLine(p, maxCount, forTemplate) {
  var feats = p.features || [];
  if (!feats.length) return '';
  var sep = forTemplate ? ' / ' : ' | ';
  var line = '';
  var i;
  for (i = 0; i < feats.length && i < (maxCount || 2); i++) {
    line += (i > 0 ? sep : '') + feats[i];
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
    contato: getBrokerCampaignSupportLine(config),
    cta: config.ctaText || 'Divulgue para seus leads e traga visitas agendadas.',
    tip: tip,
    featured: featured,
    market: market,
    othersTeaser: featured ? getOtherPropertiesTeaser(featured, 4) : '',
    maxImages: config.campaignMaxImages != null ? Number(config.campaignMaxImages) : 2,
    maxVideos: config.campaignMaxVideos != null ? Number(config.campaignMaxVideos) : 1,
  };
}

/** URL de mapa sem % nem & (Meta rejeita em variaveis de template). */
function buildMapsSearchUrlSafe(property) {
  if (!property) return '';
  var addr = getPropertyAddressLine(property) || property.location || '';
  if (!addr) {
    if (property.mapsUrl && property.mapsUrl.indexOf('goo.gl') < 0 &&
        property.mapsUrl.indexOf('maps.app.goo.gl') < 0) {
      return String(property.mapsUrl).replace(/%/g, '');
    }
    return '';
  }
  var q = stripAccentsForTemplate(addr)
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .join('+');
  return 'https://www.google.com/maps/search/' + q;
}

function getMapsUrlForCampaign(property) {
  return buildMapsSearchUrlSafe(property);
}

/**
 * Linhas da campanha — mesma ordem/secoes para direct (Bruno) e template (Raphael).
 * profile: priceExamples, featuresMax, descMax, marketText, marketTitle, tip, othersTeaser, forTemplate
 */
function buildCampaignMessageLines(config, broker, now, profile) {
  profile = profile || {};
  var forTemplate = !!profile.forTemplate;
  var ctx = buildCampaignContext(config, broker, now);
  var f = ctx.featured;
  var parts = [];
  var T = function(s) {
    return forTemplate ? stripAccentsForTemplate(String(s || '')) : String(s || '');
  };
  var bold = function(s) {
    return forTemplate ? T(s) : ('*' + s + '*');
  };

  parts.push(forTemplate ? '🏡 B F MARQUES EMPREENDIMENTOS' : '🏡 *B F MARQUES EMPREENDIMENTOS*');
  parts.push(T('Material oficial para corretores — semana ' + ctx.week));
  parts.push('');
  parts.push(forTemplate
    ? ('Ola, ' + ctx.firstName + '! Obrigado pela parceria.')
    : ('Olá, *' + ctx.firstName + '*! Obrigado pela parceria.'));

  if (f) {
    parts.push('');
    parts.push(forTemplate
      ? ('⭐ Destaque desta semana: ' + T(f.title))
      : bold('⭐ Destaque desta semana: ' + f.title));
    var addrLine = getPropertyAddressLine(f);
    parts.push('📍 ' + T(addrLine || f.location));
    var exCount = profile.priceExamples != null ? profile.priceExamples : 3;
    var priceLine = buildCampaignPriceSummary(f.id, exCount, forTemplate);
    if (priceLine) parts.push('💰 ' + T(priceLine));
    else {
      var minSale = getFeaturedMinSalePrice(f);
      if (minSale != null) {
        parts.push(forTemplate
          ? ('💰 Venda a partir de ' + formatPriceBr(minSale))
          : ('💰 Venda a partir de *' + formatPriceBr(minSale) + '*'));
      }
    }
    if (f.mcmv) parts.push('✅ Minha Casa Minha Vida');
    var featMax = profile.featuresMax != null ? profile.featuresMax : 3;
    var featLine = pickFeaturesLine(f, featMax, forTemplate);
    if (featLine) parts.push('✨ ' + T(featLine));
    if (profile.descMax > 0 && f.description) {
      parts.push('📝 ' + T(String(f.description).substring(0, profile.descMax)));
    }
    var mapsUrl = getMapsUrlForCampaign(f);
    if (mapsUrl) parts.push('🗺️ Mapa (abrir ou copiar): ' + mapsUrl);
    parts.push('');
    parts.push(forTemplate
      ? '🔗 Empreendimento desta semana (fotos, videos, unidades):'
      : bold('🔗 Empreendimento desta semana (fotos, videos, unidades):'));
    parts.push(getPropertyPageUrlForTemplate(f, ctx.siteUrl));
  }

  parts.push('');
  parts.push(forTemplate
    ? '🌐 Portfolio completo (todos os imoveis):'
    : bold('🌐 Portfolio completo (todos os imoveis):'));
  parts.push(getPortfolioUrl(ctx.siteUrl));
  if (profile.othersTeaser && ctx.othersTeaser) parts.push(T(ctx.othersTeaser));

  if (profile.marketTitle !== false && ctx.market && ctx.market.title) {
    parts.push('');
    parts.push(forTemplate
      ? ('📰 ' + T(ctx.market.title))
      : bold('📰 ' + ctx.market.title));
    if (profile.marketText && ctx.market.text) parts.push(T(ctx.market.text));
  }
  if (profile.tip && ctx.tip) parts.push('💡 ' + T(ctx.tip));

  if (profile.mediaNote !== false) {
    parts.push('');
    parts.push('📷 A seguir: fotos e video do destaque para repassar ao cliente.');
  }

  parts.push('');
  parts.push('✅ ' + T(ctx.cta));
  parts.push('Suporte comercial: ' + ctx.contato);

  return parts;
}

var CAMPAIGN_TEMPLATE_PROFILES = [
  { priceExamples: 2, featuresMax: 2, descMax: 0, marketText: false, marketTitle: false, tip: false, othersTeaser: false, mediaNote: true, forTemplate: true },
  { priceExamples: 2, featuresMax: 2, descMax: 0, marketText: true, tip: false, othersTeaser: false, mediaNote: true, forTemplate: true },
  { priceExamples: 3, featuresMax: 2, descMax: 0, marketText: true, tip: false, othersTeaser: false, forTemplate: true },
  { priceExamples: 2, featuresMax: 2, descMax: 0, marketText: false, tip: false, othersTeaser: false, forTemplate: true },
  { priceExamples: 1, featuresMax: 1, descMax: 0, marketText: false, tip: false, othersTeaser: false, mediaNote: false, forTemplate: true },
  { priceExamples: 0, featuresMax: 0, descMax: 0, marketText: false, marketTitle: false, tip: false, othersTeaser: false, mediaNote: false, forTemplate: true },
];

/** Sanitiza {{1}} para Meta: sem |, sem %, sem truncar com reticencias. */
function finalizeTemplateVar1Body(raw) {
  var body = String(raw || '');
  body = body.replace(/\u00a0/g, ' ');
  body = body.replace(/\r\n/g, '\n');
  body = body.replace(/\r/g, '\n');
  body = body.replace(/\t/g, ' ');
  body = body.replace(/[\u200B-\u200D\uFEFF]/g, '');
  body = body.replace(/\*/g, '');
  body = body.replace(/[—–]/g, '-');
  body = body.replace(/#/g, '');
  body = body.replace(/\|/g, ' / ');
  body = body.replace(/%/g, '');
  body = body.replace(/\n{4,}/g, '\n\n\n');
  body = body.replace(/ {2,}/g, ' ');
  body = body.trim();
  while (body.length > 1018) {
    var cut = body.lastIndexOf('\n');
    if (cut < 280) break;
    body = body.substring(0, cut).trim();
  }
  if (!body) body = 'B F Marques Empreendimentos - parceria corretores.';
  return body;
}

/** Mensagem principal da campanha (texto livre ou {{1}} no fallback de template). */
function buildPremiumFollowUpText(config, broker, now) {
  return buildCampaignMessageLines(config, broker, now, {
    priceExamples: 3,
    featuresMax: 3,
    descMax: 200,
    marketText: true,
    tip: true,
    othersTeaser: true,
    forTemplate: false,
  }).join('\n');
}

function buildIdenticalCampaignTemplateVar1Tier(config, broker, now, profile) {
  return buildCampaignMessageLines(config, broker, now, profile).join('\n');
}

function getIdenticalTemplateVar1Candidates(config, broker, now) {
  var out = [];
  var seen = {};
  var i;
  var raw;
  var body;
  for (i = 0; i < CAMPAIGN_TEMPLATE_PROFILES.length; i++) {
    raw = buildIdenticalCampaignTemplateVar1Tier(config, broker, now, CAMPAIGN_TEMPLATE_PROFILES[i]);
    body = finalizeTemplateVar1Body(raw);
    if (!body || body.length > 1024) continue;
    if (seen[body]) continue;
    seen[body] = true;
    out.push(body);
  }
  return out;
}

/**
 * Mesmo conteudo da campanha direct (buildPremiumFollowUpText), adaptado ao {{1}} do template Meta.
 * omitFixedHeader=true remove a 1a linha quando o template Meta ja traz "B F Marques Empreendimentos".
 */
function buildPremiumFollowUpTextForTemplate(config, broker, now, omitFixedHeader) {
  var premium = buildPremiumFollowUpText(config, broker, now);
  var body = premium;
  if (omitFixedHeader !== false) {
    var lines = premium.split('\n');
    var start = 0;
    if (lines.length && String(lines[0]).indexOf('B F MARQUES') >= 0) start = 1;
    while (start < lines.length && !String(lines[start]).trim()) start += 1;
    body = lines.slice(start).join('\n');
  }
  return sanitizeWhatsAppTemplateParam(body);
}

function buildRichCampaignSingleBody(config, broker, now) {
  return sanitizeWhatsAppTemplateParam(buildPremiumFollowUpText(config, broker, now));
}

/** URL sem # (Meta rejeita # em variáveis de template — erro 132018). */
function getPropertyPageUrlForTemplate(property, siteBase) {
  var base = String(siteBase || SITE_BASE_URL).replace(/\/$/, '');
  if (!property || property.id == null) return base + '/';
  var slug = getPropertySlug(property);
  return base + '/?p=' + encodeURIComponent(slug);
}

/** Fallback multilinha alinhado ao direct (perfil enxuto). */
function buildTemplateMarketingVar1(config, broker, now) {
  return sanitizeWhatsAppTemplateParam(buildIdenticalCampaignTemplateVar1Tier(config, broker, now, {
    priceExamples: 2,
    featuresMax: 2,
    descMax: 0,
    marketText: true,
    tip: false,
    othersTeaser: false,
    forTemplate: true,
  }));
}

/** Versão curta multilinha se a Meta rejeitar o texto longo (132018). */
function buildTemplateMarketingVar1Compact(config, broker, now) {
  return sanitizeWhatsAppTemplateParam(buildIdenticalCampaignTemplateVar1Tier(config, broker, now, {
    priceExamples: 1,
    featuresMax: 1,
    descMax: 0,
    marketText: false,
    marketTitle: false,
    tip: false,
    othersTeaser: false,
    mediaNote: true,
    forTemplate: true,
  }));
}

function buildTemplateMarketingVar1OneLine(config, broker, now) {
  return buildTemplateMarketingVar1Compact(config, broker, now);
}

/** Lista de variantes do {{1}} — layout identico ao direct primeiro, depois fallbacks. */
function getTemplateVar1Candidates(config, broker, now) {
  var ctx = buildCampaignContext(config, broker, now);
  var f = ctx.featured;
  var portfolioUrl = getPortfolioUrl(ctx.siteUrl);
  var propUrl = f ? getPropertyPageUrlForTemplate(f, ctx.siteUrl) : portfolioUrl;
  var titlePlain = f ? stripAccentsForTemplate(f.title) : '';
  var identical = getIdenticalTemplateVar1Candidates(config, broker, now);
  var fallbacks = [
    finalizeTemplateVar1Body(buildTemplateMarketingVar1(config, broker, now)),
    finalizeTemplateVar1Body(buildTemplateMarketingVar1Compact(config, broker, now)),
    finalizeTemplateVar1Body(
      'Ola, ' + ctx.firstName + '! Obrigado pela parceria.\n\n' +
      (f ? ('Destaque: ' + titlePlain + '\nEmpreendimento: ' + propUrl + '\n') : '') +
      'Portfolio: ' + portfolioUrl + '\nSuporte comercial: ' + ctx.contato
    ),
    sanitizeWhatsAppTemplateParam(ctx.firstName),
  ];
  var out = [];
  var seen = {};
  var i;
  for (i = 0; i < identical.length; i++) {
    if (!seen[identical[i]]) {
      seen[identical[i]] = true;
      out.push(identical[i]);
    }
  }
  for (i = 0; i < fallbacks.length; i++) {
    if (!seen[fallbacks[i]]) {
      seen[fallbacks[i]] = true;
      out.push(fallbacks[i]);
    }
  }
  return out;
}

function buildTemplateVar1Components(config, broker, now, variantIndex) {
  var list = getTemplateVar1Candidates(config, broker, now);
  var idx = variantIndex != null ? variantIndex : 0;
  if (idx < 0 || idx >= list.length) idx = 0;
  return [{
    type: 'body',
    parameters: [{ type: 'text', text: list[idx] }],
  }];
}

function buildSimpleCampaignSingleBody(config, broker, now) {
  return buildTemplateMarketingVar1(config, broker, now);
}

function buildCampanhaCorretorBodyComponents(config, broker, now, useSimple) {
  var bodyText = useSimple
    ? buildTemplateMarketingVar1(config, broker, now)
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
  var minCap = getFeaturedMinSalePrice(f);
  return [
    '⭐ ' + f.title + ' — a partir de ' + formatPriceBr(minCap != null ? minCap : f.price),
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

function normalizeCampaignTemplateName(raw) {
  return String(raw || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

/**
 * Fotos/video para corretor sem janela 24h — via templates Meta com cabecalho IMAGE/VIDEO.
 * Requer modelos aprovados campanha_corretor_foto e campanha_corretor_video.
 */
async function sendBrokerCampaignTemplateMedia(
  waPhone, config, broker, now, waSendOpts, sendTemplateMessage
) {
  if (!sendTemplateMessage) {
    return { sent: 0, errors: ['API template indisponivel'], mode: 'template_media' };
  }
  var week = getWeekOfYearNumber(now);
  var featured = getFeaturedPropertyForWeek(week, config.featuredPropertyId);
  if (!featured) {
    return { sent: 0, skipped: true, reason: 'Sem empreendimento em destaque', mode: 'template_media' };
  }

  var lang = config.templateLanguage || 'pt_BR';
  var imageTpl = normalizeCampaignTemplateName(config.templateMediaImageName || 'campanha_corretor_foto');
  var videoTpl = normalizeCampaignTemplateName(config.templateMediaVideoName || 'campanha_corretor_video');
  var ctx = buildCampaignContext(config, broker, now);
  var captions = buildMediaCaptions(config, broker, now);
  var lists = getPropertyMediaLists(featured);
  var maxImg = ctx.maxImages > 0 ? ctx.maxImages : 2;
  var maxVid = ctx.maxVideos > 0 ? ctx.maxVideos : 1;
  var images = lists.images.slice(0, maxImg);
  var videos = lists.videos.slice(0, maxVid);
  var sent = 0;
  var errors = [];
  var waMessageId = '';
  var i;

  await delayMs(900);

  for (i = 0; i < images.length; i++) {
    try {
      var imgResp = await sendTemplateMessage(waPhone, imageTpl, lang, [{
        type: 'header',
        parameters: [{ type: 'image', image: { link: images[i] } }],
      }], waSendOpts);
      if (imgResp && imgResp.messageId) waMessageId = imgResp.messageId;
      sent += 1;
      if (i < images.length - 1) await delayMs(1400);
    } catch (imgErr) {
      errors.push('template_foto: ' + (imgErr.message || String(imgErr)));
      break;
    }
  }

  if (videos.length) {
    try {
      await delayMs(1200);
      var vidResp = await sendTemplateMessage(waPhone, videoTpl, lang, [{
        type: 'header',
        parameters: [{ type: 'video', video: { link: videos[0] } }],
      }], waSendOpts);
      if (vidResp && vidResp.messageId) waMessageId = vidResp.messageId;
      sent += 1;
    } catch (vidErr) {
      errors.push('template_video: ' + (vidErr.message || String(vidErr)));
    }
  }

  return {
    sent: sent,
    mode: 'template_media',
    imageTemplate: imageTpl,
    videoTemplate: videoTpl,
    errors: errors,
    waMessageId: waMessageId,
    skipped: sent === 0 && errors.length > 0,
    reason: sent === 0 && errors.length > 0
      ? 'Templates de midia nao enviados. Cadastre campanha_corretor_foto e campanha_corretor_video na Meta.'
      : '',
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
    featuredPrice: featured ? formatPriceBr(getFeaturedMinSalePrice(featured) || featured.price) : '',
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
  buildTemplateMarketingVar1,
  buildTemplateMarketingVar1Compact,
  getTemplateVar1Candidates,
  buildTemplateVar1Components,
  getPropertyPageUrlForTemplate,
  buildPremiumFollowUpText,
  buildPremiumFollowUpTextForTemplate,
  buildRichCampaignSingleBody,
  buildCampanhaCorretorBodyComponents,
  sendBrokerCampaignFollowUpMedia,
  sendBrokerCampaignTemplateMedia,
  sendBrokerCampaignDirect,
  getFeaturedPropertyForWeek,
  getCampaignWeekPreview,
  getCampaignPropertiesForAdmin,
  getWeekOfYearNumber,
  getPropertyPageUrl,
  resolveMarketSnippet,
  MARKET_SNIPPETS,
};
