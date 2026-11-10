'use strict';

function flatten(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function parseBrMoney(raw) {
  var t = String(raw || '').replace(/[^\d,.-]/g, '');
  if (!t) return '';
  if (t.indexOf(',') >= 0) {
    t = t.replace(/\./g, '').replace(',', '.');
  }
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

function firstMatch(text, regs) {
  var i;
  var m;
  for (i = 0; i < regs.length; i++) {
    m = text.match(regs[i]);
    if (m) return m;
  }
  return null;
}

function cleanName(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .replace(/\b(CREA|Cau|CAU|Eng\.?|Arquiteto|Arquiteto\(a\))\b.*$/i, '')
    .replace(/[:;,.]+$/, '')
    .trim()
    .slice(0, 120);
}

function extractGarantiaCaixa(text) {
  var upper = flatten(text).toUpperCase();
  var markers = [
    'MANIFESTAÇÃO SOBRE A POSSIBILIDADE DE ACEITAÇÃO',
    'MANIFESTACAO SOBRE A POSSIBILIDADE DE ACEITACAO',
    'ACEITAÇÃO DO BEM COMO GARANTIA',
    'ACEITACAO DO BEM COMO GARANTIA',
    'POSSIBILIDADE DE ACEITAÇÃO DO IMÓVEL COMO GARANTIA',
    'POSSIBILIDADE DE ACEITACAO DO IMOVEL COMO GARANTIA',
    'REQUISITOS MÍNIMOS DE ENGENHARIA',
    'REQUISITOS MINIMOS DE ENGENHARIA',
    'COM BASE NOS SUBSÍDIOS DISPONÍVEIS',
    'COM BASE NOS SUBSIDIOS DISPONIVEIS',
  ];
  var idx = -1;
  var i;
  for (i = 0; i < markers.length; i++) {
    idx = upper.indexOf(markers[i]);
    if (idx >= 0) break;
  }
  var window = idx >= 0
    ? upper.slice(idx, idx + 2200)
    : upper.slice(Math.max(0, upper.length - 2200));
  var snippetSrc = flatten(text);
  var snippet = idx >= 0
    ? snippetSrc.slice(idx, idx + 420)
    : '';

  var negativa = [
    /\(\s*[XXx]\s*\)\s*N[AÃ]O\s+ATENDE/,
    /\[\s*[XXx]\s*\]\s*N[AÃ]O\s+ATENDE/,
    /N[AÃ]O\s+ATENDE\s+AOS\s+REQUISITOS/,
    /N[AÃ]O\s+[ÉE]\s+PASS[IÍ]VEL/,
    /IMPOSSIBILIDADE\s+DE\s+ACEITA/,
    /N[AÃ]O\s+RECOMEND/,
    /\bINAPTO\b/,
    /N[AÃ]O\s+ACEITA[CÇ][AÃ]O/,
  ];
  var positiva = [
    /\(\s*[XXx]\s*\)\s*ATENDE/,
    /\[\s*[XXx]\s*\]\s*ATENDE/,
    /CONCLUI-SE\s+QUE\s+O\s+IM[OÓ]VEL\s+ATENDE/,
    /O\s+IM[OÓ]VEL\s+ATENDE\s+AOS\s+REQUISITOS/,
    /ATENDE\s+AOS\s+REQUISITOS\s+M[IÍ]NIMOS/,
    /[ÉE]\s+PASS[IÍ]VEL\s+DE\s+ACEITA/,
    /PASS[IÍ]VEL\s+DE\s+ACEITA[CÇ][AÃ]O/,
    /POSS[IÍ]VEL\s+A\s+ACEITA[CÇ][AÃ]O/,
    /RECOMENDA-SE\s+A\s+ACEITA/,
  ];
  for (i = 0; i < negativa.length; i++) {
    if (negativa[i].test(window)) {
      return { garantiaCaixa: 'inapta', garantiaSnippet: snippet };
    }
  }
  for (i = 0; i < positiva.length; i++) {
    if (positiva[i].test(window)) {
      return { garantiaCaixa: 'apta', garantiaSnippet: snippet };
    }
  }
  if (/\bN[AÃ]O\b/.test(window) && /GARANTIA/.test(window) && !/\bSIM\b/.test(window)) {
    return { garantiaCaixa: 'inapta', garantiaSnippet: snippet };
  }
  if (/\bSIM\b/.test(window) && /ACEITA/.test(window)) {
    return { garantiaCaixa: 'apta', garantiaSnippet: snippet };
  }
  return { garantiaCaixa: '', garantiaSnippet: snippet };
}

function extractLaudoFields(text) {
  var t = flatten(text);
  var out = {
    appraisalDate: '',
    appraiser: '',
    engineeringValue: '',
    valuePerM2: '',
    garantiaCaixa: '',
    garantiaSnippet: '',
  };

  var date = firstMatch(t, [
    /Data\s+da\s+Vistoria[:\s]*(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{4})/i,
    /Data\s+da\s+inspe[cç][aã]o[:\s]*(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{4})/i,
    /Vistoria[:\s]*(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{4})/i,
    /Data\s+do\s+Laudo[:\s]*(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{4})/i,
  ]);
  if (date) out.appraisalDate = ymdFromParts(date[1], date[2], date[3]);

  var valor = firstMatch(t, [
    /Valor\s+de\s+Avalia[cç][aã]o[:\s]*R\$?\s*([\d.]{1,12},\d{2})/i,
    /Valor\s+de\s+Mercado[:\s]*R\$?\s*([\d.]{1,12},\d{2})/i,
  ]);
  if (valor) out.engineeringValue = parseBrMoney(valor[1]);

  var m2 = firstMatch(t, [
    /Valor\s+unit[aá]rio[:\s]*R\$?\s*([\d.]{1,12},\d{2})/i,
    /R\$\s*([\d.]{1,12},\d{2})\s*\/\s*m/i,
    /([\d.]{1,12},\d{2})\s*\/\s*m[²2]/i,
  ]);
  if (m2) out.valuePerM2 = parseBrMoney(m2[1]);

  var who = firstMatch(t, [
    /Respons[aá]vel\s+T[eé]cnico[:\s]*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç' ]{4,80})/,
    /Avaliador[:\s]*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç' ]{4,80})/,
  ]);
  if (who) out.appraiser = cleanName(who[1]);

  var garantia = extractGarantiaCaixa(t);
  out.garantiaCaixa = garantia.garantiaCaixa;
  out.garantiaSnippet = garantia.garantiaSnippet;
  return out;
}

async function extractLaudoFromPdf(buffer) {
  var pdfParse;
  try {
    pdfParse = require('pdf-parse/lib/pdf-parse.js');
  } catch (e1) {
    try {
      pdfParse = require('pdf-parse');
    } catch (e2) {
      return extractLaudoFields('');
    }
  }
  try {
    var data = await pdfParse(buffer);
    return extractLaudoFields(data && data.text);
  } catch (err) {
    console.warn('extractLaudoFromPdf:', err && err.message);
    return extractLaudoFields('');
  }
}

module.exports = {
  extractLaudoFields,
  extractLaudoFromPdf,
  extractGarantiaCaixa,
};
