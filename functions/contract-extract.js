'use strict';

var {
  extractAddressHint,
  extractUnitHint,
  isPersonName,
  foldPt,
  unitHintMatches,
} = require('./laudo-extract');
var { documentIdentityError, seedPropertyById, seedUnitByCode, allSeedProperties } = require('./property-identity');

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

function digitsOnly(s) {
  return String(s || '').replace(/\D/g, '');
}

function extractContractNumber(text) {
  var flat = flatten(text);
  var m = flat.match(/\b(\d{1,2}\.\d{4}\.\d{6,9}-\d)\b/);
  if (m) return m[1];
  m = flat.match(/contrato\s*(?:n[ºo°]|n[uú]mero|nro)?\s*[:.\-]?\s*([\d.\-\/]{8,24})/i);
  if (m) return m[1].replace(/\s+/g, '');
  m = flat.match(/\bSIOPI\b[^\d]{0,20}([\d.\-\/]{8,24})/i);
  if (m) return m[1].replace(/\s+/g, '');
  return '';
}

function extractBuyerCpf(text) {
  var flat = flatten(text);
  var m = flat.match(/\bCPF\b[^\d]{0,12}(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/i);
  if (m) return digitsOnly(m[1]);
  m = flat.match(/\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/);
  if (m) return digitsOnly(m[1]);
  return '';
}

function extractBuyerName(text) {
  var flat = flatten(text);
  var labels = 'proponente|mutu[aá]rio|comprador|adquirente|benefici[aá]rio|cliente';
  var re = new RegExp('(?:' + labels + ')\\s*[:.\\-]?\\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç\' ]{6,80})', 'i');
  var m = flat.match(re);
  if (m) {
    var n = m[1].replace(/\s+/g, ' ').trim();
    n = n.replace(/\b(CPF|RG|nacionalidade|brasileir[oa]|estado civil).*$/i, '').trim();
    if (isPersonName(n) || n.split(' ').length >= 2) return n;
  }
  return '';
}

function extractSaleValue(text) {
  var flat = flatten(text);
  var m = flat.match(/valor\s+(?:de\s+)?compra\s+e\s+venda[^\d]{0,50}R\$\s*([\d.]{1,12},\d{2})/i);
  if (m && parseBrMoney(m[1])) return parseBrMoney(m[1]);
  m = flat.match(/valor\s+(?:do\s+)?im[oó]vel[^\d]{0,40}R\$\s*([\d.]{1,12},\d{2})/i);
  if (m && parseBrMoney(m[1])) return parseBrMoney(m[1]);
  m = flat.match(/pre[cç]o\s+(?:de\s+)?venda[^\d]{0,40}R\$\s*([\d.]{1,12},\d{2})/i);
  if (m && parseBrMoney(m[1])) return parseBrMoney(m[1]);
  return '';
}

function extraAddress(text, addr) {
  var flat = flatten(text);
  if (addr && addr.addressStreet) return addr;
  var m = flat.match(/endere[cç]o\s+do\s+im[oó]vel\s*[:.]?\s*(?:r(?:ua)?|av(?:enida)?\.?)?\s*([A-Za-zÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç0-9 .'-]{4,80}?),?\s*(?:n[ºo°]?\s*)?(\d{1,5})/i);
  if (!m) return addr || { addressStreet: '', addressNumber: '', addressCity: '', addressRaw: '' };
  return {
    addressStreet: m[1].replace(/\s+/g, ' ').trim(),
    addressNumber: String(Number(m[2])),
    addressCity: (addr && addr.addressCity) || '',
    addressRaw: (m[1] + ', ' + m[2]).replace(/\s+/g, ' '),
  };
}

function extraUnitHint(text, hint) {
  if (hint) return hint;
  var flat = flatten(text);
  var m = flat.match(/\b(?:casa|cs)\s*_?-?\s*0*(\d{1,3})\b/i);
  if (m) return String(Number(m[1]));
  m = flat.match(/\bapartamento\s*n[ºo°]?\s*0*(\d{2,3})\b/i);
  if (m) return String(Number(m[1]));
  return '';
}

function extractContractFields(text, fileName) {
  var addr = extraAddress(text, extractAddressHint(text));
  var out = {
    contractNumber: extractContractNumber(text),
    buyerName: extractBuyerName(text),
    buyerCpf: extractBuyerCpf(text),
    saleValue: extractSaleValue(text),
    unitHint: extraUnitHint(text, extractUnitHint(text)),
    addressStreet: addr.addressStreet,
    addressNumber: addr.addressNumber,
    addressCity: addr.addressCity,
    addressRaw: addr.addressRaw,
    identityHaystack: flatten(text).slice(0, 5000),
    textLength: flatten(text).length,
    fileName: fileName || '',
  };
  return out;
}

async function pdfText(buffer) {
  var pdfParse;
  try {
    pdfParse = require('pdf-parse/lib/pdf-parse.js');
  } catch (e1) {
    try {
      pdfParse = require('pdf-parse');
    } catch (e2) {
      return '';
    }
  }
  try {
    var data = await pdfParse(buffer);
    return (data && data.text) || '';
  } catch (err) {
    console.warn('extractContractFromPdf:', err && err.message);
    return '';
  }
}

async function extractContractFromPdf(buffer, fileName) {
  var text = await pdfText(buffer);
  var out = extractContractFields(text, fileName);
  console.log('extractContractFromPdf', {
    fileName: fileName || '',
    textLength: out.textLength,
    contractNumber: out.contractNumber,
    buyerName: out.buyerName,
    buyerCpf: out.buyerCpf ? '***' : '',
    saleValue: out.saleValue,
    unitHint: out.unitHint,
    addressStreet: out.addressStreet,
    addressNumber: out.addressNumber,
  });
  return out;
}

function namesMatch(a, b) {
  var A = foldPt(a).split(' ').filter(function(t) { return t.length > 1; });
  var B = foldPt(b).split(' ').filter(function(t) { return t.length > 1; });
  if (A.length < 2 || B.length < 2) return true;
  return A[0] === B[0] && A[A.length - 1] === B[B.length - 1];
}

function moneyClose(a, b) {
  var n = Number(a);
  var m = Number(b);
  if (!n || !m) return true;
  return Math.abs(n - m) / Math.max(n, m) <= 0.03;
}

function contractMatchError(extracted, expected) {
  expected = expected || {};
  extracted = extracted || {};
  if (!extracted.textLength) return '';
  var property = expected.property || seedPropertyById(expected.propertyId);
  var unit = expected.unitCode ? seedUnitByCode(expected.propertyId, expected.unitCode) : null;
  var idErr = documentIdentityError({
    extracted: extracted,
    property: property,
    unitCode: expected.unitCode || '',
    expectedMatricula: expected.matricula || (unit && unit.matricula) || '',
    fileName: extracted.fileName || expected.fileName || '',
    allProperties: allSeedProperties(),
    kind: 'contrato',
  });
  if (idErr) return idErr;
  var formCpf = digitsOnly(expected.clientCPF);
  if (formCpf && extracted.buyerCpf && formCpf !== extracted.buyerCpf) {
    return 'O CPF do contrato não é o mesmo informado no cadastro da venda.';
  }
  var formNum = digitsOnly(expected.contractNumber);
  var pdfNum = digitsOnly(extracted.contractNumber);
  if (formNum && pdfNum && formNum !== pdfNum) {
    return 'O número do contrato no PDF (' + extracted.contractNumber + ') não confere com o informado.';
  }
  if (expected.clientName && extracted.buyerName && !namesMatch(expected.clientName, extracted.buyerName)) {
    return 'O comprador no contrato (' + extracted.buyerName + ') não confere com ' + expected.clientName + '.';
  }
  if (expected.salePrice && extracted.saleValue && !moneyClose(expected.salePrice, extracted.saleValue)) {
    return 'O valor no contrato (R$ ' + Number(extracted.saleValue).toLocaleString('pt-BR') + ') não confere com o valor da venda.';
  }
  return '';
}

module.exports = {
  extractContractFields,
  extractContractFromPdf,
  extractContractNumber,
  contractMatchError,
  namesMatch,
  digitsOnly,
};
