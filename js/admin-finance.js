/**
 * Módulo financeiro — estilo Procfy (transações + conciliação, sem faturas).
 */
(function() {
    var _cache = { accounts: [], categories: [], transactions: [], summary: null };
    var _tab = 'overview';

    function fmtMoney(n) {
        return 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function fmtDate(iso) {
        if (!iso) return '—';
        try {
            var d = new Date(iso);
            if (isNaN(d.getTime())) return iso;
            return d.toLocaleDateString('pt-BR');
        } catch (e) { return iso; }
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function financePost(action, payload) {
        if (!ensureAdminApiReady()) return Promise.reject(new Error('Login necessário'));
        var body = payload || {};
        body.action = action;
        return adminPostJson('/adminFinanceMutate', body);
    }

    function setFinanceTab(tab) {
        _tab = tab;
        var tabs = document.querySelectorAll('.finance-tab');
        var panels = document.querySelectorAll('.finance-panel');
        var i;
        for (i = 0; i < tabs.length; i++) {
            tabs[i].classList.toggle('finance-tab--active', tabs[i].getAttribute('data-tab') === tab);
        }
        for (i = 0; i < panels.length; i++) {
            panels[i].classList.toggle('finance-panel--active', panels[i].getAttribute('data-panel') === tab);
        }
    }

    function renderFinanceOverview() {
        var s = _cache.summary;
        if (!s) return;
        var elBal = document.getElementById('financeBalance');
        var elInc = document.getElementById('financeIncomeMonth');
        var elExp = document.getElementById('financeExpenseMonth');
        var elRes = document.getElementById('financeResultMonth');
        var elUnrec = document.getElementById('financeUnreconciled');
        if (elBal) elBal.textContent = fmtMoney(s.balance);
        if (elInc) elInc.textContent = fmtMoney(s.incomeMonth);
        if (elExp) elExp.textContent = fmtMoney(s.expenseMonth);
        if (elRes) {
            elRes.textContent = fmtMoney(s.resultMonth);
            elRes.className = 'finance-kpi__value ' + (s.resultMonth >= 0 ? 'finance-kpi__value--pos' : 'finance-kpi__value--neg');
        }
        if (elUnrec) elUnrec.textContent = String(s.unreconciled || 0);

        if (typeof Chart !== 'undefined' && s.cashFlowByMonth) {
            var canvas = document.getElementById('financeCashFlowChart');
            if (canvas) {
                if (window._financeChart) { window._financeChart.destroy(); }
                var keys = Object.keys(s.cashFlowByMonth).sort();
                window._financeChart = new Chart(canvas, {
                    type: 'bar',
                    data: {
                        labels: keys.map(function(k) {
                            var p = k.split('-');
                            return p[1] + '/' + p[0].slice(2);
                        }),
                        datasets: [
                            { label: 'Entradas', data: keys.map(function(k) { return s.cashFlowByMonth[k].entrada; }), backgroundColor: '#22c55e' },
                            { label: 'Saídas', data: keys.map(function(k) { return s.cashFlowByMonth[k].saida; }), backgroundColor: '#ef4444' }
                        ]
                    },
                    options: { responsive: true, plugins: { title: { display: true, text: 'Fluxo de caixa (6 meses)' } } }
                });
            }
        }
    }

    function renderFinanceTable() {
        var tbody = document.getElementById('financeTransactionsBody');
        if (!tbody) return;
        var rows = _cache.transactions || [];
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-message">Nenhuma transação. Clique em Nova transação.</td></tr>';
            return;
        }
        tbody.innerHTML = rows.map(function(tx) {
            var typeLabel = tx.type === 'entrada' ? 'Entrada' : 'Saída';
            var typeCls = tx.type === 'entrada' ? 'finance-badge--in' : 'finance-badge--out';
            var rec = tx.reconciled
                ? '<span class="finance-badge finance-badge--ok">Conciliado</span>'
                : '<span class="finance-badge finance-badge--pending">Pendente</span>';
            var actions = tx.reconciled
                ? '<button type="button" class="btn btn-sm btn-secondary" onclick="financeUnreconcile(\'' + esc(tx.id) + '\')">Desfazer</button>'
                : '<button type="button" class="btn btn-sm btn-primary" onclick="financeReconcile(\'' + esc(tx.id) + '\')">Conciliar</button>';
            actions += ' <button type="button" class="btn btn-sm btn-secondary" onclick="financeEditTransaction(\'' + esc(tx.id) + '\')">Editar</button>';
            actions += ' <button type="button" class="btn btn-sm btn-danger" onclick="financeDeleteTransaction(\'' + esc(tx.id) + '\')">Excluir</button>';
            return '<tr>' +
                '<td>' + fmtDate(tx.date) + '</td>' +
                '<td>' + esc(tx.description || '—') + '</td>' +
                '<td>' + esc(tx.categoryName || '—') + '</td>' +
                '<td>' + esc(tx.accountName || '—') + '</td>' +
                '<td><span class="finance-badge ' + typeCls + '">' + typeLabel + '</span></td>' +
                '<td class="finance-amount ' + (tx.type === 'entrada' ? 'finance-amount--in' : 'finance-amount--out') + '">' + fmtMoney(tx.amount) + '</td>' +
                '<td>' + rec + '</td>' +
                '<td class="finance-actions">' + actions + '</td></tr>';
        }).join('');
    }

    function renderReconciliationList() {
        var list = document.getElementById('financeReconcileList');
        if (!list) return;
        var pending = (_cache.transactions || []).filter(function(t) { return !t.reconciled; });
        if (!pending.length) {
            list.innerHTML = '<p class="empty-message">Todas as transações estão conciliadas.</p>';
            return;
        }
        list.innerHTML = pending.map(function(tx) {
            return '<div class="finance-reconcile-row">' +
                '<label class="finance-reconcile-check"><input type="checkbox" value="' + esc(tx.id) + '"> ' +
                fmtDate(tx.date) + ' — ' + esc(tx.description || '—') + ' — <strong>' + fmtMoney(tx.amount) + '</strong></label>' +
                '<button type="button" class="btn btn-sm btn-primary" onclick="financeReconcile(\'' + esc(tx.id) + '\')">Conciliar</button>' +
                '</div>';
        }).join('');
    }

    function fillFinanceFormSelects() {
        var accSel = document.getElementById('financeFormAccount');
        var catSel = document.getElementById('financeFormCategory');
        if (accSel) {
            accSel.innerHTML = '<option value="">Conta</option>' + (_cache.accounts || []).map(function(a) {
                return '<option value="' + esc(a.id) + '">' + esc(a.name) + '</option>';
            }).join('');
        }
        if (catSel) {
            catSel.innerHTML = '<option value="">Categoria</option>' + (_cache.categories || []).map(function(c) {
                return '<option value="' + esc(c.id) + '" data-type="' + esc(c.type) + '">' + esc(c.name) + '</option>';
            }).join('');
        }
    }

    function loadFinanceModule() {
        if (!ensureAdminApiReady()) return;
        financePost('summary', {}).then(function(data) {
            if (!data || !data.ok) return;
            _cache.summary = data.summary;
            _cache.accounts = data.accounts || [];
            _cache.categories = data.categories || [];
            return financePost('list', { limit: 300 });
        }).then(function(data) {
            if (data && data.transactions) _cache.transactions = data.transactions;
            renderFinanceOverview();
            renderFinanceTable();
            renderReconciliationList();
            fillFinanceFormSelects();
            if (typeof renderDashboardFinanceWidgets === 'function') {
                renderDashboardFinanceWidgets(_cache.summary);
            }
        }).catch(function(err) {
            showMessage((err && err.message) || 'Erro ao carregar financeiro.', 'error');
        });
    }

    function openFinanceModal(editId) {
        var modal = document.getElementById('financeTransactionModal');
        if (!modal) return;
        fillFinanceFormSelects();
        document.getElementById('financeFormId').value = editId || '';
        if (editId) {
            var tx = null;
            var i;
            for (i = 0; i < _cache.transactions.length; i++) {
                if (_cache.transactions[i].id === editId) { tx = _cache.transactions[i]; break; }
            }
            if (tx) {
                document.getElementById('financeFormType').value = tx.type;
                document.getElementById('financeFormAmount').value = tx.amount;
                document.getElementById('financeFormDate').value = (tx.date || '').slice(0, 10);
                document.getElementById('financeFormDescription').value = tx.description || '';
                document.getElementById('financeFormAccount').value = tx.accountId || '';
                document.getElementById('financeFormCategory').value = tx.categoryId || '';
                document.getElementById('financeFormCenterCost').value = tx.centerCost || '';
                document.getElementById('financeFormNotes').value = tx.notes || '';
            }
        } else {
            document.getElementById('financeTransactionForm').reset();
            document.getElementById('financeFormDate').value = new Date().toISOString().slice(0, 10);
        }
        modal.style.display = 'block';
    }

    function closeFinanceModal() {
        var modal = document.getElementById('financeTransactionModal');
        if (modal) modal.style.display = 'none';
    }

    function saveFinanceTransaction(e) {
        if (e && e.preventDefault) e.preventDefault();
        var id = document.getElementById('financeFormId').value;
        var accId = document.getElementById('financeFormAccount').value;
        var catId = document.getElementById('financeFormCategory').value;
        var acc = null;
        var cat = null;
        var i;
        for (i = 0; i < _cache.accounts.length; i++) {
            if (_cache.accounts[i].id === accId) { acc = _cache.accounts[i]; break; }
        }
        for (i = 0; i < _cache.categories.length; i++) {
            if (_cache.categories[i].id === catId) { cat = _cache.categories[i]; break; }
        }
        var payload = {
            type: document.getElementById('financeFormType').value,
            amount: document.getElementById('financeFormAmount').value,
            date: document.getElementById('financeFormDate').value,
            description: document.getElementById('financeFormDescription').value,
            accountId: accId,
            accountName: acc ? acc.name : '',
            categoryId: catId,
            categoryName: cat ? cat.name : '',
            centerCost: document.getElementById('financeFormCenterCost').value,
            notes: document.getElementById('financeFormNotes').value
        };
        var action = id ? 'update' : 'create';
        if (id) payload.id = id;
        financePost(action, payload).then(function() {
            closeFinanceModal();
            showMessage(id ? 'Transação atualizada.' : 'Transação registrada.', 'success');
            loadFinanceModule();
        }).catch(function(err) {
            showMessage((err && err.message) || 'Erro ao salvar.', 'error');
        });
    }

    function financeReconcile(id) {
        financePost('reconcile', { id: id }).then(function() {
            showMessage('Transação conciliada.', 'success');
            loadFinanceModule();
        });
    }

    function financeUnreconcile(id) {
        financePost('unreconcile', { id: id }).then(function() {
            loadFinanceModule();
        });
    }

    function financeDeleteTransaction(id) {
        if (!confirm('Excluir esta transação?')) return;
        financePost('delete', { id: id }).then(function() {
            showMessage('Transação excluída.', 'success');
            loadFinanceModule();
        });
    }

    function financeReconcileSelected() {
        var checks = document.querySelectorAll('#financeReconcileList input[type=checkbox]:checked');
        var ids = [];
        var i;
        for (i = 0; i < checks.length; i++) ids.push(checks[i].value);
        if (!ids.length) {
            showMessage('Selecione ao menos uma transação.', 'warning');
            return;
        }
        financePost('reconcile_batch', { ids: ids }).then(function() {
            showMessage(ids.length + ' transação(ões) conciliada(s).', 'success');
            loadFinanceModule();
        });
    }

    function financeEditTransaction(id) { openFinanceModal(id); }

    function renderDashboardFinanceWidgets(summary) {
        if (!summary) return;
        var row = document.getElementById('dashboardFinanceRow');
        if (!row) return;
        row.style.display = '';
        var elBal = document.getElementById('dashFinanceBalance');
        var elRes = document.getElementById('dashFinanceResult');
        var elUnrec = document.getElementById('dashFinanceUnreconciled');
        if (elBal) elBal.textContent = fmtMoney(summary.balance);
        if (elRes) elRes.textContent = fmtMoney(summary.resultMonth);
        if (elUnrec) elUnrec.textContent = String(summary.unreconciled || 0);
    }

    if (typeof window !== 'undefined') {
        window.loadFinanceModule = loadFinanceModule;
        window.setFinanceTab = setFinanceTab;
        window.openFinanceModal = openFinanceModal;
        window.closeFinanceModal = closeFinanceModal;
        window.saveFinanceTransaction = saveFinanceTransaction;
        window.financeReconcile = financeReconcile;
        window.financeUnreconcile = financeUnreconcile;
        window.financeDeleteTransaction = financeDeleteTransaction;
        window.financeReconcileSelected = financeReconcileSelected;
        window.financeEditTransaction = financeEditTransaction;
        window.renderDashboardFinanceWidgets = renderDashboardFinanceWidgets;
    }
})();
