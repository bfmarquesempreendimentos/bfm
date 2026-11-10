'use strict';

var JUNK_TOKEN = /^(representante|legal|outros|t[eé]cnico|empresa|forma[cç][aã]o|cpf|crea|cau|data|respons[aá]vel|avaliador|engenharia|arquitetura|civil|matr[ií]cula|consultoria|engineering|service|consulting|projetos|ltda|residencial|unifamiliar|vistoria|uso|modelo|folha|unidade|pr[eé]dio)$/i;
var NAME_STOP = /^(LTDA|LTDA\.|ME|EIRELI|CNPJ|CPF|EMPRESA|REPRESENTANTE|DATA|ENGENHARIA|ENGINEERING|CONSULTORIA|SERVICE|CONSULTING|PROJETOS|BLACK|STONE|ARQ|&)$/i;
var PARTICLE = /^(d[aeo]s?|e)$/i;
var RESP_LABEL = 'Respons\\S{0,3}vel\\s+T\\S{0,3}cnico';

function normalize(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function flatten(text) {
  return normalize(text).replace(/\n/g, ' ').replace(/ {2,}/g, ' ');
}

function parseBrMoney(raw) {
  var t = String(raw || '').replace(/[^\d,.-]/g, '');
  if (!t) return '';
  if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.');
  var n = Number(t);
  return isFinite(n) && n > 0 ? n : '';
}

function ymdFromParts(d, m, y) {
  var dd = String(d).padStart(2, '0');
  var mm = String(m).padStart(2, '0');
  var yy = String(y);
  if (!/^\d{4}$/.test(yy) || Number(yy) < 1990 || Number(yy) > 2100) return '';
  if (Number(mm) < 1 || Number(mm) > 12) return '';
  if (Number(dd) < 1 || Number(dd) > 31) return '';
  return yy + '-' + mm + '-' + dd;
}

function dateFromDocName(name) {
  var m = String(name || '').match(/(\d{1,2})[-:._\/](\d{1,2})[-:._\/](\d{4})/);
  if (!m) return '';
  return ymdFromParts(m[1], m[2], m[3]);
}

function cleanName(raw) {
  return String(raw || '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^(FORMA[CÇ][AÃ]O|ENG\.?\s*CIVIL|ARQ(?:UITETO)?)\s+/i, '')
    .trim();
}

function isPersonName(raw) {
  var s = cleanName(raw);
  if (s.length < 8 || s.length > 80) return false;
  if (JUNK_TOKEN.test(s)) return false;
  if (/\d{3,}/.test(s) || /\b(LTDA|CNPJ)\b/i.test(s)) return false;
  var parts = s.split(' ').filter(Boolean);
  if (parts.length < 2 || parts.length > 7) return false;
  var i;
  for (i = 0; i < parts.length; i++) {
    if (PARTICLE.test(parts[i])) continue;
    if (JUNK_TOKEN.test(parts[i])) return false;
    if (!/^[A-Za-zÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç]/.test(parts[i])) return false;
  }
  return true;
}

function extractDate(text) {
  var t = normalize(text);
  var flat = flatten(text);
  var m = t.match(/Vistoria do im[oó]vel realizada em\s*(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/i);
  if (m) return ymdFromParts(m[1], m[2], m[3]);
  m = flat.match(/Data da\s*\|?\s*Vistoria[^\d]{0,80}(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/i);
  if (m) return ymdFromParts(m[1], m[2], m[3]);
  m = flat.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})\s*Residencial/i);
  if (m) return ymdFromParts(m[1], m[2], m[3]);
  m = flat.match(/Data da Vistoria[:\s]*(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/i);
  if (m) return ymdFromParts(m[1], m[2], m[3]);
  return '';
}

function inValorRange(n) {
  return n && n >= 30000 && n <= 8000000;
}

function inM2Range(n, valor) {
  if (!n || n < 800 || n > 20000) return false;
  if (valor && n >= Number(valor) * 0.35) return false;
  return true;
}

function extractApartmentTrio(text) {
  var t = flatten(text);
  var m = t.match(/(\d{1,3},\d{2})\s*(\d{1,3}\.\d{3},\d{2})\s*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+,\d{2})/);
  if (!m) return null;
  var area = parseBrMoney(m[1]);
  var m2 = parseBrMoney(m[2]);
  var valor = parseBrMoney(m[3]);
  if (!(area && area >= 15 && area <= 400)) return null;
  if (!inValorRange(valor)) return null;
  if (!inM2Range(m2, valor)) return null;
  return { areaM2: area, valuePerM2: m2, engineeringValue: valor };
}

function extractValorAvaliacao(text) {
  var t = flatten(text);
  var m = t.match(/([\d.]{1,12},\d{2})\s*\(([A-ZÁÉÍÓÚÃÕÇ ]{8,})\)\s*Valor de Avalia/i);
  if (m && inValorRange(parseBrMoney(m[1]))) return parseBrMoney(m[1]);
  m = t.match(/Valor de Avalia[^\d]{0,40}R\$\s*([\d.]{1,12},\d{2})/i);
  if (m && inValorRange(parseBrMoney(m[1]))) return parseBrMoney(m[1]);
  m = t.match(/([\d.]{1,12},\d{2})\s+Valor de Avalia/i);
  if (m && inValorRange(parseBrMoney(m[1]))) return parseBrMoney(m[1]);
  m = t.match(/([\d.]{1,12},\d{2})\s+\((?:CENTO|DUZENTOS|TREZENTOS|QUATROCENTOS|QUINHENTOS|SEISCENTOS|SETECENTOS|OITOCENTOS|NOVECENTOS|MIL)/i);
  if (m && inValorRange(parseBrMoney(m[1]))) return parseBrMoney(m[1]);
  return '';
}

function extractValorM2(text, engineeringValue) {
  var t = normalize(text);
  var flat = flatten(text).replace(/Valor unit[aá]rio\s*=[^A-Z\n]{0,120}/gi, ' ');
  var m = t.match(/(\d{1,3}\.\d{3},\d{2})\s*\n\s*[ÁA]rea.{0,12}\(m/i) ||
    flat.match(/(\d{1,3}\.\d{3},\d{2})\s+[ÁA]rea\s*\(m/i);
  if (m && inM2Range(parseBrMoney(m[1]), engineeringValue)) return parseBrMoney(m[1]);
  m = flat.match(/R\$\s*([\d.]{1,12},\d{2})\s*\/\s*m/i);
  if (m && inM2Range(parseBrMoney(m[1]), engineeringValue)) return parseBrMoney(m[1]);
  var area = extractAreaM2(t);
  if (engineeringValue && area) {
    var computed = Math.round((Number(engineeringValue) / Number(area)) * 100) / 100;
    if (inM2Range(computed, engineeringValue)) return computed;
  }
  return '';
}

function extractAreaM2(text) {
  var t = normalize(text);
  var m = t.match(/Privativa\s+da Unidade\s+(\d{1,3},\d{2})/i);
  if (m && parseBrMoney(m[1]) >= 15 && parseBrMoney(m[1]) <= 400) return parseBrMoney(m[1]);
  m = t.match(/Area privativa\s+(\d{1,3},\d{2})/i);
  if (m && parseBrMoney(m[1]) >= 15 && parseBrMoney(m[1]) <= 400) return parseBrMoney(m[1]);
  m = t.match(/Tipo de Valor Determinado[^\n]*\n(?:[^\n]*\n){0,3}[^\d]{0,20}(\d{2},\d{2})/);
  if (m && parseBrMoney(m[1]) >= 15 && parseBrMoney(m[1]) <= 400) return parseBrMoney(m[1]);
  return '';
}

function nameFromTokens(chunk) {
  var tokens = String(chunk || '').split(/\s*\|\s*|\s+/).filter(Boolean);
  var name = [];
  var i;
  for (i = 0; i < tokens.length; i++) {
    if (NAME_STOP.test(tokens[i]) || /\d/.test(tokens[i])) break;
    if (!/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(tokens[i]) && !PARTICLE.test(tokens[i])) break;
    if (JUNK_TOKEN.test(tokens[i]) && !PARTICLE.test(tokens[i])) break;
    if (name.length >= 2 && name.indexOf(tokens[i]) >= 0 && !PARTICLE.test(tokens[i])) break;
    name.push(tokens[i]);
    if (name.length >= 7) break;
  }
  var s = name.join(' ');
  return isPersonName(s) ? s : '';
}

function extractAppraiser(text) {
  var t = normalize(text);
  var flat = flatten(text);
  var n;
  var m = t.match(/Forma[cç][aã]o\s*\n\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ ]{8,70})\s*\n\s*CPF\/Matr/i);
  if (!m) m = flat.match(/Forma[cç][aã]o\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ ]{8,70})\s+CPF\/Matr/i);
  if (m) {
    n = cleanName(m[1]);
    if (isPersonName(n)) return n;
  }
  m = flat.match(/CREA\s*\/\s*CAU\s*\|?\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç' |]{6,90})/i);
  if (m) {
    n = nameFromTokens(m[1]);
    if (n) return n;
  }
  var re = new RegExp('CPF\\s*\\|\\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç\' |]{6,70}?)\\s*\\|\\s*' + RESP_LABEL, 'i');
  m = flat.match(re);
  if (m) {
    n = cleanName(m[1]);
    if (isPersonName(n)) return n;
  }
  re = new RegExp('([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ\' ]{8,60})\\s*\\|\\s*CPF\\/Matr[ií]cula\\s*' + RESP_LABEL, 'i');
  m = flat.match(re);
  if (m) {
    n = cleanName(m[1]);
    if (isPersonName(n)) return n;
  }
  re = new RegExp('\\n\\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ ]{8,60})\\s*\\n\\s*' + RESP_LABEL, 'i');
  m = t.match(re);
  if (m) {
    n = cleanName(m[1]);
    if (isPersonName(n)) return n;
  }
  return '';
}

function extractGarantiaCaixa(text) {
  var raw = flatten(text);
  var upper = raw.toUpperCase();
  if (/SOMOS FAVOR[AÁ]VEIS\s+[AÀ]\s+ACEITA/.test(upper) ||
      /SIM,?\s+SOMOS FAVOR[AÁ]VEIS/.test(upper)) {
    return { garantiaCaixa: 'apta', garantiaSnippet: 'Sim, somos favoráveis à aceitação do imóvel como garantia.' };
  }
  var markers = [
    'MANIFESTAÇÃO SOBRE A POSSIBILIDADE DE ACEITAÇÃO',
    'MANIFESTACAO SOBRE A POSSIBILIDADE DE ACEITACAO',
    'COM BASE NOS SUBSÍDIOS DISPONÍVEIS',
    'COM BASE NOS SUBSIDIOS DISPONIVEIS',
    'JUSTIFICATIVA GARANTIA',
  ];
  var idx = -1;
  var i;
  for (i = 0; i < markers.length; i++) {
    idx = upper.lastIndexOf(markers[i]);
    if (idx >= 0) break;
  }
  if (idx < 0) {
    if (/N[AÃ]O\s+ATENDE\s+AOS\s+REQUISITOS\s+M[IÍ]NIMOS\s+ESTABELECIDOS\s+PELA\s+CAIXA/.test(upper)) {
      return { garantiaCaixa: 'inapta', garantiaSnippet: '' };
    }
    return { garantiaCaixa: '', garantiaSnippet: '' };
  }
  var window = upper.slice(idx, idx + 1800);
  var snippet = raw.slice(idx, idx + 360);
  if (/N[AÃ]O\s+ATENDE(?!U)\s+AOS\s+REQUISITOS\s+M[IÍ]NIMOS/.test(window) ||
      /N[AÃ]O\s+[ÉE]\s+PASS[IÍ]VEL/.test(window) ||
      /N[AÃ]O\s+POSSUI\s+INFRA/.test(window) ||
      /IMPOSSIBILIDADE\s+DE\s+ACEITA/.test(window)) {
    return { garantiaCaixa: 'inapta', garantiaSnippet: snippet };
  }
  if (/[ÉE]\s+PASS[IÍ]VEL\s+DE\s+ACEITA/.test(window) ||
      /(?:^|[^\w])ATENDE\s+AOS\s+REQUISITOS\s+M[IÍ]NIMOS/.test(window) ||
      /IM[OÓ]VEL\s+AVALIADO\s+ATENDE/.test(window)) {
    return { garantiaCaixa: 'apta', garantiaSnippet: snippet };
  }
  return { garantiaCaixa: '', garantiaSnippet: snippet };
}

function extractUnitHint(text) {
  var flat = flatten(text);
  var m = flat.match(/\bUnidade\s+(\d{2,3})\b/i);
  if (m) return m[1];
  m = flat.match(/\bAPTO\s*(\d{2,3})\b/i);
  return m ? m[1] : '';
}

function unitNumberFromLabel(code) {
  var all = String(code || '').match(/\d{1,4}/g);
  if (!all || !all.length) return '';
  return String(Number(all[all.length - 1]));
}

function unitHintMatches(hint, unitCode) {
  if (hint == null || hint === '') return true;
  var want = unitNumberFromLabel(unitCode);
  if (!want) return true;
  return String(Number(hint)) === want;
}

function foldPt(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripStreetNoise(s) {
  return foldPt(s)
    .replace(/\b(rua|r|av|avenida|travessa|estrada|dr|dra|doutor|doutora|n|no|nro|numero|lt|lote|qd|quadra)\b/g, ' ')
    .replace(/\b(de|da|do|dos|das)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function distinctiveTokens(s) {
  return stripStreetNoise(s).split(' ').filter(function(t) {
    return t.length >= 4 && !/^\d+$/.test(t);
  });
}

function tokenOverlapCount(a, b) {
  var A = distinctiveTokens(a);
  var B = distinctiveTokens(b);
  var n = 0;
  A.forEach(function(t) { if (B.indexOf(t) >= 0) n += 1; });
  return { n: n, a: A, b: B };
}

function catalogStreetNumber(street) {
  var s = String(street || '').replace(/\b(lt|lote|qd|quadra)\s*\.?\s*\d+\b/gi, '');
  var m = s.match(/,\s*n[ºo°]?\s*(\d{1,5})\b/i) || s.match(/,\s*(\d{1,5})\b/) || s.match(/\b(\d{2,5})\s*$/);
  return m ? String(Number(m[1])) : '';
}

function extractAddressHint(text) {
  var flat = flatten(text);
  var out = { addressStreet: '', addressNumber: '', addressCity: '', addressRaw: '' };
  var m = flat.match(/\bR(?:UA)?\s+([A-Za-zÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç0-9 .'-]{4,80}?),?\s+(\d{1,5}),?\s+Unidade\s+(\d{1,3})\b/i);
  if (m) {
    out.addressStreet = m[1].replace(/\s+/g, ' ').trim();
    out.addressNumber = String(Number(m[2]));
    out.addressRaw = ('R ' + out.addressStreet + ', ' + m[2] + ', Unidade ' + m[3]).replace(/\s+/g, ' ');
  }
  var c = flat.match(/([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ ]{2,40})\s+Munic[ií]pio do Im[oó]vel/i);
  if (c) out.addressCity = c[1].replace(/\s+/g, ' ').trim();
  return out;
}

function describeExtractedPlace(extracted) {
  if (!extracted) return 'outro endereço';
  if (extracted.addressStreet) {
    var s = 'R ' + extracted.addressStreet;
    if (extracted.addressNumber) s += ', ' + extracted.addressNumber;
    if (extracted.addressCity) s += ' · ' + extracted.addressCity;
    return s;
  }
  return extracted.addressCity || 'outro endereço';
}

function guessConflictingProperty(extracted, property, allProperties) {
  var best = null;
  var bestN = 0;
  (allProperties || []).forEach(function(p) {
    if (!p || !extracted || !extracted.addressStreet) return;
    if (property && foldPt(p.street || '') === foldPt(property.street || '') &&
        foldPt(p.officialName || '') === foldPt(property.officialName || '')) return;
    var ov = tokenOverlapCount(extracted.addressStreet, p.street || '');
    if (ov.n > bestN) {
      bestN = ov.n;
      best = p;
    }
  });
  return bestN >= 2 ? best : null;
}

function addressMismatch(extracted, property, allProperties) {
  if (!extracted || !property) return '';
  var gotStreet = extracted.addressStreet || '';
  var gotNum = extracted.addressNumber || '';
  var gotCity = extracted.addressCity || '';
  if (!gotStreet && !gotCity) return '';
  var wantStreet = property.street || '';
  var wantCity = property.city || '';
  var expected = wantStreet || property.officialName || 'este empreendimento';
  var streetOv = tokenOverlapCount(gotStreet, wantStreet);
  var cityOv = tokenOverlapCount(gotCity, wantCity);
  var place = describeExtractedPlace(extracted);
  var other = guessConflictingProperty(extracted, property, allProperties);
  var otherName = other && other.officialName ? other.officialName : '';
  if (gotStreet && streetOv.b.length && streetOv.n === 0) {
    if (otherName) {
      return 'Este PDF é do ' + otherName + ' (' + place + '), não de ' + expected + '. Anexe o laudo deste endereço.';
    }
    return 'Este PDF é de ' + place + ', não de ' + expected + '. Anexe o laudo deste endereço.';
  }
  var wantNum = catalogStreetNumber(wantStreet);
  if (gotStreet && streetOv.n > 0 && wantNum && gotNum && wantNum !== gotNum) {
    return 'Este PDF é do nº ' + gotNum + ' (' + place + '), não de ' + expected + '.';
  }
  if (!gotStreet && gotCity && cityOv.b.length && cityOv.n === 0) {
    return 'Este PDF é de ' + gotCity + ', não de ' + (wantCity || expected) + '. Anexe o laudo deste endereço.';
  }
  return '';
}

function laudoIdentityError(extracted, property, unitCode, allProperties) {
  if (!extracted) return '';
  if (extracted.unitHint && unitCode && !unitHintMatches(extracted.unitHint, unitCode)) {
    return 'Este PDF é da unidade ' + extracted.unitHint + ', não da ' + unitCode + '. Anexe o laudo desta unidade.';
  }
  return addressMismatch(extracted, property, allProperties);
}

function extractLaudoFields(text, fileName) {
  var trio = extractApartmentTrio(text);
  var addr = extractAddressHint(text);
  var out = {
    appraisalDate: extractDate(text),
    appraiser: extractAppraiser(text),
    engineeringValue: trio ? trio.engineeringValue : extractValorAvaliacao(text),
    valuePerM2: trio ? trio.valuePerM2 : '',
    garantiaCaixa: '',
    garantiaSnippet: '',
    unitHint: extractUnitHint(text),
    addressStreet: addr.addressStreet,
    addressNumber: addr.addressNumber,
    addressCity: addr.addressCity,
    addressRaw: addr.addressRaw,
    textLength: flatten(text).length,
  };
  if (!out.valuePerM2) out.valuePerM2 = extractValorM2(text, out.engineeringValue);
  var garantia = extractGarantiaCaixa(text);
  out.garantiaCaixa = garantia.garantiaCaixa;
  out.garantiaSnippet = garantia.garantiaSnippet;
  if (out.appraiser && !isPersonName(out.appraiser)) out.appraiser = '';
  if (out.valuePerM2 && !inM2Range(out.valuePerM2, out.engineeringValue)) out.valuePerM2 = '';
  return out;
}

async function extractLaudoFromPdf(buffer, fileName) {
  var pdfParse;
  try {
    pdfParse = require('pdf-parse/lib/pdf-parse.js');
  } catch (e1) {
    try {
      pdfParse = require('pdf-parse');
    } catch (e2) {
      return extractLaudoFields('', fileName);
    }
  }
  try {
    var data = await pdfParse(buffer);
    var out = extractLaudoFields(data && data.text, fileName);
    console.log('extractLaudoFromPdf', {
      fileName: fileName || '',
      textLength: (data && data.text && data.text.length) || 0,
      appraisalDate: out.appraisalDate,
      appraiser: out.appraiser,
      engineeringValue: out.engineeringValue,
      valuePerM2: out.valuePerM2,
      garantiaCaixa: out.garantiaCaixa,
      unitHint: out.unitHint,
      addressStreet: out.addressStreet,
      addressNumber: out.addressNumber,
      addressCity: out.addressCity,
    });
    return out;
  } catch (err) {
    console.warn('extractLaudoFromPdf:', err && err.message);
    return extractLaudoFields('', fileName);
  }
}

module.exports = {
  extractLaudoFields,
  extractLaudoFromPdf,
  extractGarantiaCaixa,
  dateFromDocName,
  isPersonName,
  extractUnitHint,
  unitHintMatches,
  unitNumberFromLabel,
  extractAddressHint,
  addressMismatch,
  laudoIdentityError,
};
