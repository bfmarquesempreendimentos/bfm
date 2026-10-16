/**
 * Cadastro interno: ficha do empreendimento + ficha por unidade.
 * A vitrine do corretor não muda de cara; preço e engenharia vigente saem daqui.
 */
(function() {
    var _rows = [];
    var _catalog = null;
    var _property = null;
    var _alerts = null;
    var _seed = null;
    var _seedPromise = null;

    var BUILDING_PRIMARY = {
        art: 1, crea: 1, memorial: 1, habite_planta: 1, averbacao: 1,
        scpo: 1, recibo_obra: 1, kit_engenharia: 1, matricula_mae: 1, convencao: 1
    };

    function esc(t) {
        if (typeof escapeHtml === 'function') return escapeHtml(t);
        return String(t == null ? '' : t)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function formatMoney(v) {
        if (v == null || v === '') return '';
        if (typeof v === 'number') return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        var s = String(v);
        if (/^\d+(\.\d+)?$/.test(s)) {
            return Number(s).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        }
        return s;
    }

    function formatDate(ymd) {
        if (!ymd) return '';
        var p = String(ymd).split('-');
        if (p.length !== 3) return ymd;
        return p[2] + '/' + p[1] + '/' + p[0];
    }

    function statusClass(st) {
        if (st === 'vencida') return 'ue-status ue-status--expired';
        if (st === 'a_vencer') return 'ue-status ue-status--soon';
        if (st === 'vigente') return 'ue-status ue-status--ok';
        return 'ue-status';
    }

    function loadSeed() {
        if (_seed) return Promise.resolve(_seed);
        if (_seedPromise) return _seedPromise;
        _seedPromise = fetch('data/property-dossier-seed.json', { cache: 'no-store' })
            .then(function(res) { return res.ok ? res.json() : null; })
            .then(function(data) {
                _seed = data;
                return _seed;
            })
            .catch(function() {
                _seed = { properties: {} };
                return _seed;
            });
        return _seedPromise;
    }

    function seedOf(pid) {
        if (!_seed || !_seed.properties) return null;
        return _seed.properties[String(pid)] || null;
    }

    function propertyOptionsHtml() {
        var list = (typeof properties !== 'undefined' && properties) ? properties : [];
        var html = '<option value="">Selecione o empreendimento</option>';
        list.forEach(function(p) {
            html += '<option value="' + esc(p.id) + '">' + esc(p.title || p.name || ('Imóvel ' + p.id)) + '</option>';
        });
        return html;
    }

    function selectedPropertyId() {
        var el = document.getElementById('ueProperty');
        return el ? el.value : '';
    }

    function findRow(unitCode) {
        var i;
        for (i = 0; i < _rows.length; i++) {
            if (String(_rows[i].unitCode) === String(unitCode)) return _rows[i];
        }
        return null;
    }

    function mergeLocalIfNeeded(pid) {
        var seed = seedOf(pid);
        if (!seed) return;
        if (!_property) {
            _property = {
                propertyId: pid,
                officialName: seed.officialName || '',
                street: seed.street || '',
                neighborhood: seed.neighborhood || '',
                city: seed.city || '',
                cep: seed.cep || '',
                mapsUrl: seed.mapsUrl || '',
                cartorio: seed.cartorio || '',
                matriculaMae: seed.matriculaMae || '',
                inscricaoTerreno: seed.inscricaoTerreno || '',
                engenheiro: seed.engenheiro || '',
                crea: seed.crea || '',
                artNumber: seed.artNumber || '',
                notes: seed.notes || '',
                documents: seed.documents || [],
                inSales: seed.inSales !== false
            };
        }
        if (_property && !_property.inscricaoTerreno && seed.inscricaoTerreno) {
            _property.inscricaoTerreno = seed.inscricaoTerreno;
        }
        if (_rows.length) {
            _rows.forEach(function(r) {
                var su = null;
                (seed.units || []).some(function(x) {
                    if (x.code === r.unitCode) { su = x; return true; }
                    return false;
                });
                if (!su) return;
                if (!r.inscricaoMunicipal && su.inscricaoMunicipal) r.inscricaoMunicipal = su.inscricaoMunicipal;
                if (!r.matricula && su.matricula) r.matricula = su.matricula;
            });
            return;
        }
        var units = (_catalog && _catalog.units) || seed.units || [];
        _rows = units.map(function(u) {
            var code = u.code || u.unitCode;
            var su = null;
            (seed.units || []).some(function(x) {
                if (x.code === code) { su = x; return true; }
                return false;
            });
            return {
                id: pid + '__' + String(code || '').toLowerCase().replace(/[^a-z0-9]+/g, '_'),
                propertyId: pid,
                unitCode: code,
                matricula: (su && su.matricula) || '',
                inscricaoMunicipal: (su && su.inscricaoMunicipal) || '',
                salePrice: (su && su.salePrice) != null ? su.salePrice : u.price,
                engineeringValue: (su && su.historicalEngineering) || '',
                historicalEngineering: (su && su.historicalEngineering) || '',
                appraisalDate: '',
                expiresAt: '',
                archiveDocuments: (su && su.documents) || [],
                notes: (su && su.notes) || '',
                status: 'sem_laudo',
                statusLabel: 'Sem data — não vai à vitrine',
                bedrooms: u.bedrooms,
                catalogStatus: u.catalogStatus || u.status || ''
            };
        });
    }

    function fillBuildingForm(p) {
        var set = function(id, val) {
            var el = document.getElementById(id);
            if (el) el.value = val == null ? '' : val;
        };
        p = p || {};
        set('pdOfficialName', p.officialName);
        set('pdStreet', p.street);
        set('pdNeighborhood', p.neighborhood);
        set('pdCity', p.city);
        set('pdCep', p.cep);
        set('pdMapsUrl', p.mapsUrl);
        set('pdCartorio', p.cartorio);
        set('pdMatriculaMae', p.matriculaMae);
        set('pdInscricaoTerreno', p.inscricaoTerreno);
        set('pdEngenheiro', p.engenheiro);
        set('pdCrea', p.crea);
        set('pdArtNumber', p.artNumber);
        set('pdNotes', p.notes);
        renderBuildingDocs(p.documents || []);
    }

    function renderBuildingDocs(docs) {
        var box = document.getElementById('pdBuildingDocs');
        if (!box) return;
        if (!docs.length) {
            box.innerHTML = '<p class="form-hint">Nenhum documento de prédio no arquivo antigo deste empreendimento.</p>';
            return;
        }
        var primary = [];
        var other = [];
        docs.forEach(function(d) {
            if (BUILDING_PRIMARY[d.kind]) primary.push(d);
            else other.push(d);
        });
        function list(items) {
            return '<ul class="pd-doc-list">' + items.map(function(d) {
                var path = d.storagePath || '';
                var name = esc(d.name);
                var link = path
                    ? '<button type="button" class="pd-doc-link" data-pd-path="' + esc(path) + '">' + name + '</button>'
                    : name;
                return '<li><span class="pd-doc-kind">' + esc(d.label || d.kind) + '</span> ' + link + '</li>';
            }).join('') + '</ul>';
        }
        var html = '<h4>Documentos do prédio (arquivo antigo)</h4>' + list(primary.length ? primary : docs);
        if (other.length && primary.length) {
            html += '<details class="pd-doc-more"><summary>Outros arquivos (' + other.length + ')</summary>' +
                list(other) + '</details>';
        }
        box.innerHTML = html;
        bindDocLinks(box);
    }

    function renderTable() {
        var tbody = document.getElementById('ueTableBody');
        if (!tbody) return;
        if (!_rows.length) {
            tbody.innerHTML = '<tr><td colspan="9">Sem unidades neste empreendimento.</td></tr>';
            return;
        }
        tbody.innerHTML = _rows.map(function(r) {
            var eng = r.engineeringValue || r.historicalEngineering || '';
            var docs = (r.archiveDocuments || []).map(function(d) { return d.label || d.kind; });
            if (r.reportName) docs.unshift('Laudo anexado');
            var docTxt = docs.length ? docs.filter(function(v, i, a) { return a.indexOf(v) === i; }).join(', ') : '—';
            return '<tr class="' + (r.status === 'vencida' ? 'ue-row--expired' : (r.status === 'a_vencer' ? 'ue-row--soon' : '')) + '">' +
                '<td>' + esc(r.unitCode) + '</td>' +
                '<td>' + esc(r.matricula || '—') + '</td>' +
                '<td>' + esc(r.inscricaoMunicipal || '—') + '</td>' +
                '<td>' + esc(formatMoney(r.salePrice) || '—') + '</td>' +
                '<td>' + esc(formatMoney(eng) || '—') + '</td>' +
                '<td>' + esc(formatDate(r.appraisalDate) || '—') + '</td>' +
                '<td><span class="' + statusClass(r.status) + '">' + esc(r.statusLabel || 'Sem data') + '</span></td>' +
                '<td class="pd-docs-cell">' + esc(docTxt) + '</td>' +
                '<td><button type="button" class="btn btn-secondary btn-sm" data-ue-edit="' + esc(r.unitCode) + '">Abrir ficha</button></td>' +
                '</tr>';
        }).join('');
        tbody.querySelectorAll('[data-ue-edit]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                fillForm(btn.getAttribute('data-ue-edit'));
            });
        });
    }

    function fillUnitSelect() {
        var sel = document.getElementById('ueUnitCode');
        if (!sel) return;
        var html = '<option value="">Unidade</option>';
        _rows.forEach(function(u) {
            html += '<option value="' + esc(u.unitCode) + '">' + esc(u.unitCode) + '</option>';
        });
        sel.innerHTML = html;
    }

    function fillForm(unitCode) {
        var r = findRow(unitCode);
        var set = function(id, val) {
            var el = document.getElementById(id);
            if (el) el.value = val == null ? '' : val;
        };
        set('ueUnitCode', unitCode);
        set('ueMatricula', r ? r.matricula : '');
        set('ueInscricao', r ? r.inscricaoMunicipal : '');
        set('ueSalePrice', r ? r.salePrice : '');
        set('ueAppraiser', r ? r.appraiser : '');
        set('ueValue', r ? (r.engineeringValue || r.historicalEngineering) : '');
        set('ueM2', r ? r.valuePerM2 : '');
        set('ueDate', r ? r.appraisalDate : '');
        set('ueNotes', r ? r.notes : '');
        var exp = document.getElementById('ueExpiresHint');
        if (exp) {
            if (r && r.expiresAt) exp.textContent = 'Vence em ' + formatDate(r.expiresAt);
            else exp.textContent = 'Sem data = engenharia não aparece na vitrine (fica “A confirmar”).';
        }
        var archive = document.getElementById('ueArchiveDocs');
        if (archive) {
            var docs = (r && r.archiveDocuments) || [];
            archive.innerHTML = docs.length
                ? docs.map(function(d) {
                    var path = d.storagePath || '';
                    var name = esc(d.name);
                    var link = path
                        ? '<button type="button" class="pd-doc-link" data-pd-path="' + esc(path) + '">' + name + '</button>'
                        : name;
                    return '<li><span class="pd-doc-kind">' + esc(d.label || d.kind) + '</span> ' + link + '</li>';
                }).join('')
                : '<li>Nenhum arquivo antigo vinculado a esta unidade.</li>';
            bindDocLinks(archive);
        }
        var form = document.getElementById('ueForm');
        if (form) {
            form.hidden = false;
            form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    function bindDocLinks(root) {
        if (!root) return;
        root.querySelectorAll('[data-pd-path]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                openStoredDocument(btn.getAttribute('data-pd-path'));
            });
        });
    }

    function openStoredDocument(path) {
        if (!path) {
            if (typeof showMessage === 'function') showMessage('Arquivo sem caminho no Storage.', 'warning');
            return;
        }
        if (typeof adminPostJson !== 'function') return;
        adminPostJson('/getStorageReadUrl', { path: path }).then(function(data) {
            if (data && data.url) window.open(data.url, '_blank', 'noopener');
            else if (typeof showMessage === 'function') showMessage('Arquivo ainda não está no Storage.', 'warning');
        }).catch(function(err) {
            if (typeof showMessage === 'function') showMessage(err.message || 'Erro ao abrir o arquivo.', 'error');
        });
    }

    function onDateChange() {
        var el = document.getElementById('ueDate');
        var hint = document.getElementById('ueExpiresHint');
        if (!el || !hint) return;
        if (!el.value) {
            hint.textContent = 'Sem data = engenharia não aparece na vitrine (fica “A confirmar”).';
            return;
        }
        var p = el.value.split('-');
        var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
        d.setMonth(d.getMonth() + 6);
        function pad(n) { return (n < 10 ? '0' : '') + n; }
        hint.textContent = 'Vence em ' + pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
    }

    function loadUnitEngineeringAdmin(preferredId) {
        var sel = document.getElementById('ueProperty');
        if (sel && !sel.options.length) sel.innerHTML = propertyOptionsHtml();
        if (sel && preferredId != null && preferredId !== '') sel.value = String(preferredId);
        if (typeof loadEngineeringAlerts === 'function') loadEngineeringAlerts();
        var pid = selectedPropertyId();
        var tbody = document.getElementById('ueTableBody');
        if (!pid) {
            _rows = [];
            _property = null;
            fillBuildingForm({});
            if (tbody) tbody.innerHTML = '<tr><td colspan="9">Escolha um empreendimento.</td></tr>';
            var form = document.getElementById('ueForm');
            if (form) form.hidden = true;
            return;
        }
        loadSeed().then(function() {
            if (typeof adminPostJson !== 'function') {
                mergeLocalIfNeeded(pid);
                fillBuildingForm(_property);
                fillUnitSelect();
                renderTable();
                return;
            }
            return adminPostJson('/adminUnitEngineering', { action: 'list', propertyId: pid }).then(function(data) {
                _rows = (data && data.rows) || [];
                _catalog = (data && data.catalog) || null;
                _property = (data && data.property) || null;
                mergeLocalIfNeeded(pid);
                fillBuildingForm(_property);
                fillUnitSelect();
                renderTable();
            }).catch(function(err) {
                _catalog = null;
                _rows = [];
                _property = null;
                mergeLocalIfNeeded(pid);
                fillBuildingForm(_property);
                fillUnitSelect();
                renderTable();
                if (!_rows.length && tbody) {
                    tbody.innerHTML = '<tr><td colspan="9">' + esc(err.message || 'Erro') + '</td></tr>';
                }
            });
        });
    }

    function saveBuildingDossier(ev) {
        if (ev) ev.preventDefault();
        var pid = selectedPropertyId();
        if (!pid) {
            if (typeof showMessage === 'function') showMessage('Escolha o empreendimento.', 'warning');
            return;
        }
        var val = function(id) {
            var el = document.getElementById(id);
            return el ? el.value : '';
        };
        var payload = {
            action: 'save_property',
            propertyId: pid,
            officialName: val('pdOfficialName'),
            street: val('pdStreet'),
            neighborhood: val('pdNeighborhood'),
            city: val('pdCity'),
            cep: val('pdCep'),
            mapsUrl: val('pdMapsUrl'),
            cartorio: val('pdCartorio'),
            matriculaMae: val('pdMatriculaMae'),
            inscricaoTerreno: val('pdInscricaoTerreno'),
            engenheiro: val('pdEngenheiro'),
            crea: val('pdCrea'),
            artNumber: val('pdArtNumber'),
            notes: val('pdNotes')
        };
        if (typeof adminPostJson !== 'function') {
            if (typeof showMessage === 'function') showMessage('API administrativa indisponível.', 'error');
            return;
        }
        adminPostJson('/adminUnitEngineering', payload).then(function(data) {
            _property = (data && data.property) || _property;
            fillBuildingForm(_property);
            if (typeof showMessage === 'function') showMessage('Ficha do empreendimento gravada.', 'success');
        }).catch(function(err) {
            if (typeof showMessage === 'function') showMessage(err.message || 'Erro ao gravar o prédio.', 'error');
        });
    }

    async function saveUnitEngineering(ev) {
        if (ev) ev.preventDefault();
        var pid = selectedPropertyId();
        var unit = document.getElementById('ueUnitCode') && document.getElementById('ueUnitCode').value;
        if (!pid || !unit) {
            if (typeof showMessage === 'function') showMessage('Informe empreendimento e unidade.', 'warning');
            return;
        }
        var reportPath = '';
        var reportName = '';
        var fileEl = document.getElementById('ueReportFile');
        if (fileEl && fileEl.files && fileEl.files[0] && typeof uploadViaSignedUrl === 'function') {
            var token = typeof getAdminIdToken === 'function' ? await getAdminIdToken() : null;
            var up = await uploadViaSignedUrl(fileEl.files[0], 'engineering-reports', token);
            reportPath = up.path || '';
            reportName = up.name || '';
        }
        var current = findRow(unit) || {};
        var payload = {
            action: 'upsert',
            propertyId: pid,
            unitCode: unit,
            matricula: document.getElementById('ueMatricula').value,
            inscricaoMunicipal: document.getElementById('ueInscricao').value,
            salePrice: document.getElementById('ueSalePrice').value,
            appraiser: document.getElementById('ueAppraiser').value,
            engineeringValue: document.getElementById('ueValue').value,
            historicalEngineering: current.historicalEngineering || '',
            valuePerM2: document.getElementById('ueM2').value,
            appraisalDate: document.getElementById('ueDate').value,
            notes: document.getElementById('ueNotes').value,
            archiveDocuments: current.archiveDocuments || [],
            reportPath: reportPath,
            reportName: reportName
        };
        adminPostJson('/adminUnitEngineering', payload).then(function() {
            if (typeof showMessage === 'function') showMessage('Ficha da unidade gravada. Preço e engenharia vigente passam a alimentar a vitrine.', 'success');
            if (typeof invalidateEngineeringCache === 'function') invalidateEngineeringCache();
            if (fileEl) fileEl.value = '';
            loadUnitEngineeringAdmin();
            loadEngineeringAlerts();
        }).catch(function(err) {
            if (typeof showMessage === 'function') showMessage(err.message || 'Erro ao gravar.', 'error');
        });
    }

    async function openEngineeringReport() {
        var unit = document.getElementById('ueUnitCode') && document.getElementById('ueUnitCode').value;
        var r = findRow(unit);
        if (!r || !r.reportPath) {
            if (typeof showMessage === 'function') showMessage('Nenhum laudo novo anexado nesta ficha. Os PDFs do arquivo antigo ainda não foram enviados ao Storage.', 'warning');
            return;
        }
        adminPostJson('/getStorageReadUrl', { path: r.reportPath }).then(function(data) {
            if (data && data.url) window.open(data.url, '_blank', 'noopener');
        }).catch(function(err) {
            if (typeof showMessage === 'function') showMessage(err.message || 'Erro ao abrir laudo.', 'error');
        });
    }

    function loadEngineeringAlerts() {
        if (typeof adminPostJson !== 'function') return;
        adminPostJson('/adminUnitEngineering', { action: 'alerts' }).then(function(data) {
            _alerts = data;
            renderAlerts(data);
        }).catch(function() {});
    }

    function renderAlerts(data) {
        var box = document.getElementById('ueAlerts');
        var dash = document.getElementById('ueDashHint');
        var report = document.getElementById('ueReportBody');
        if (!data) return;
        var c = data.counts || {};
        var html = '<p><strong>' + (c.expiring || 0) + '</strong> a vencer (45 dias) · <strong>' +
            (c.expired || 0) + '</strong> vencida(s) · <strong>' + (c.vigente || 0) + '</strong> vigente(s).</p>';
        if (box) box.innerHTML = html;
        if (dash) dash.textContent = (c.expiring || 0) + ' engenharia(s) a vencer';
        if (report) {
            var rows = (data.expiring || []).concat(data.expired || []);
            if (!rows.length) {
                report.innerHTML = '<p>Nenhuma engenharia com data cadastrada vencendo ou vencida. Valores antigos do arquivo ficam na ficha, mas a vitrine mostra “A confirmar” até entrar laudo com data.</p>';
                return;
            }
            report.innerHTML = '<table class="admin-table"><thead><tr><th>Empreendimento</th><th>Unidade</th><th>Valor</th><th>Vence</th><th>Situação</th></tr></thead><tbody>' +
                rows.map(function(r) {
                    var title = r.propertyId;
                    if (typeof getPropertyById === 'function') {
                        var p = getPropertyById(r.propertyId) || getPropertyById(Number(r.propertyId));
                        if (p) title = p.title || p.name || title;
                    }
                    return '<tr class="' + (r.status === 'vencida' ? 'ue-row--expired' : 'ue-row--soon') + '">' +
                        '<td>' + esc(title) + '</td><td>' + esc(r.unitCode) + '</td><td>' +
                        esc(formatMoney(r.engineeringValue)) + '</td><td>' + esc(formatDate(r.expiresAt)) +
                        '</td><td><span class="' + statusClass(r.status) + '">' + esc(r.statusLabel) + '</span></td></tr>';
                }).join('') + '</tbody></table>';
        }
    }

    if (typeof window !== 'undefined') {
        window.loadUnitEngineeringAdmin = loadUnitEngineeringAdmin;
        window.saveUnitEngineering = saveUnitEngineering;
        window.saveBuildingDossier = saveBuildingDossier;
        window.loadEngineeringAlerts = loadEngineeringAlerts;
        window.openEngineeringReport = openEngineeringReport;
        window.onEngineeringDateChange = onDateChange;
    }
})();
