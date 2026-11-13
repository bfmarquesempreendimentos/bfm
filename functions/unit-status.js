'use strict';

/**
 * Regra única de status de unidade (site, admin, Bia, reservas).
 * Override operacional (Firestore / reservas) prevalece sobre o catálogo estático.
 * Sem override, usa o status do catálogo (ex.: importação inicial amarelo/vermelho).
 */
function isCatalogStatusLocked(catalogStatus) {
  var st = String(catalogStatus || '').toLowerCase();
  return st === 'reservado' || st === 'assinado';
}

function resolveUnitStatus(catalogStatus, overrideStatus) {
  if (overrideStatus != null && overrideStatus !== '') {
    return String(overrideStatus).toLowerCase();
  }
  return String(catalogStatus || 'disponivel').toLowerCase();
}

/** Unidade já fechada — não publicar valor de engenharia na vitrine. */
function isUnitSoldOrSigned(unitStatus) {
  var st = String(unitStatus || '').toLowerCase();
  return st === 'assinado' || st === 'vendido' || st === 'entregue';
}

/** Vitrine: disponível e reservado mostram engenharia vigente; assinado/vendido não. */
function shouldShowEngineeringOnVitrine(unitStatus) {
  return !isUnitSoldOrSigned(unitStatus);
}

module.exports = {
  isCatalogStatusLocked: isCatalogStatusLocked,
  resolveUnitStatus: resolveUnitStatus,
  isUnitSoldOrSigned: isUnitSoldOrSigned,
  shouldShowEngineeringOnVitrine: shouldShowEngineeringOnVitrine,
};
