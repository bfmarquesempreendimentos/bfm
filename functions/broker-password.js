'use strict';

var crypto = require('crypto');

var SCRYPT_PREFIX = 'scrypt$';
var SALT_BYTES = 16;
var KEY_LEN = 64;

function hashPassword(plain) {
  var pwd = String(plain || '');
  if (!pwd) return '';
  var salt = crypto.randomBytes(SALT_BYTES);
  var derived = crypto.scryptSync(pwd, salt, KEY_LEN);
  return SCRYPT_PREFIX + salt.toString('hex') + '$' + derived.toString('hex');
}

function isPasswordHashed(stored) {
  return String(stored || '').indexOf(SCRYPT_PREFIX) === 0;
}

function verifyPassword(plain, stored) {
  var pwd = String(plain || '');
  var value = String(stored || '');
  if (!pwd || !value) return false;
  if (!isPasswordHashed(value)) {
    return value === pwd;
  }
  var parts = value.split('$');
  if (parts.length !== 3) return false;
  var salt = Buffer.from(parts[1], 'hex');
  var expected = Buffer.from(parts[2], 'hex');
  var derived = crypto.scryptSync(pwd, salt, expected.length);
  try {
    return crypto.timingSafeEqual(derived, expected);
  } catch (e) {
    return false;
  }
}

function passwordFieldsForStorage(plain) {
  var hash = hashPassword(plain);
  return {
    passwordHash: hash,
    password: '',
  };
}

module.exports = {
  hashPassword,
  isPasswordHashed,
  verifyPassword,
  passwordFieldsForStorage,
};
