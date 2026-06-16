'use strict';

const admin = require('firebase-admin');
const { roleHasPermission } = require('./admin-accounts');

var TX_COL = 'finance_transactions';
var ACC_COL = 'finance_accounts';
var CAT_COL = 'finance_categories';

var DEFAULT_ACCOUNTS = [
  { name: 'Conta principal', bank: 'Caixa Econômica', color: '#0b1f3a', initialBalance: 0 },
  { name: 'Conta operacional', bank: 'Banco do Brasil', color: '#3498db', initialBalance: 0 },
];

var DEFAULT_CATEGORIES = [
  { name: 'Vendas de imóveis', type: 'receita' },
  { name: 'Entrada / sinal', type: 'receita' },
  { name: 'Aluguel', type: 'receita' },
  { name: 'Receitas financeiras', type: 'receita' },
  { name: 'Material de obra', type: 'despesa' },
  { name: 'Mão de obra', type: 'despesa' },
  { name: 'Marketing e campanhas', type: 'despesa' },
  { name: 'Despesas administrativas', type: 'despesa' },
  { name: 'Impostos e taxas', type: 'despesa' },
  { name: 'Reparos e pós-venda', type: 'despesa' },
];

function allowCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function monthKey(dateStr) {
  var d = new Date(dateStr || Date.now());
  if (isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function normalizeTx(doc) {
  var d = doc.data ? doc.data() : doc;
  var id = doc.id || d.id || '';
  return {
    id: id,
    type: d.type === 'saida' ? 'saida' : 'entrada',
    amount: d.amount != null ? Number(d.amount) : 0,
    date: d.date || d.createdAt || '',
    description: d.description || '',
    categoryId: d.categoryId || '',
    categoryName: d.categoryName || '',
    accountId: d.accountId || '',
    accountName: d.accountName || '',
    centerCost: d.centerCost || '',
    reconciled: !!d.reconciled,
    reconciledAt: d.reconciledAt || '',
    notes: d.notes || '',
    createdAt: d.createdAt || '',
    updatedAt: d.updatedAt || '',
  };
}

async function ensureFinanceDefaults(db) {
  var accSnap = await db.collection(ACC_COL).limit(1).get();
  if (accSnap.empty) {
    var i;
    for (i = 0; i < DEFAULT_ACCOUNTS.length; i++) {
      await db.collection(ACC_COL).add(Object.assign({}, DEFAULT_ACCOUNTS[i], {
        createdAt: new Date().toISOString(),
      }));
    }
  }
  var catSnap = await db.collection(CAT_COL).limit(1).get();
  if (catSnap.empty) {
    var j;
    for (j = 0; j < DEFAULT_CATEGORIES.length; j++) {
      await db.collection(CAT_COL).add(Object.assign({}, DEFAULT_CATEGORIES[j], {
        createdAt: new Date().toISOString(),
      }));
    }
  }
}

async function loadAccounts(db) {
  var snap = await db.collection(ACC_COL).get();
  var rows = [];
  snap.forEach(function(doc) {
    var d = doc.data() || {};
    rows.push({
      id: doc.id,
      name: d.name || '',
      bank: d.bank || '',
      color: d.color || '#64748b',
      initialBalance: d.initialBalance != null ? Number(d.initialBalance) : 0,
    });
  });
  return rows;
}

async function loadCategories(db) {
  var snap = await db.collection(CAT_COL).get();
  var rows = [];
  snap.forEach(function(doc) {
    var d = doc.data() || {};
    rows.push({
      id: doc.id,
      name: d.name || '',
      type: d.type === 'despesa' ? 'despesa' : 'receita',
    });
  });
  return rows;
}

async function computeSummary(db, monthFilter) {
  var snap = await db.collection(TX_COL).get();
  var now = new Date();
  var currentMonth = monthFilter || monthKey(now.toISOString());
  var balance = 0;
  var incomeMonth = 0;
  var expenseMonth = 0;
  var unreconciled = 0;
  var cashFlowByMonth = {};
  var mi;
  for (mi = 0; mi < 6; mi++) {
    var dt = new Date(now.getFullYear(), now.getMonth() - (5 - mi), 1);
    cashFlowByMonth[monthKey(dt.toISOString())] = { entrada: 0, saida: 0 };
  }

  snap.forEach(function(doc) {
    var tx = normalizeTx(doc);
    var sign = tx.type === 'saida' ? -1 : 1;
    balance += sign * tx.amount;
    var mk = monthKey(tx.date);
    if (mk === currentMonth) {
      if (tx.type === 'entrada') incomeMonth += tx.amount;
      else expenseMonth += tx.amount;
    }
    if (cashFlowByMonth[mk]) {
      if (tx.type === 'entrada') cashFlowByMonth[mk].entrada += tx.amount;
      else cashFlowByMonth[mk].saida += tx.amount;
    }
    if (!tx.reconciled) unreconciled++;
  });

  var accounts = await loadAccounts(db);
  var i;
  for (i = 0; i < accounts.length; i++) {
    balance += accounts[i].initialBalance || 0;
  }

  return {
    balance: balance,
    incomeMonth: incomeMonth,
    expenseMonth: expenseMonth,
    resultMonth: incomeMonth - expenseMonth,
    unreconciled: unreconciled,
    transactionCount: snap.size,
    cashFlowByMonth: cashFlowByMonth,
    month: currentMonth,
  };
}

async function handleFinanceMutate(req, res, auth) {
  var body = req.body || {};
  var action = String(body.action || 'summary').trim().toLowerCase();
  var db = admin.firestore();
  await ensureFinanceDefaults(db);

  if (action === 'summary') {
    var summary = await computeSummary(db, body.month || null);
    var accounts = await loadAccounts(db);
    var categories = await loadCategories(db);
    return res.json({ ok: true, summary: summary, accounts: accounts, categories: categories });
  }

  if (action === 'list') {
    var limitN = Math.min(parseInt(body.limit, 10) || 300, 500);
    var snap = await db.collection(TX_COL).limit(limitN).get();
    var rows = [];
    snap.forEach(function(doc) { rows.push(normalizeTx(doc)); });
    rows.sort(function(a, b) {
      return new Date(b.date || 0) - new Date(a.date || 0);
    });
    if (body.type) {
      rows = rows.filter(function(r) { return r.type === body.type; });
    }
    if (body.reconciled === true) rows = rows.filter(function(r) { return r.reconciled; });
    if (body.reconciled === false) rows = rows.filter(function(r) { return !r.reconciled; });
    if (body.accountId) {
      rows = rows.filter(function(r) { return r.accountId === body.accountId; });
    }
    return res.json({ ok: true, transactions: rows });
  }

  if (action === 'create') {
    var amount = Number(body.amount);
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Valor inválido' });
    }
    if (!body.date) return res.status(400).json({ error: 'Data obrigatória' });
    var type = body.type === 'saida' ? 'saida' : 'entrada';
    var payload = {
      type: type,
      amount: amount,
      date: String(body.date),
      description: String(body.description || '').trim(),
      categoryId: String(body.categoryId || '').trim(),
      categoryName: String(body.categoryName || '').trim(),
      accountId: String(body.accountId || '').trim(),
      accountName: String(body.accountName || '').trim(),
      centerCost: String(body.centerCost || '').trim(),
      reconciled: !!body.reconciled,
      reconciledAt: body.reconciled ? new Date().toISOString() : '',
      notes: String(body.notes || '').trim(),
      createdBy: auth.email || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    var ref = await db.collection(TX_COL).add(payload);
    return res.json({ ok: true, id: ref.id });
  }

  if (action === 'update') {
    var updId = String(body.id || body.transactionId || '').trim();
    if (!updId) return res.status(400).json({ error: 'id obrigatório' });
    var upd = { updatedAt: new Date().toISOString() };
    if (body.amount != null) upd.amount = Number(body.amount);
    if (body.date != null) upd.date = String(body.date);
    if (body.description != null) upd.description = String(body.description || '');
    if (body.type != null) upd.type = body.type === 'saida' ? 'saida' : 'entrada';
    if (body.categoryId != null) upd.categoryId = String(body.categoryId || '');
    if (body.categoryName != null) upd.categoryName = String(body.categoryName || '');
    if (body.accountId != null) upd.accountId = String(body.accountId || '');
    if (body.accountName != null) upd.accountName = String(body.accountName || '');
    if (body.centerCost != null) upd.centerCost = String(body.centerCost || '');
    if (body.notes != null) upd.notes = String(body.notes || '');
    await db.collection(TX_COL).doc(updId).set(upd, { merge: true });
    return res.json({ ok: true, id: updId });
  }

  if (action === 'delete') {
    var delId = String(body.id || body.transactionId || '').trim();
    if (!delId) return res.status(400).json({ error: 'id obrigatório' });
    await db.collection(TX_COL).doc(delId).delete();
    return res.json({ ok: true, deleted: delId });
  }

  if (action === 'reconcile') {
    var recId = String(body.id || body.transactionId || '').trim();
    if (!recId) return res.status(400).json({ error: 'id obrigatório' });
    await db.collection(TX_COL).doc(recId).set({
      reconciled: true,
      reconciledAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    return res.json({ ok: true, id: recId, reconciled: true });
  }

  if (action === 'unreconcile') {
    var unId = String(body.id || body.transactionId || '').trim();
    if (!unId) return res.status(400).json({ error: 'id obrigatório' });
    await db.collection(TX_COL).doc(unId).set({
      reconciled: false,
      reconciledAt: '',
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    return res.json({ ok: true, id: unId, reconciled: false });
  }

  if (action === 'reconcile_batch') {
    var ids = Array.isArray(body.ids) ? body.ids : [];
    var k;
    for (k = 0; k < ids.length; k++) {
      await db.collection(TX_COL).doc(String(ids[k])).set({
        reconciled: true,
        reconciledAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    }
    return res.json({ ok: true, count: ids.length });
  }

  return res.status(400).json({ error: 'Ação inválida' });
}

function canReadFinance(role) {
  return roleHasPermission(role, 'finance') || roleHasPermission(role, 'finance_read') || roleHasPermission(role, '*');
}

function canWriteFinance(role) {
  return roleHasPermission(role, 'finance') || roleHasPermission(role, '*');
}

async function getFinanceSummaryForDashboard(db) {
  try {
    await ensureFinanceDefaults(db);
    return await computeSummary(db, null);
  } catch (e) {
    return null;
  }
}

module.exports = {
  allowCors,
  handleFinanceMutate,
  canReadFinance,
  canWriteFinance,
  getFinanceSummaryForDashboard,
  computeSummary,
};
