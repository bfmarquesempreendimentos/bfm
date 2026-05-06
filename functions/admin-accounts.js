'use strict';

/**
 * Contas do painel admin (mesmas credenciais que admin-login.html).
 * Ao alterar senhas no login, atualize esta lista ou migre para Firebase Auth.
 */
const ADMIN_ACCOUNTS = [
  { email: 'brunoferreiramarques@gmail.com', password: '123456' },
  { email: 'raphaelmonteirodasilva@yahoo.com.br', password: '123456' },
];

function verifyAdminFromBody(body) {
  if (!body || typeof body !== 'object') return false;
  var email = String(body.adminEmail || '').trim().toLowerCase();
  var password = String(body.adminPassword || '');
  for (var i = 0; i < ADMIN_ACCOUNTS.length; i++) {
    if (ADMIN_ACCOUNTS[i].email === email && ADMIN_ACCOUNTS[i].password === password) return true;
  }
  return false;
}

module.exports = { ADMIN_ACCOUNTS, verifyAdminFromBody };
