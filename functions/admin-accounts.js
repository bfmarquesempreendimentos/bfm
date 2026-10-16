'use strict';

const functions = require('firebase-functions');

/**
 * Contas do painel admin (e-mail + perfil). Senhas NÃO ficam no repositório.
 * Configure no Firebase (uma vez, após deploy):
 *
 *   firebase functions:config:set admin.passwords_json='{"email@...":"SENHA_FORTE",...}'
 *
 * Ver SETUP-SEGURANCA-ADMIN.md
 */
const ADMIN_ROLES = [
  { email: 'brunoferreiramarques@gmail.com', role: 'super' },
  { email: 'raphaelmonteirodasilva@yahoo.com.br', role: 'comercial' },
];

/**
 * super: tudo
 * comercial: vendas/leads/campanha/unidades/corretores/reservas
 * posvenda: reparos/clientes + leitura de reservas
 * financeiro: leitura vendas/reservas/dashboard + financeiro (leitura)
 */
const ROLE_PERMISSIONS = {
  super: ['*'],
  comercial: ['sales', 'leads', 'campaign', 'units', 'brokers', 'repairs_read', 'reservations', 'finance_read'],
  posvenda: ['repairs', 'clients', 'leads_read', 'units_read', 'reservations_read'],
  financeiro: ['sales_read', 'repairs_read', 'dashboard', 'reservations_read', 'finance_read'],
};

function loadAdminPasswordsFromConfig() {
  try {
    var cfg = functions.config();
    if (cfg.admin && cfg.admin.passwords_json) {
      return JSON.parse(cfg.admin.passwords_json);
    }
  } catch (e) {
    console.error('admin.passwords_json inválido:', e.message);
  }
  return {};
}

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
  for (i = 0; i < ADMIN_ROLES.length; i++) {
    if (ADMIN_ROLES[i].email === e) {
      return { email: ADMIN_ROLES[i].email, role: ADMIN_ROLES[i].role };
    }
  }
  return null;
}

function verifyAdminPassword(email, password) {
  var acc = getAdminAccount(email);
  if (!acc) return false;
  var passwords = loadAdminPasswordsFromConfig();
  var expected = passwords[String(email || '').trim().toLowerCase()];
  if (!expected || typeof expected !== 'string') {
    console.warn('Senha admin não configurada em functions.config para:', email);
    return false;
  }
  return expected === String(password || '');
}

function verifyAdminFromBody(body) {
  if (!body || typeof body !== 'object') return false;
  var email = String(body.adminEmail || '').trim().toLowerCase();
  var password = String(body.adminPassword || '');
  return verifyAdminPassword(email, password);
}

/** @deprecated Não use credenciais em query string — removido por segurança. */
function verifyAdminFromReq(req) {
  if (!req) return false;
  return verifyAdminFromBody(req.body);
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

/** Lista pública de e-mails autorizados (sem senhas) — espelha admin-login.html */
const ADMIN_ACCOUNTS = ADMIN_ROLES.map(function(r) {
  return { email: r.email, role: r.role };
});

module.exports = {
  ADMIN_ACCOUNTS,
  ADMIN_ROLES,
  ROLE_PERMISSIONS,
  getAdminAccount,
  verifyAdminFromBody,
  verifyAdminFromReq,
  verifyAdminPassword,
  getAdminRoleFromBody,
  adminHasPermission,
  roleHasPermission,
};
