'use strict';

var dossierSeed = require('./property-dossier-seed.json');
var {
  extractLaudoFromPdf,
  extractLaudoFields,
  unitHintMatches,
  addressMismatch,
  foldPt,
  distinctiveTokens,
} = require('./laudo-extract');

function seedPropertyById(pid) {
  var bag = (dossierSeed && dossierSeed.properties) || {};
  return bag[String(pid)] || null;
}

function allSeedProperties() {
  var bag = (dossierSeed && dossierSeed.properties) || {};
  return Object.keys(bag).map(function(id) {
    var p = bag[id] || {};
    return {
      id: String(p.propertyId || id),
      officialName: p.officialName || '',
      street: p.street || '',
      neighborhood: p.neighborhood || '',
      city: p.city || '',
      cartorio: p.cartorio || '',
      units: p.units || [],
    };
  });
}

function seedUnitByCode(pid, unitCode) {
  var p = seedPropertyById(pid);
  if (!p || !Array.isArray(p.units)) return null;
  var want = String(unitCode || '');
  var i;
  for (i = 0; i < p.units.length; i++) {
    if (String(p.units[i].code) === want) return p.units[i];
  }
  return null;
}

function uniqueMarkers(property, all) {
  var mine = distinctiveTokens([
    property && property.street,
    property && property.neighborhood,
    property && property.officialName,
  ].join(' '));
  var other = {};
  (all || []).forEach(function(p) {
    if (!p || !property) return;
    if (foldPt(p.street || '') === foldPt(property.street || '') &&
        foldPt(p.officialName || '') === foldPt(property.officialName || '')) return;
    distinctiveTokens([p.street, p.neighborhood, p.officialName].join(' ')).forEach(function(t) {
      other[t] = true;
    });
  });
  return mine.filter(function(t) { return t.length >= 5 && !other[t]; });
}

function unitFromFileName(name) {
  var m = String(name || '').match(/\b(?:casa|cs|apto|apartamento|unidade|ap)\s*_?-?\s*0*(\d{1,3})\b/i);
  return m ? String(Number(m[1])) : '';
}

function extractMatriculaHint(text) {
  var m = String(text || '').replace(/\s+/g, ' ').match(/matr[ií]cula\s*(?:n[ºo°]?\s*)?(\d{1,3}(?:\.\d{3})+)/i);
  return m ? m[1] : '';
}

function normalizeMatricula(s) {
  return String(s || '').replace(/[^\d]/g, '');
}

function foreignPropertyError(haystack, property, all) {
  if (!property) return '';
  var hay = foldPt(haystack);
  if (!hay) return '';
  var hit = '';
  (all || []).some(function(p) {
    if (!p) return false;
    if (foldPt(p.street || '') === foldPt(property.street || '') &&
        foldPt(p.officialName || '') === foldPt(property.officialName || '')) return false;
    return uniqueMarkers(p, all).some(function(m) {
      if (hay.indexOf(m) >= 0) {
        hit = p.officialName || p.street || '';
        return true;
      }
      return false;
    });
  });
  if (!hit) return '';
  var expected = property.street || property.officialName || 'este empreendimento';
  return 'Este PDF é do ' + hit + ', não de ' + expected + '. Anexe o documento deste endereço.';
}

function documentIdentityError(opts) {
  opts = opts || {};
  var extracted = opts.extracted || {};
  var property = opts.property || null;
  var unitCode = String(opts.unitCode || '');
  var expectedMatricula = opts.expectedMatricula || '';
  var fileName = opts.fileName || '';
  var all = opts.allProperties || allSeedProperties();
  var kind = opts.kind || 'documento';
  var unitHint = extracted.unitHint || unitFromFileName(fileName);
  if (unitHint && unitCode && !unitHintMatches(unitHint, unitCode)) {
    return 'Este PDF é da unidade ' + unitHint + ', não da ' + unitCode + '. Anexe o ' + kind + ' desta unidade.';
  }
  var addrErr = addressMismatch(extracted, property, all);
  if (addrErr) return addrErr.replace(/\blaudos?\b/gi, kind);
  var hay = [
    extracted.identityHaystack,
    fileName,
    extracted.addressStreet,
    extracted.addressCity,
    extracted.addressRaw,
    extracted.appraiser,
  ].join(' ');
  var foreign = foreignPropertyError(hay, property, all);
  if (foreign) return foreign;
  var mat = extracted.matricula || extractMatriculaHint(extracted.identityHaystack || '');
  if (mat && expectedMatricula &&
      normalizeMatricula(mat) &&
      normalizeMatricula(expectedMatricula) &&
      normalizeMatricula(mat) !== normalizeMatricula(expectedMatricula)) {
    return 'Este PDF é da matrícula ' + mat + ', não da ' + expectedMatricula + '.';
  }
  return '';
}

function extractedForClient(extracted) {
  if (!extracted) return extracted;
  var out = Object.assign({}, extracted);
  delete out.identityHaystack;
  return out;
}

async function assertPdfBelongsToUnit(buffer, fileName, opts) {
  opts = opts || {};
  var extracted = await extractLaudoFromPdf(buffer, fileName);
  if (!extracted.unitHint) extracted.unitHint = unitFromFileName(fileName);
  var property = opts.property || seedPropertyById(opts.propertyId);
  var unit = opts.unitCode ? seedUnitByCode(opts.propertyId, opts.unitCode) : null;
  var error = documentIdentityError({
    extracted: extracted,
    property: property,
    unitCode: opts.unitCode || '',
    expectedMatricula: opts.matricula || (unit && unit.matricula) || '',
    fileName: fileName,
    allProperties: allSeedProperties(),
    kind: opts.kind || 'documento',
  });
  return { extracted: extracted, error: error };
}

module.exports = {
  seedPropertyById,
  seedUnitByCode,
  allSeedProperties,
  uniqueMarkers,
  unitFromFileName,
  documentIdentityError,
  extractedForClient,
  assertPdfBelongsToUnit,
  extractLaudoFields,
};
