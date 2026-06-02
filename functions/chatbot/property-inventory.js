const admin = require('firebase-admin');
const propertyUnitsBase = require('./property-units-data');

var overrideCache = { at: 0, data: null };
var OVERRIDE_CACHE_MS = 60000;

function normAlnumUnit(s) {
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

function normalizeUnitSlotToken(raw) {
  if (raw == null || raw === '') return '';
  return String(raw).toLowerCase().replace(/\s+/g, ' ').trim();
}

function statusLabelPt(status) {
  var st = String(status || '').toLowerCase();
  if (st === 'disponivel') return 'Disponível';
  if (st === 'reservado') return 'Reservado';
  if (st === 'assinado') return 'Assinado (escritura)';
  return status || '—';
}

function formatMoneyBrl(n) {
  var num = Number(n);
  if (isNaN(num)) return '—';
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function loadUnitStatusOverrides() {
  var now = Date.now();
  if (overrideCache.data && now - overrideCache.at < OVERRIDE_CACHE_MS) {
    return overrideCache.data;
  }
  try {
    var snap = await admin.firestore().collection('unit_status_overrides').get();
    var payload = {};
    snap.forEach(function(doc) {
      var d = doc.data() || {};
      if (d.map && typeof d.map === 'object') payload[doc.id] = d.map;
    });
    overrideCache = { at: now, data: payload };
    return payload;
  } catch (err) {
    console.warn('[inventory] overrides:', err.message);
    return overrideCache.data || {};
  }
}

function getRawPropertyUnits(propertyId) {
  var pid = Number(propertyId);
  return propertyUnitsBase[pid] || propertyUnitsBase[String(propertyId)] || null;
}

function mergeUnitsWithOverrides(raw, overrides) {
  if (!raw || !raw.units) return null;
  var ov = overrides || {};
  return {
    name: raw.name,
    engineeringValues: raw.engineeringValues || {},
    matriculas: raw.matriculas || {},
    units: raw.units.map(function(u) {
      return {
        code: u.code,
        price: u.price,
        bedrooms: u.bedrooms,
        status: ov[u.code] || u.status,
      };
    }),
  };
}

async function getMergedPropertyUnits(propertyId) {
  var raw = getRawPropertyUnits(propertyId);
  if (!raw) return null;
  var allOv = await loadUnitStatusOverrides();
  var pid = String(propertyId);
  return mergeUnitsWithOverrides(raw, allOv[pid] || {});
}

function lookupEngineeringValue(engineeringValues, unitCode) {
  if (!engineeringValues || !unitCode) return null;
  var keys = Object.keys(engineeringValues);
  var target = normAlnumUnit(unitCode);
  var i;
  for (i = 0; i < keys.length; i++) {
    if (normAlnumUnit(keys[i]) === target) return engineeringValues[keys[i]];
  }
  for (i = 0; i < keys.length; i++) {
    var nk = normAlnumUnit(keys[i]);
    if (nk && target && (nk.indexOf(target) >= 0 || target.indexOf(nk) >= 0)) {
      return engineeringValues[keys[i]];
    }
  }
  return null;
}

function findUnitInData(data, codigoUnidade) {
  if (!data || !data.units) return null;
  var input = normalizeUnitSlotToken(codigoUnidade);
  var inputA = normAlnumUnit(codigoUnidade);
  var i;
  var u;
  for (i = 0; i < data.units.length; i++) {
    u = data.units[i];
    if (normalizeUnitSlotToken(u.code) === input) return u;
  }
  for (i = 0; i < data.units.length; i++) {
    u = data.units[i];
    if (normAlnumUnit(u.code) === inputA) return u;
  }
  return null;
}

function formatUnitLine(unit, engineeringValues, includeEngineering) {
  var line = '• *' + unit.code + '* — ' + statusLabelPt(unit.status) +
    ' | Venda: ' + formatMoneyBrl(unit.price);
  if (unit.bedrooms) line += ' | ' + unit.bedrooms + ' quarto(s)';
  if (includeEngineering) {
    var eng = lookupEngineeringValue(engineeringValues, unit.code);
    if (eng) line += ' | Engenharia: ' + eng;
    else line += ' | Engenharia: (não cadastrado no sistema)';
  }
  return line;
}

async function formatPropertyInventory(propertyId, options) {
  options = options || {};
  var includeEngineering = !!options.includeEngineering;
  var statusFilter = options.statusFilter ? String(options.statusFilter).toLowerCase() : '';

  var data = await getMergedPropertyUnits(propertyId);
  if (!data) return 'Empreendimento sem inventário de unidades (ID ' + propertyId + ').';

  var lines = ['📋 *' + data.name + '* (ID ' + propertyId + ')', ''];
  var counts = { disponivel: 0, reservado: 0, assinado: 0 };
  var i;
  var units = data.units.slice();
  units.sort(function(a, b) {
    return String(a.code).localeCompare(String(b.code), 'pt-BR');
  });

  for (i = 0; i < units.length; i++) {
    var u = units[i];
    var st = String(u.status || '').toLowerCase();
    if (counts[st] !== undefined) counts[st]++;
    if (statusFilter && st !== statusFilter) continue;
    lines.push(formatUnitLine(u, data.engineeringValues, includeEngineering));
  }

  lines.push('');
  lines.push('Resumo: ' + data.units.length + ' unidades — ' +
    counts.disponivel + ' disponível(is), ' + counts.reservado + ' reservada(s), ' +
    counts.assinado + ' assinada(s).');
  if (includeEngineering) {
    lines.push('_Valor de engenharia é referência interna para corretores; reserva/proposta com Bruno._');
  }
  return lines.join('\n');
}

async function formatUnitDetail(propertyId, codigoUnidade, options) {
  options = options || {};
  var includeEngineering = !!options.includeEngineering;
  var data = await getMergedPropertyUnits(propertyId);
  if (!data) return 'Empreendimento não encontrado (ID ' + propertyId + ').';

  var unit = findUnitInData(data, codigoUnidade);
  if (!unit) {
    return 'Unidade "' + codigoUnidade + '" não encontrada em ' + data.name + '. Use estoque_empreendimento para ver os códigos.';
  }

  var text = '🏠 *' + data.name + '*\n' +
    'Unidade: *' + unit.code + '*\n' +
    'Status: *' + statusLabelPt(unit.status) + '*\n' +
    'Preço de venda: ' + formatMoneyBrl(unit.price) + '\n';
  if (unit.bedrooms) text += 'Quartos: ' + unit.bedrooms + '\n';

  if (includeEngineering) {
    var eng = lookupEngineeringValue(data.engineeringValues, unit.code);
    text += 'Valor engenharia: ' + (eng || '(não cadastrado)') + '\n';
  }

  if (String(unit.status).toLowerCase() === 'reservado') {
    text += '\n⚠️ Unidade *reservada* — para reservar outra ou confirmar esta, contate o Bruno (gestão comercial).\n';
  } else if (String(unit.status).toLowerCase() === 'assinado') {
    text += '\nEsta unidade já está *assinada* (escritura).\n';
  }
  return text;
}

async function getInventorySummaryForAI(includeEngineering) {
  var ids = [1, 2, 3, 4, 5, 6, 7, 8];
  var parts = [];
  var i;
  for (i = 0; i < ids.length; i++) {
    var data = await getMergedPropertyUnits(ids[i]);
    if (!data || !data.units.length) continue;
    var disp = 0;
    var res = 0;
    var ass = 0;
    var j;
    for (j = 0; j < data.units.length; j++) {
      var st = String(data.units[j].status || '').toLowerCase();
      if (st === 'disponivel') disp++;
      else if (st === 'reservado') res++;
      else if (st === 'assinado') ass++;
    }
    parts.push('ID ' + ids[i] + ': ' + disp + ' disp., ' + res + ' reserv., ' + ass + ' assin. — use estoque_empreendimento(' + ids[i] + ') para lista completa' +
      (includeEngineering ? ' com engenharia' : '') + '.');
  }
  return parts.join('\n');
}

module.exports = {
  getMergedPropertyUnits,
  formatPropertyInventory,
  formatUnitDetail,
  findUnitInData,
  lookupEngineeringValue,
  getInventorySummaryForAI,
  statusLabelPt,
};
