'use strict';

/**
 * Regra única de status de unidade (site, admin, Bia, reservas).
 * Status reservado/assinado no catálogo prevalece sobre override remoto antigo.
 * Overrides só aplicam quando o catálogo diz disponível (ex.: liberação operacional).
 */
function isCatalogStatusLocked(catalogStatus) {
  var st = String(catalogStatus || '').toLowerCase();
  return st === 'reservado' || st === 'assinado';
}

function resolveUnitStatus(catalogStatus, overrideStatus) {
  var catalog = String(catalogStatus || 'disponivel').toLowerCase();
  if (overrideStatus == null || overrideStatus === '') return catalog;
  if (isCatalogStatusLocked(catalog)) return catalog;
  return String(overrideStatus).toLowerCase();
}

module.exports = {
  isCatalogStatusLocked: isCatalogStatusLocked,
  resolveUnitStatus: resolveUnitStatus,
};
