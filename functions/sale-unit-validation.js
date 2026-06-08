'use strict';

/** Espelha js/property-units.js — validação de unidade no servidor. */
const propertyUnits = require('./chatbot/property-units-data');

/** Empreendimentos fora do cadastro de vendas (ex.: Porto Novo oculto). */
const SALES_EXCLUDED_PROPERTY_IDS = { 1: true };

function normalizeUnitSlotToken(raw) {
  if (raw == null || raw === '') return '';
  return String(raw).toLowerCase().replace(/\s+/g, ' ').trim();
}

function normAlnumUnit(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getPropertyUnitsRaw(propertyId) {
  if (propertyId == null || propertyId === '') return null;
  if (SALES_EXCLUDED_PROPERTY_IDS[Number(propertyId)]) return null;
  var pidNum = Number(propertyId);
  if (!isNaN(pidNum) && propertyUnits[pidNum]) return propertyUnits[pidNum];
  if (propertyUnits[propertyId]) return propertyUnits[propertyId];
  return propertyUnits[String(propertyId)] || null;
}

function formatUnitCodesHint(units, max) {
  max = max != null ? max : 8;
  if (!units || !units.length) return '';
  var slice = units.slice(0, max);
  var codes = [];
  var i;
  for (i = 0; i < slice.length; i++) codes.push(slice[i].code);
  var hint = codes.join(', ');
  if (units.length > max) hint += '… (+' + (units.length - max) + ')';
  return hint;
}

function fuzzyMatchUnitInList(units, unitInputRaw) {
  var input = normalizeUnitSlotToken(unitInputRaw);
  var inputA = normAlnumUnit(unitInputRaw);
  if (!inputA) return null;
  var i;
  var u;
  var matches = [];
  var tokens = input ? input.split(' ').filter(function(t) { return !!t; }) : [];

  if (/^\d+$/.test(inputA)) {
    for (i = 0; i < units.length; i++) {
      u = units[i];
      var uA = normAlnumUnit(u.code);
      if (uA === inputA || uA.slice(-inputA.length) === inputA) matches.push(u);
    }
    if (matches.length === 1) return matches[0];
    matches = [];
  }

  for (i = 0; i < units.length; i++) {
    u = units[i];
    var uNorm = normalizeUnitSlotToken(u.code);
    var uA2 = normAlnumUnit(u.code);
    if (uNorm === input || uA2 === inputA) return u;
    if (inputA.length >= 3 && (uA2.indexOf(inputA) >= 0 || inputA.indexOf(uA2) >= 0)) {
      matches.push(u);
      continue;
    }
    if (tokens.length) {
      var ok = true;
      var ti;
      for (ti = 0; ti < tokens.length; ti++) {
        var tokA = normAlnumUnit(tokens[ti]);
        if (uNorm.indexOf(tokens[ti]) < 0 && uA2.indexOf(tokA) < 0) {
          ok = false;
          break;
        }
      }
      if (ok) matches.push(u);
    }
  }

  if (matches.length === 1) return matches[0];
  return null;
}

/**
 * Resolve slot de venda (mesma lógica do painel admin).
 * @returns {{ saleSlotKey: string|null, unitCode: string|null, single: boolean, error: string|null }}
 */
function resolveSaleSlot(propertyId, unitInputRaw) {
  if (SALES_EXCLUDED_PROPERTY_IDS[Number(propertyId)]) {
    return {
      saleSlotKey: null,
      unitCode: null,
      single: false,
      error: 'Este empreendimento não está disponível para cadastro de vendas.',
    };
  }
  var raw = getPropertyUnitsRaw(propertyId);
  if (!raw || !raw.units || !raw.units.length) {
    return {
      saleSlotKey: null,
      unitCode: null,
      single: false,
      error: 'Empreendimento sem unidades cadastradas no sistema.',
    };
  }
  var units = raw.units;
  if (units.length === 1) {
    return {
      saleSlotKey: String(propertyId) + '|__single__',
      unitCode: units[0].code,
      single: true,
      error: null,
    };
  }
  var input = normalizeUnitSlotToken(unitInputRaw);
  if (!input) {
    return {
      saleSlotKey: null,
      unitCode: null,
      single: false,
      error: 'Informe a unidade vendida. Exemplos: ' + formatUnitCodesHint(units, 6) + '.',
    };
  }
  var i;
  var u;
  for (i = 0; i < units.length; i++) {
    u = units[i];
    if (normalizeUnitSlotToken(u.code) === input) {
      return {
        saleSlotKey: String(propertyId) + '|' + normalizeUnitSlotToken(u.code),
        unitCode: u.code,
        single: false,
        error: null,
      };
    }
  }
  var inputA = normAlnumUnit(unitInputRaw);
  for (i = 0; i < units.length; i++) {
    u = units[i];
    if (normAlnumUnit(u.code) === inputA) {
      return {
        saleSlotKey: String(propertyId) + '|' + normalizeUnitSlotToken(u.code),
        unitCode: u.code,
        single: false,
        error: null,
      };
    }
  }
  var fuzzy = fuzzyMatchUnitInList(units, unitInputRaw);
  if (fuzzy) {
    return {
      saleSlotKey: String(propertyId) + '|' + normalizeUnitSlotToken(fuzzy.code),
      unitCode: fuzzy.code,
      single: false,
      error: null,
    };
  }
  return {
    saleSlotKey: null,
    unitCode: null,
    single: false,
    error: 'Unidade não encontrada. Unidades cadastradas: ' + formatUnitCodesHint(units, 10) + '.',
  };
}

module.exports = {
  resolveSaleSlot,
  getPropertyUnitsRaw,
  SALES_EXCLUDED_PROPERTY_IDS,
};
