'use strict';

/**
 * Contas do painel admin (mesmas credenciais que admin-login.html).
 * Ao alterar senhas no login, atualize esta lista ou migre para Firebase Auth.
 */
const ADMIN_ACCOUNTS = [
  { email: 'brunoferreiramarques@gmail.com', password: '123456', role: 'super' },
  { email: 'raphaelmonteirodasilva@yahoo.com.br', password: '123456', role: 'comercial' },
];

/**
 * super: tudo
 * comercial: vendas/leads/campanha/unidades/corretores/reservas
 * posvenda: reparos/clientes + leitura de reservas
 * financeiro: leitura vendas/reservas/dashboard
 *
 * Permissões de reservas:
 *   reservations       — criar, aprovar, rejeitar, prorrogar, liberar, importar
 *   reservations_read  — apenas listar/visualizar/exportar
 */
const ROLE_PERMISSIONS = {
  super: ['*'],
  comercial: ['sales', 'leads', 'campaign', 'units', 'brokers', 'repairs_read', 'reservations'],
  posvenda: ['repairs', 'clients', 'leads_read', 'units_read', 'reservations_read'],
  financeiro: ['sales_read', 'repairs_read', 'dashboard', 'reservations_read'],
};

function roleHasPermission(role, permission) {
  var list = ROLE_PERMISSIONS[role] || [];
  if (list.indexOf('*') >= 0) return true;
  if (list.indexOf(permission) >= 0) return true;
  if (permission === 'reservations_read' && list.indexOf('reservations') >= 0) return true;
  return false;
}

function getAdminAccount(email) {
  var e = String(email || '').trim().toLowerCase();
  var i;
  for (i = 0; i < ADMIN_ACCOUNTS.length; i++) {
    if (ADMIN_ACCOUNTS[i].email === e) return ADMIN_ACCOUNTS[i];
  }
  return null;
}

function verifyAdminFromBody(body) {
  if (!body || typeof body !== 'object') return false;
  var email = String(body.adminEmail || '').trim().toLowerCase();
  var password = String(body.adminPassword || '');
  var acc = getAdminAccount(email);
  return !!(acc && acc.password === password);
}

/** Valida admin a partir da requisição (corpo do POST OU query string do GET). */
function verifyAdminFromReq(req) {
  if (!req) return false;
  if (verifyAdminFromBody(req.body)) return true;
  if (req.query && verifyAdminFromBody({
    adminEmail: req.query.adminEmail,
    adminPassword: req.query.adminPassword,
  })) return true;
  return false;
}

function getAdminRoleFromBody(body) {
  var email = String((body && body.adminEmail) || '').trim().toLowerCase();
  var acc = getAdminAccount(email);
  return acc ? (acc.role || 'comercial') : null;
}

function adminHasPermission(body, permission) {
  if (!verifyAdminFromBody(body)) return false;
  return roleHasPermission(getAdminRoleFromBody(body), permission);
}

module.exports = {
  ADMIN_ACCOUNTS,
  ROLE_PERMISSIONS,
  getAdminAccount,
  verifyAdminFromBody,
  verifyAdminFromReq,
  getAdminRoleFromBody,
  adminHasPermission,
  roleHasPermission,
};
