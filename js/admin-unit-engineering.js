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
    var _sortKey = 'unit';
    var _sortDir = 'asc';
    var _filterText = '';
    var _statusFilter = '';
    var _openUnit = '';
    var _uiBound = false;
    var _archiveCurrentOnSave = false;
    var _archiveRgiOnSave = false;
    var _pendingLaudo = null;
    var _pendingRgi = null;
    var _pendingLaudoPromise = null;
    var _pendingRgiPromise = null;
    var _laudoSeq = 0;
    var _rgiSeq = 0;

    var BUILDING_PRIMARY = {
        art: 1, crea: 1, memorial: 1, habite_planta: 1, averbacao: 1,
        scpo: 1, recibo_obra: 1, kit_engenharia: 1, matricula_mae: 1, convencao: 1
    };

    function esc(t) {
        if (typeof escapeHtml === 'function') return escapeHtml(t);
        return String(t == null ? '' : t)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function parseMoneyInput(s) {
        if (s == null || s === '') return '';
        if (typeof s === 'number' && isFinite(s)) return s;
        var t = String(s).replace(/[R$\s]/gi, '').replace(/\./g, '').replace(',', '.');
        var n = Number(t);
        return isFinite(n) ? n : '';
    }

    function formatMoney(v) {
        if (v == null || v === '') return '';
        if (typeof v === 'number') return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        var parsed = parseMoneyInput(v);
        if (parsed !== '') return parsed.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        return String(v);
    }

    function formatDate(ymd) {
        if (!ymd) return '';
        var p = String(ymd).split('-');
        if (p.length !== 3) return ymd;
        return p[2] + '/' + p[1] + '/' + p[0];
    }

    function dateFromDocName(name) {
        var m = String(name || '').match(/(\d{1,2})[-:._\/](\d{1,2})[-:._\/](\d{4})/);
        if (!m) return '';
        var dd = String(m[1]).padStart(2, '0');
        var mm = String(m[2]).padStart(2, '0');
        var yy = m[3];
        if (Number(yy) < 1990 || Number(yy) > 2100) return '';
        if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return '';
        return yy + '-' + mm + '-' + dd;
    }

    function isSaneAppraiser(raw) {
        var s = String(raw || '').replace(/\s+/g, ' ').trim();
        if (s.length < 8) return false;
        if (/representante|outros|^legal$|^data$/i.test(s)) return false;
        return true;
    }

    function isSaneM2(raw, valor) {
        var n = Number(raw);
        if (!isFinite(n) || n <= 0 || n >= 40000) return false;
        if (valor && Number(valor) && n >= Number(valor) * 0.35) return false;
        return true;
    }

    function garantiaLabel(value) {
        if (value === 'apta') return 'Apta para garantia Caixa';
        if (value === 'inapta') return 'Inapta para garantia Caixa';
        return '';
    }

    function updateGarantiaHint(value, snippet) {
        var hint = document.getElementById('ueGarantiaHint');
        var banner = document.getElementById('ueInaptaBanner');
        if (banner) banner.hidden = value !== 'inapta';
        if (!hint) return;
        hint.classList.remove('ue-garantia-apta', 'ue-garantia-inapta');
        if (value === 'apta') {
            hint.classList.add('ue-garantia-apta');
            hint.textContent = 'Avaliador: imóvel apto à aceitação como garantia da Caixa.';
        } else if (value === 'inapta') {
            hint.classList.add('ue-garantia-inapta');
            hint.textContent = 'Avaliador: imóvel não atende aos requisitos mínimos da Caixa.';
        } else {
            hint.textContent = snippet
                ? 'Manifestação não identificada automaticamente. Confira o PDF e indique se está apta.'
                : 'Lida da manifestação do avaliador sobre aceitação do bem como garantia da Caixa.';
        }
    }

    function setParseHint(text, reading) {
        var el = document.getElementById('ueParseHint');
        if (!el) return;
        el.hidden = !text;
        el.textContent = text || '';
        if (reading) el.classList.add('is-reading');
        else el.classList.remove('is-reading');
    }

    function setCurrentReportLabel(name, path, pending) {
        var el = document.getElementById('ueCurrentReport');
        if (!el) return;
        if (path || name) {
            el.textContent = 'PDF desta engenharia: ' + (name || 'anexado') +
                (pending ? ' — salve a ficha para gravar.' : '');
        } else {
            el.textContent = 'Nenhum PDF nesta engenharia ainda.';
        }
    }

    function existingDocNames(r, kind) {
        var names = [];
        if (!r) return names;
        if (kind === 'laudo') {
            if (r.reportName) names.push(r.reportName);
            (r.engineeringHistory || []).forEach(function(h) {
                if (h.reportName) names.push(h.reportName);
            });
            (r.archiveDocuments || []).forEach(function(d) {
                if (d.kind === 'laudo' && d.name) names.push(d.name);
            });
        }
        if (kind === 'rgi') {
            if (r.rgiName) names.push(r.rgiName);
            (r.rgiHistory || []).forEach(function(h) {
                if (h.rgiName) names.push(h.rgiName);
            });
            (r.archiveDocuments || []).forEach(function(d) {
                if ((d.kind === 'onus' || d.kind === 'rgi') && d.name) names.push(d.name);
            });
        }
        return names;
    }

    function adminFunctionsBase() {
        if (typeof ADMIN_FUNCTIONS_BASE !== 'undefined' && ADMIN_FUNCTIONS_BASE) return ADMIN_FUNCTIONS_BASE;
        if (typeof getCloudFunctionsBaseUrl === 'function') return getCloudFunctionsBaseUrl();
        return '';
    }

    function clearPendingUploads() {
        _laudoSeq += 1;
        _rgiSeq += 1;
        _pendingLaudo = null;
        _pendingRgi = null;
        _pendingLaudoPromise = null;
        _pendingRgiPromise = null;
        var report = document.getElementById('ueReportFile');
        var rgi = document.getElementById('ueRgiFile');
        if (report) report.value = '';
        if (rgi) rgi.value = '';
        setParseHint('', false);
    }

    function parseUnit(code) {
        var raw = String(code || '').trim();
        var n = raw.toLowerCase().replace(/\s+/g, ' ').replace(/\bcassa\b/, 'casa');
        var qt = n.match(/\(([^)]+)\)/);
        var qtTxt = qt ? ' (' + qt[1].replace(/\s+/g, ' ') + ')' : '';
        var apto = n.match(/\bapto\s*(\d+)/);
        if (apto) {
            return { kind: 'apto', number: Number(apto[1]), extra: 0, raw: raw, label: 'Apto ' + apto[1] };
        }
        if (/(casa|cs)\s*base/.test(n)) {
            return { kind: 'casa', number: 0, extra: 0, raw: raw, label: 'Casa base' };
        }
        if (/^\d+\s*(\(|$)/.test(n) && !/\b(cs|casa)\b/.test(n)) {
            return { kind: 'casa', number: 0, extra: 0, raw: raw, label: raw.replace(/\s+/g, ' ') };
        }
        var casa = n.match(/(?:casa|cs)\s*(\d+)/);
        if (casa) {
            var extra = 0;
            var suffix = '';
            if (/\bsob/.test(n)) { extra = 2; suffix = ' — sobrado'; }
            else if (/\bap\b/.test(n)) { extra = 1; suffix = ' — apto'; }
            return {
                kind: 'casa',
                number: Number(casa[1]),
                extra: extra,
                raw: raw,
                label: 'Casa ' + String(casa[1]).padStart(2, '0') + suffix + qtTxt
            };
        }
        return { kind: 'other', number: 9999, extra: 0, raw: raw, label: raw };
    }

    function formatUnitLabel(code) {
        return String(code || '').trim();
    }

    function addMonthsYmd(ymd, months) {
        var parts = String(ymd || '').split('-');
        if (parts.length < 3) return '';
        var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        if (isNaN(d.getTime())) return '';
        d.setMonth(d.getMonth() + months);
        function pad(n) { return (n < 10 ? '0' : '') + n; }
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    function compareUnitCodes(a, b) {
        var A = parseUnit(a);
        var B = parseUnit(b);
        var kindRank = { casa: 1, apto: 2, other: 3 };
        if (kindRank[A.kind] !== kindRank[B.kind]) return kindRank[A.kind] - kindRank[B.kind];
        if (A.number !== B.number) return A.number - B.number;
        if (A.extra !== B.extra) return A.extra - B.extra;
        return A.raw.localeCompare(B.raw, 'pt', { numeric: true, sensitivity: 'base' });
    }

    function numericKey(s) {
        var t = String(s || '').replace(/\D+/g, '');
        return t ? Number(t) : Number.POSITIVE_INFINITY;
    }

    function moneyKey(v) {
        if (v == null || v === '') return Number.NEGATIVE_INFINITY;
        if (typeof v === 'number' && isFinite(v)) return v;
        var n = parseMoneyInput(v);
        return n === '' ? Number.NEGATIVE_INFINITY : n;
    }

    function dateKey(ymd, emptyLast) {
        if (!ymd) return emptyLast ? '9999-99-99' : '0000-00-00';
        return String(ymd);
    }

    function compareRows(a, b) {
        var dir = _sortDir === 'desc' ? -1 : 1;
        var av;
        var bv;
        if (_sortKey === 'matricula') {
            av = numericKey(a.matricula);
            bv = numericKey(b.matricula);
            if (av !== bv) return (av - bv) * dir;
        } else if (_sortKey === 'iptu') {
            av = String(a.inscricaoMunicipal || '');
            bv = String(b.inscricaoMunicipal || '');
            if (av !== bv) return av.localeCompare(bv, 'pt', { numeric: true }) * dir;
        } else if (_sortKey === 'salePrice') {
            av = moneyKey(a.salePrice);
            bv = moneyKey(b.salePrice);
            if (av !== bv) return (av - bv) * dir;
        } else if (_sortKey === 'engineering') {
            av = moneyKey(a.engineeringValue || a.historicalEngineering);
            bv = moneyKey(b.engineeringValue || b.historicalEngineering);
            if (av !== bv) return (av - bv) * dir;
        } else if (_sortKey === 'appraisalDate') {
            av = dateKey(a.appraisalDate, _sortDir === 'asc');
            bv = dateKey(b.appraisalDate, _sortDir === 'asc');
            if (av !== bv) return av.localeCompare(bv) * dir;
        } else if (_sortKey === 'expiresAt') {
            av = dateKey(a.expiresAt, _sortDir === 'asc');
            bv = dateKey(b.expiresAt, _sortDir === 'asc');
            if (av !== bv) return av.localeCompare(bv) * dir;
        } else {
            return compareUnitCodes(a.unitCode, b.unitCode) * dir;
        }
        return compareUnitCodes(a.unitCode, b.unitCode);
    }

    function visibleRows() {
        var q = String(_filterText || '').trim().toLowerCase();
        return _rows.filter(function(r) {
            if (_statusFilter && String(r.status || 'sem_laudo') !== _statusFilter) return false;
            if (!q) return true;
            var blob = [
                r.unitCode,
                formatUnitLabel(r.unitCode),
                r.matricula,
                r.inscricaoMunicipal
            ].join(' ').toLowerCase();
            return blob.indexOf(q) !== -1;
        }).slice().sort(compareRows);
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
        if (_property && !_property.cep && seed.cep) {
            _property.cep = seed.cep;
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
                if (!r.appraisalDate && su.appraisalDate) r.appraisalDate = su.appraisalDate;
                if (!r.valuePerM2 && su.valuePerM2) r.valuePerM2 = su.valuePerM2;
                if (!r.appraiser && su.appraiser) r.appraiser = su.appraiser;
                if (!r.reportPath && su.reportPath) {
                    r.reportPath = su.reportPath;
                    r.reportName = su.reportName || r.reportName;
                }
                if (!r.engineeringValue && su.engineeringValue) r.engineeringValue = su.engineeringValue;
                if (r.appraisalDate && !r.expiresAt) {
                    var parts = String(r.appraisalDate).split('-');
                    if (parts.length === 3) {
                        var dt = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                        dt.setMonth(dt.getMonth() + 6);
                        function pad(n) { return (n < 10 ? '0' : '') + n; }
                        r.expiresAt = dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
                        var today = new Date();
                        var t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                        var days = Math.round((dt - t0) / 86400000);
                        if (days < 0) { r.status = 'vencida'; r.statusLabel = 'Vencida'; }
                        else if (days <= 45) { r.status = 'a_vencer'; r.statusLabel = 'A vencer'; }
                        else { r.status = 'vigente'; r.statusLabel = 'Vigente'; }
                    }
                }
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
                appraisalDate: (su && su.appraisalDate) || '',
                valuePerM2: (su && su.valuePerM2) || '',
                appraiser: (su && su.appraiser) || '',
                reportPath: (su && su.reportPath) || '',
                reportName: (su && su.reportName) || '',
                salePrice: (su && su.salePrice) != null ? su.salePrice : u.price,
                engineeringValue: (su && su.historicalEngineering) || (su && su.engineeringValue) || '',
                historicalEngineering: (su && su.historicalEngineering) || '',
                expiresAt: (su && su.appraisalDate) ? addMonthsYmd(su.appraisalDate, 6) : '',
                archiveDocuments: (su && su.documents) || [],
                notes: (su && su.notes) || '',
                status: 'sem_laudo',
                statusLabel: 'Sem data — não vai à vitrine',
                bedrooms: u.bedrooms,
                catalogStatus: u.catalogStatus || u.status || ''
            };
        });
        _rows.forEach(function(r) {
            if (!r.expiresAt) return;
            var p = String(r.expiresAt).split('-');
            if (p.length !== 3) return;
            var dt = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
            var today = new Date();
            var t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            var days = Math.round((dt - t0) / 86400000);
            if (days < 0) { r.status = 'vencida'; r.statusLabel = 'Vencida'; }
            else if (days <= 45) { r.status = 'a_vencer'; r.statusLabel = 'A vencer'; }
            else { r.status = 'vigente'; r.statusLabel = 'Vigente'; }
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
                var path = d.storagePath || d.reportPath || '';
                var name = esc(d.name || d.reportName || 'Arquivo');
                var link = path
                    ? '<button type="button" class="pd-doc-link" data-pd-path="' + esc(path) + '">' + name + '</button>'
                    : name;
                return '<li><span class="pd-doc-kind">' + esc(d.label || d.kind || 'Arquivo') + '</span> ' + link + '</li>';
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

    function updateSortHeaders() {
        document.querySelectorAll('.pd-units-table [data-ue-sort]').forEach(function(th) {
            th.classList.remove('is-sorted-asc', 'is-sorted-desc');
            if (th.getAttribute('data-ue-sort') === _sortKey) {
                th.classList.add(_sortDir === 'desc' ? 'is-sorted-desc' : 'is-sorted-asc');
            }
        });
    }

    function renderTable() {
        var tbody = document.getElementById('ueTableBody');
        if (!tbody) return;
        updateSortHeaders();
        if (!_rows.length) {
            tbody.innerHTML = '<tr><td colspan="9">Sem unidades neste empreendimento.</td></tr>';
            return;
        }
        var rows = visibleRows();
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="9">Nenhuma unidade com esse filtro.</td></tr>';
            return;
        }
        tbody.innerHTML = rows.map(function(r) {
            var eng = r.engineeringValue || r.historicalEngineering || '';
            var docs = (r.archiveDocuments || []).map(function(d) { return d.label || d.kind; });
            if (r.reportName) docs.unshift('Laudo anexado');
            var docTxt = docs.length ? docs.filter(function(v, i, a) { return a.indexOf(v) === i; }).join(', ') : '—';
            var openCls = String(r.unitCode) === String(_openUnit) ? ' is-open' : '';
            var rowCls = (r.status === 'vencida' ? 'ue-row--expired' : (r.status === 'a_vencer' ? 'ue-row--soon' : '')) + openCls;
            var validity = '<div class="ue-validity"><span>' + esc(formatDate(r.expiresAt) || '—') + '</span>' +
                '<span class="' + statusClass(r.status) + '">' + esc(r.statusLabel || 'Sem data') + '</span></div>';
            return '<tr class="' + rowCls + '" data-ue-row="' + esc(r.unitCode) + '">' +
                '<td><span class="ue-unit-name">' + esc(r.unitCode) + '</span></td>' +
                '<td>' + esc(r.matricula || '—') + '</td>' +
                '<td>' + esc(r.inscricaoMunicipal || '—') + '</td>' +
                '<td>' + esc(formatMoney(r.salePrice) || '—') + '</td>' +
                '<td>' + esc(formatMoney(eng) || '—') + '</td>' +
                '<td>' + esc(formatDate(r.appraisalDate) || '—') + '</td>' +
                '<td>' + validity + '</td>' +
                '<td class="pd-docs-cell">' + esc(docTxt) + '</td>' +
                '<td><button type="button" class="btn btn-secondary btn-sm" data-ue-edit="' + esc(r.unitCode) + '">Abrir</button></td>' +
                '</tr>';
        }).join('');
        tbody.querySelectorAll('[data-ue-row]').forEach(function(tr) {
            tr.addEventListener('click', function() {
                openUnitDrawer(tr.getAttribute('data-ue-row'));
            });
        });
        tbody.querySelectorAll('[data-ue-edit]').forEach(function(btn) {
            btn.addEventListener('click', function(ev) {
                ev.stopPropagation();
                openUnitDrawer(btn.getAttribute('data-ue-edit'));
            });
        });
    }

    function fillUnitSelect() {
        var sel = document.getElementById('ueUnitCode');
        if (sel && sel.tagName === 'SELECT') {
            var html = '<option value="">Unidade</option>';
            visibleRows().forEach(function(u) {
                html += '<option value="' + esc(u.unitCode) + '">' + esc(formatUnitLabel(u.unitCode)) + '</option>';
            });
            sel.innerHTML = html;
        }
    }

    function setDrawerOpen(open) {
        var drawer = document.getElementById('ueUnitDrawer');
        if (!drawer) return;
        drawer.hidden = !open;
        document.body.classList.toggle('ue-drawer-open', !!open);
        if (!open) {
            _openUnit = '';
            renderTable();
        }
    }

    function closeUnitDrawer() {
        setDrawerOpen(false);
    }

    function stepOpenUnit(delta) {
        var rows = visibleRows();
        if (!rows.length) return;
        var idx = -1;
        rows.forEach(function(r, i) {
            if (String(r.unitCode) === String(_openUnit)) idx = i;
        });
        var next = rows[(idx + delta + rows.length) % rows.length];
        if (next) openUnitDrawer(next.unitCode);
    }

    function fillForm(unitCode) {
        openUnitDrawer(unitCode);
    }

    function openUnitDrawer(unitCode) {
        var r = findRow(unitCode);
        if (!r && unitCode) {
            if (typeof showMessage === 'function') showMessage('Unidade não encontrada neste empreendimento.', 'warning');
            return;
        }
        _openUnit = unitCode || '';
        _archiveCurrentOnSave = false;
        _archiveRgiOnSave = false;
        clearPendingUploads();
        var set = function(id, val) {
            var el = document.getElementById(id);
            if (el) el.value = val == null ? '' : val;
        };
        set('ueUnitCode', unitCode);
        set('ueMatricula', r ? r.matricula : '');
        set('ueInscricao', r ? r.inscricaoMunicipal : '');
        set('ueSalePrice', r ? formatMoney(r.salePrice) : '');
        set('ueAppraiser', r ? r.appraiser : '');
        set('ueValue', r ? formatMoney(r.engineeringValue || r.historicalEngineering) : '');
        set('ueM2', r ? formatMoney(r.valuePerM2) : '');
        set('ueDate', r ? r.appraisalDate : '');
        set('ueGarantiaCaixa', r ? (r.garantiaCaixa || '') : '');
        updateGarantiaHint(r ? r.garantiaCaixa : '', '');
        setCurrentReportLabel(r ? r.reportName : '', r ? r.reportPath : '', false);
        set('ueNotes', r ? r.notes : '');
        var label = document.getElementById('ueDrawerUnitLabel');
        if (label) {
            label.textContent = r
                ? String(r.unitCode || '') + (r.matricula ? ' · matrícula ' + r.matricula : '')
                : '';
        }
        set('ueExpiresAt', r && r.expiresAt ? r.expiresAt : (r && r.appraisalDate ? addMonthsYmd(r.appraisalDate, 6) : ''));
        var exp = document.getElementById('ueExpiresHint');
        if (exp) {
            if (r && (r.expiresAt || r.appraisalDate)) {
                exp.textContent = 'Validade de 6 meses a partir da data da engenharia.';
            } else {
                exp.textContent = 'Sem data = engenharia não aparece na vitrine (fica “A confirmar”).';
            }
        }
        var banner = document.getElementById('ueExpiredBanner');
        if (banner) {
            banner.hidden = !(r && r.status === 'vencida');
        }
        var newHint = document.getElementById('ueNewEngHint');
        if (newHint) newHint.hidden = true;
        set('ueRgiDate', r ? (r.rgiDate || '') : '');
        var rgiHint = document.getElementById('ueNewRgiHint');
        if (rgiHint) rgiHint.hidden = true;
        renderEngineeringHistory(r);
        renderRgiHistory(r);
        var archive = document.getElementById('ueArchiveDocs');
        if (archive) {
            var docs = ((r && r.archiveDocuments) || []).filter(function(d) {
                return d.kind !== 'onus' && d.kind !== 'laudo';
            });
            archive.innerHTML = docs.length
                ? docs.map(function(d) {
                    var path = d.storagePath || '';
                    var name = esc(d.name);
                    var link = path
                        ? '<button type="button" class="pd-doc-link" data-pd-path="' + esc(path) + '">' + name + '</button>'
                        : name;
                    return '<li><span class="pd-doc-kind">' + esc(d.label || d.kind) + '</span> ' + link + '</li>';
                }).join('')
                : '<li>Nenhum outro arquivo vinculado a esta unidade.</li>';
            bindDocLinks(archive);
        }
        renderRelated(selectedPropertyId(), unitCode);
        setDrawerOpen(true);
        renderTable();
        var first = document.getElementById('ueMatricula');
        if (first) first.focus();
    }

    function bindUnitsUi() {
        if (_uiBound) return;
        _uiBound = true;
        var table = document.querySelector('.pd-units-table');
        if (table) {
            table.addEventListener('click', function(ev) {
                var th = ev.target.closest('[data-ue-sort]');
                if (!th || !table.contains(th)) return;
                var key = th.getAttribute('data-ue-sort');
                if (_sortKey === key) _sortDir = _sortDir === 'asc' ? 'desc' : 'asc';
                else {
                    _sortKey = key;
                    _sortDir = 'asc';
                }
                renderTable();
            });
        }
        var filter = document.getElementById('ueUnitFilter');
        if (filter) {
            filter.addEventListener('input', function() {
                _filterText = filter.value;
                renderTable();
            });
        }
        var status = document.getElementById('ueStatusFilter');
        if (status) {
            status.addEventListener('change', function() {
                _statusFilter = status.value;
                renderTable();
            });
        }
        var prev = document.getElementById('uePrevUnit');
        var next = document.getElementById('ueNextUnit');
        if (prev) prev.addEventListener('click', function() { stepOpenUnit(-1); });
        if (next) next.addEventListener('click', function() { stepOpenUnit(1); });
        document.addEventListener('keydown', function(ev) {
            var drawer = document.getElementById('ueUnitDrawer');
            if (!drawer || drawer.hidden) return;
            if (ev.key === 'Escape') closeUnitDrawer();
        });
        var reportFile = document.getElementById('ueReportFile');
        if (reportFile) reportFile.addEventListener('change', onLaudoFileSelected);
        var rgiFile = document.getElementById('ueRgiFile');
        if (rgiFile) rgiFile.addEventListener('change', onRgiFileSelected);
        var garantia = document.getElementById('ueGarantiaCaixa');
        if (garantia) {
            garantia.addEventListener('change', function() {
                updateGarantiaHint(garantia.value, '');
            });
        }
    }

    function renderRelated(pid, unitCode) {
        var box = document.getElementById('ueRelated');
        if (!box) return;
        if (!pid || !unitCode) {
            box.innerHTML = '';
            return;
        }
        var reservations = (window._adminReservationsCache || []).filter(function(r) {
            return String(r.propertyId) === String(pid) && String(r.unitCode || '') === String(unitCode);
        });
        var sales = [];
        if (typeof getSalesData === 'function') {
            sales = getSalesData().filter(function(s) {
                return String(s.propertyId) === String(pid) && String(s.unitCode || '') === String(unitCode);
            });
        }
        var html = '<p class="form-hint"><strong>Ligado a</strong></p><div class="ue-toolbar">';
        html += '<button type="button" class="btn btn-secondary btn-sm" data-ue-go="reservations">Reservas (' + reservations.length + ')</button>';
        html += '<button type="button" class="btn btn-secondary btn-sm" data-ue-go="sales">Vendas (' + sales.length + ')</button>';
        html += '<button type="button" class="btn btn-secondary btn-sm" data-ue-go="boletos">Boletos</button>';
        html += '</div>';
        if (reservations[0]) {
            var cli = (reservations[0].client && reservations[0].client.name) || (reservations[0].clientInfo && reservations[0].clientInfo.name) || '';
            html += '<p class="form-hint">Reserva ' + esc(reservations[0].status || '') + (cli ? ' · ' + esc(cli) : '') + '</p>';
        }
        if (sales[0]) {
            html += '<p class="form-hint">Venda ' + esc(formatMoney(sales[0].salePrice) || '') + (sales[0].clientName ? ' · ' + esc(sales[0].clientName) : '') + '</p>';
        }
        box.innerHTML = html;
        box.querySelectorAll('[data-ue-go]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                goToLinkedSection(btn.getAttribute('data-ue-go'), pid, unitCode);
            });
        });
    }

    function goToLinkedSection(sectionId, pid, unitCode) {
        closeUnitDrawer();
        if (sectionId === 'reservations') {
            var el = document.getElementById('resFilterProperty');
            if (el) el.value = String(pid);
            if (typeof showSection === 'function') showSection('reservations');
            if (typeof loadReservationsData === 'function') loadReservationsData();
            return;
        }
        if (typeof showSection === 'function') showSection(sectionId);
        if (sectionId === 'sales' && typeof renderSalesTable === 'function') renderSalesTable();
        if (sectionId === 'boletos' && typeof loadAdminBoletos === 'function') loadAdminBoletos();
    }

    function openUnitDossier(propertyId, unitCode) {
        if (typeof openPropertyDocumentation === 'function') {
            openPropertyDocumentation(propertyId);
        } else {
            if (typeof showSection === 'function') showSection('properties');
            if (typeof showPropertiesTab === 'function') showPropertiesTab('docs');
        }
        var done = loadUnitEngineeringAdmin(propertyId);
        if (unitCode && done && typeof done.then === 'function') {
            done.then(function() { openUnitDrawer(unitCode); });
        } else if (unitCode) {
            setTimeout(function() { openUnitDrawer(unitCode); }, 450);
        }
    }

    function renderEngineeringHistory(r) {
        var box = document.getElementById('ueEngHistory');
        if (!box) return;
        var items = (r && Array.isArray(r.engineeringHistory)) ? r.engineeringHistory.slice() : [];
        var seenHist = {};
        items = items.filter(function(h) {
            var key = String(h.reportPath || h.storagePath || '') + '|' + String(h.appraisalDate || '') + '|' + String(h.appraiser || '');
            if (seenHist[key]) return false;
            seenHist[key] = true;
            return true;
        });
        if (!items.length) {
            box.innerHTML = '<li class="form-hint">Nenhum laudo anterior. Ao vencer, use “Cadastrar nova engenharia” para guardar o atual e registrar o próximo.</li>';
            return;
        }
        box.innerHTML = items.map(function(h, idx) {
            var path = h.storagePath || h.reportPath || '';
            var fileLabel = h.reportName || (path ? path.split('/').pop() : '');
            var title = formatDate(h.appraisalDate || dateFromDocName(fileLabel)) || 'Sem data';
            var val = formatMoney(h.engineeringValue) || '—';
            var who = isSaneAppraiser(h.appraiser) ? esc(h.appraiser) : '—';
            var garantia = garantiaLabel(h.garantiaCaixa);
            var garantiaHtml = garantia
                ? '<span class="' + (h.garantiaCaixa === 'inapta' ? 'ue-garantia-inapta' : 'ue-garantia-apta') + '">' + esc(garantia) + '</span>'
                : '';
            var pdf = path
                ? '<button type="button" class="pd-doc-link" data-pd-path="' + esc(path) + '">' +
                    esc(fileLabel || 'Abrir PDF') + '</button>'
                : '<span>sem PDF</span>';
            return '<li><span class="ue-eng-hist-idx">#' + (items.length - idx) + '</span>' +
                '<span>' + esc(title) + '</span><span>' + esc(val) + '</span>' +
                '<span>' + who + '</span>' + garantiaHtml + pdf + '</li>';
        }).join('');
        bindDocLinks(box);
    }

    function currentRgiPath(r) {
        if (r && r.rgiPath) return r.rgiPath;
        var found = '';
        ((r && r.archiveDocuments) || []).some(function(d) {
            if (d.kind === 'onus' && d.storagePath) { found = d.storagePath; return true; }
            return false;
        });
        return found;
    }

    function currentRgiName(r) {
        if (r && r.rgiName) return r.rgiName;
        var found = '';
        ((r && r.archiveDocuments) || []).some(function(d) {
            if (d.kind === 'onus' && d.name) { found = d.name; return true; }
            return false;
        });
        return found;
    }

    function renderRgiHistory(r) {
        var box = document.getElementById('ueRgiHistory');
        if (!box) return;
        var currentPath = currentRgiPath(r);
        var currentName = currentRgiName(r);
        var items = (r && Array.isArray(r.rgiHistory)) ? r.rgiHistory.slice() : [];
        var html = '';
        if (currentPath) {
            html += '<li><span class="ue-eng-hist-idx">atual</span>' +
                '<span>' + esc(formatDate(r && r.rgiDate) || 'sem data') + '</span>' +
                '<button type="button" class="pd-doc-link" data-pd-path="' + esc(currentPath) + '">' +
                esc(currentName || 'Abrir PDF') + '</button></li>';
        }
        html += items.map(function(h, idx) {
            var path = h.rgiPath || h.storagePath || '';
            var pdf = path
                ? '<button type="button" class="pd-doc-link" data-pd-path="' + esc(path) + '">' +
                    esc(h.rgiName || h.name || 'Abrir PDF') + '</button>'
                : '<span>sem PDF</span>';
            return '<li><span class="ue-eng-hist-idx">#' + (items.length - idx) + '</span>' +
                '<span>' + esc(formatDate(h.rgiDate) || 'sem data') + '</span>' + pdf + '</li>';
        }).join('');
        if (!html) {
            box.innerHTML = '<li class="form-hint">Nenhum RGI anterior. Use “Cadastrar novo RGI” para guardar o atual e registrar o próximo.</li>';
            return;
        }
        box.innerHTML = html;
        bindDocLinks(box);
    }

    function startNewUnitRgi() {
        var unit = document.getElementById('ueUnitCode') && document.getElementById('ueUnitCode').value;
        var r = findRow(unit);
        var hasCurrent = !!currentRgiPath(r);
        if (hasCurrent) {
            var ok = window.confirm(
                'O RGI atual vai para o histórico desta unidade. Anexe a nova certidão e salve.\n\nContinuar?'
            );
            if (!ok) return;
        }
        _archiveRgiOnSave = hasCurrent;
        var dateEl = document.getElementById('ueRgiDate');
        if (dateEl) dateEl.value = '';
        var fileEl = document.getElementById('ueRgiFile');
        if (fileEl) fileEl.value = '';
        var hint = document.getElementById('ueNewRgiHint');
        if (hint) hint.hidden = false;
        if (fileEl) fileEl.focus();
        if (typeof showMessage === 'function') {
            showMessage('Anexe o novo RGI e salve. O anterior fica no histórico.', 'info');
        }
    }

    function openCurrentRgi() {
        var unit = document.getElementById('ueUnitCode') && document.getElementById('ueUnitCode').value;
        var path = currentRgiPath(findRow(unit));
        if (!path) {
            if (typeof showMessage === 'function') showMessage('Nenhum RGI vinculado a esta ficha.', 'warning');
            return;
        }
        openStoredDocument(path);
    }

    function startNewUnitEngineering() {
        var unit = document.getElementById('ueUnitCode') && document.getElementById('ueUnitCode').value;
        var r = findRow(unit);
        var hasCurrent = !!(r && (r.appraisalDate || r.reportPath || r.engineeringValue));
        if (hasCurrent) {
            var ok = window.confirm(
                'O laudo atual vai para o histórico desta unidade. Preencha a nova engenharia e salve.\n\nContinuar?'
            );
            if (!ok) return;
        }
        _archiveCurrentOnSave = hasCurrent;
        var set = function(id, val) {
            var el = document.getElementById(id);
            if (el) el.value = val == null ? '' : val;
        };
        set('ueAppraiser', '');
        set('ueValue', '');
        set('ueM2', '');
        set('ueDate', '');
        set('ueExpiresAt', '');
        set('ueGarantiaCaixa', '');
        updateGarantiaHint('', '');
        _laudoSeq += 1;
        _pendingLaudo = null;
        _pendingLaudoPromise = null;
        var fileEl = document.getElementById('ueReportFile');
        if (fileEl) fileEl.value = '';
        setParseHint('Anexe o PDF do laudo. A leitura dos campos é automática.', false);
        var exp = document.getElementById('ueExpiresHint');
        if (exp) {
            exp.textContent = 'Nova engenharia: preencha data, responsável, valor, m² e anexe o PDF.';
        }
        var hint = document.getElementById('ueNewEngHint');
        if (hint) hint.hidden = false;
        var banner = document.getElementById('ueExpiredBanner');
        if (banner) banner.hidden = true;
        var dateEl = document.getElementById('ueDate');
        if (dateEl) dateEl.focus();
        if (typeof showMessage === 'function') {
            showMessage('Preencha o novo laudo e salve. O anterior fica no histórico.', 'info');
        }
    }

    function bindDocLinks(root) {
        if (!root) return;
        root.querySelectorAll('[data-pd-path]').forEach(function(btn) {
            btn.addEventListener('click', function(ev) {
                ev.preventDefault();
                ev.stopPropagation();
                openStoredDocument(btn.getAttribute('data-pd-path'));
            });
        });
    }

    function openStoredDocument(storagePath) {
        if (!storagePath) {
            if (typeof showMessage === 'function') showMessage('Arquivo sem caminho no Storage.', 'warning');
            return;
        }
        var encoded = encodeURIComponent(storagePath);
        Promise.resolve(typeof getAdminIdToken === 'function' ? getAdminIdToken() : null).then(function(token) {
            if (!token) throw new Error('Sessão expirada. Faça login novamente.');
            return fetch(adminFunctionsBase() + '/getStorageReadUrl?storagePath=' + encoded + '&mode=file', {
                method: 'POST',
                headers: {
                    Authorization: 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    storagePath: storagePath,
                    filePath: storagePath,
                    objectPath: storagePath,
                    path: storagePath,
                    mode: 'file'
                }),
                cache: 'no-store',
                credentials: 'omit'
            });
        }).then(function(res) {
            if (!res.ok) {
                return res.text().then(function(txt) {
                    var data = null;
                    try { data = txt ? JSON.parse(txt) : null; } catch (e1) {}
                    throw new Error((data && data.error) || 'Erro ao abrir o arquivo.');
                });
            }
            return res.blob();
        }).then(function(blob) {
            var u = URL.createObjectURL(blob);
            window.open(u, '_blank', 'noopener');
        }).catch(function(err) {
            if (typeof showMessage === 'function') showMessage(err.message || 'Erro ao abrir o arquivo.', 'error');
        });
    }

    function applyExtractedLaudo(ex, fileName, overwrite) {
        ex = ex || {};
        var put = function(id, val) {
            if (val == null || val === '') return;
            var el = document.getElementById(id);
            if (!el) return;
            if (overwrite || !el.value) el.value = val;
        };
        if (isSaneAppraiser(ex.appraiser)) {
            put('ueAppraiser', ex.appraiser);
        } else if (overwrite) {
            var appEl = document.getElementById('ueAppraiser');
            if (appEl) appEl.value = '';
        }
        if (ex.engineeringValue != null && ex.engineeringValue !== '') {
            var vel = document.getElementById('ueValue');
            if (vel && (overwrite || !vel.value)) vel.value = formatMoney(ex.engineeringValue);
        }
        if (ex.valuePerM2 != null && ex.valuePerM2 !== '' && isSaneM2(ex.valuePerM2, ex.engineeringValue)) {
            var mel = document.getElementById('ueM2');
            if (mel && (overwrite || !mel.value)) mel.value = formatMoney(ex.valuePerM2);
        } else if (overwrite) {
            var melClear = document.getElementById('ueM2');
            if (melClear && !isSaneM2(parseMoneyInput(melClear.value), ex.engineeringValue)) melClear.value = '';
        }
        var dateVal = ex.appraisalDate || '';
        if (dateVal) {
            put('ueDate', dateVal);
            onDateChange();
        }
        if (ex.garantiaCaixa) {
            put('ueGarantiaCaixa', ex.garantiaCaixa);
        } else if (overwrite) {
            var gel = document.getElementById('ueGarantiaCaixa');
            if (gel) gel.value = '';
        }
        var garantiaEl = document.getElementById('ueGarantiaCaixa');
        updateGarantiaHint(garantiaEl ? garantiaEl.value : ex.garantiaCaixa, ex.garantiaSnippet);
        var bits = [];
        if (dateVal) bits.push('data ' + formatDate(dateVal));
        if (ex.engineeringValue) bits.push(formatMoney(ex.engineeringValue));
        if (ex.valuePerM2 && isSaneM2(ex.valuePerM2, ex.engineeringValue)) bits.push(formatMoney(ex.valuePerM2) + '/m²');
        if (isSaneAppraiser(ex.appraiser)) bits.push(ex.appraiser);
        var g = garantiaLabel(ex.garantiaCaixa);
        if (g) bits.push(g);
        if (bits.length) {
            setParseHint('Laudo lido: ' + bits.join(' · ') + '. Confira e salve.', false);
            if (typeof showMessage === 'function') showMessage('Laudo lido. Confira os campos e salve.', 'success');
        } else {
            setParseHint('PDF enviado. Não foi possível ler os campos automaticamente. Preencha à mão.', false);
            if (typeof showMessage === 'function') showMessage('PDF enviado. Preencha os campos do laudo.', 'warning');
        }
    }

    function onLaudoFileSelected() {
        var fileEl = document.getElementById('ueReportFile');
        var file = fileEl && fileEl.files && fileEl.files[0];
        _pendingLaudo = null;
        _pendingLaudoPromise = null;
        if (!file) {
            setParseHint('', false);
            return;
        }
        var r = findRow(_openUnit);
        var names = existingDocNames(r, 'laudo');
        var replaceName = '';
        if (!_archiveCurrentOnSave && r && /^laudo\d*\.pdf$/i.test(r.reportName || '')) {
            replaceName = r.reportName;
        }
        setParseHint('Enviando e lendo o laudo…', true);
        if (typeof showMessage === 'function') showMessage('Enviando o PDF e lendo os dados do laudo…', 'info');
        var pid = selectedPropertyId();
        if (!pid) {
            setParseHint('Selecione o empreendimento antes de anexar o laudo.', false);
            return;
        }
        var seq = ++_laudoSeq;
        var uploadFn = typeof uploadAdminDossierFile === 'function' ? uploadAdminDossierFile : uploadViaSignedUrl;
        _pendingLaudoPromise = Promise.resolve(typeof getAdminIdToken === 'function' ? getAdminIdToken() : null)
            .then(function(token) {
                return uploadFn(file, 'engineering-reports', token, 'laudo', {
                    docKind: 'laudo',
                    existingNames: names,
                    propertyId: pid,
                    unitCode: _openUnit,
                    replaceName: replaceName,
                    archiveCurrent: !!_archiveCurrentOnSave
                });
            })
            .then(function(up) {
                if (seq !== _laudoSeq) return null;
                _pendingLaudo = { path: up.path || '', name: up.name || file.name, extracted: up.extracted || null };
                setCurrentReportLabel(_pendingLaudo.name, _pendingLaudo.path, false);
                applyExtractedLaudo(up.extracted, file.name, true);
                return _pendingLaudo;
            })
            .catch(function(err) {
                _pendingLaudo = null;
                setParseHint(err.message || 'Não foi possível enviar o PDF.', false);
                if (typeof showMessage === 'function') showMessage(err.message || 'Falha ao enviar o laudo.', 'error');
                throw err;
            });
        _pendingLaudoPromise.then(function(pending) {
            if (!pending || !pending.path) return;
            return saveUnitEngineering();
        });
    }

    function onRgiFileSelected() {
        var fileEl = document.getElementById('ueRgiFile');
        var file = fileEl && fileEl.files && fileEl.files[0];
        _pendingRgi = null;
        _pendingRgiPromise = null;
        if (!file) return;
        var r = findRow(_openUnit);
        if (typeof showMessage === 'function') showMessage('Enviando o RGI…', 'info');
        var pid = selectedPropertyId();
        if (!pid) {
            if (typeof showMessage === 'function') showMessage('Selecione o empreendimento antes de anexar o RGI.', 'warning');
            return;
        }
        var names = existingDocNames(r, 'rgi');
        if (!_archiveRgiOnSave && r && r.rgiName) {
            names = names.filter(function(n) { return n !== r.rgiName; });
        }
        var seq = ++_rgiSeq;
        var uploadFn = typeof uploadAdminDossierFile === 'function' ? uploadAdminDossierFile : uploadViaSignedUrl;
        _pendingRgiPromise = Promise.resolve(typeof getAdminIdToken === 'function' ? getAdminIdToken() : null)
            .then(function(token) {
                return uploadFn(file, 'property-dossiers/' + pid + '/unidades', token, '', {
                    docKind: 'rgi',
                    existingNames: names,
                    propertyId: pid,
                    unitCode: _openUnit
                });
            })
            .then(function(up) {
                if (seq !== _rgiSeq) return null;
                _pendingRgi = { path: up.path || '', name: up.name || file.name };
                if (typeof showMessage === 'function') showMessage('RGI enviado como ' + (_pendingRgi.name || 'rgi.pdf') + '.', 'success');
                return _pendingRgi;
            })
            .catch(function(err) {
                _pendingRgi = null;
                if (typeof showMessage === 'function') showMessage(err.message || 'Falha ao enviar o RGI.', 'error');
                throw err;
            });
        _pendingRgiPromise.then(function(pending) {
            if (!pending || !pending.path) return;
            return saveUnitEngineering();
        });
    }

    function onDateChange() {
        var el = document.getElementById('ueDate');
        var out = document.getElementById('ueExpiresAt');
        var hint = document.getElementById('ueExpiresHint');
        if (!el) return;
        var expires = el.value ? addMonthsYmd(el.value, 6) : '';
        if (out) out.value = expires;
        if (!hint) return;
        if (!el.value) {
            hint.textContent = 'Sem data = engenharia não aparece na vitrine (fica “A confirmar”).';
            return;
        }
        hint.textContent = 'Validade de 6 meses a partir da data da engenharia.';
    }

    function loadUnitEngineeringAdmin(preferredId) {
        bindUnitsUi();
        var sel = document.getElementById('ueProperty');
        if (sel && !sel.options.length) sel.innerHTML = propertyOptionsHtml();
        if (sel && preferredId != null && preferredId !== '') sel.value = String(preferredId);
        if (typeof loadEngineeringAlerts === 'function') loadEngineeringAlerts();
        var pid = selectedPropertyId();
        if (loadUnitEngineeringAdmin._pid && loadUnitEngineeringAdmin._pid !== pid) {
            _filterText = '';
            _statusFilter = '';
            _sortKey = 'unit';
            _sortDir = 'asc';
            var filterEl = document.getElementById('ueUnitFilter');
            if (filterEl) filterEl.value = '';
            var statusEl = document.getElementById('ueStatusFilter');
            if (statusEl) statusEl.value = '';
            closeUnitDrawer();
        }
        loadUnitEngineeringAdmin._pid = pid;
        var tbody = document.getElementById('ueTableBody');
        if (!pid) {
            _rows = [];
            _property = null;
            fillBuildingForm({});
            if (tbody) tbody.innerHTML = '<tr><td colspan="9">Escolha um empreendimento.</td></tr>';
            closeUnitDrawer();
            return Promise.resolve();
        }
        return loadSeed().then(function() {
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

    var _savingUnit = false;
    async function saveUnitEngineering(ev) {
        if (ev) ev.preventDefault();
        if (_savingUnit) return;
        _savingUnit = true;
        var pid = selectedPropertyId();
        var unit = document.getElementById('ueUnitCode') && document.getElementById('ueUnitCode').value;
        if (!pid || !unit) {
            _savingUnit = false;
            if (typeof showMessage === 'function') showMessage('Informe empreendimento e unidade.', 'warning');
            return;
        }
        var uploadFn = typeof uploadAdminDossierFile === 'function' ? uploadAdminDossierFile : uploadViaSignedUrl;
        var token = typeof getAdminIdToken === 'function' ? await getAdminIdToken() : null;
        var reportPath = '';
        var reportName = '';
        var fileEl = document.getElementById('ueReportFile');
        try {
            if (_pendingLaudoPromise) await _pendingLaudoPromise;
        } catch (laudoErr) {
            _savingUnit = false;
            if (typeof showMessage === 'function') showMessage(laudoErr.message || 'Falha ao enviar o laudo.', 'error');
            return;
        }
        if (_pendingLaudo && _pendingLaudo.path) {
            reportPath = _pendingLaudo.path;
            reportName = _pendingLaudo.name || '';
        } else if (fileEl && fileEl.files && fileEl.files[0] && typeof uploadFn === 'function') {
            var up = await uploadFn(fileEl.files[0], 'engineering-reports', token, 'laudo');
            reportPath = up.path || '';
            reportName = up.name || '';
            if (up.extracted) applyExtractedLaudo(up.extracted, fileEl.files[0].name, !!_archiveCurrentOnSave);
        }
        if (fileEl && fileEl.files && fileEl.files[0] && !reportPath) {
            _savingUnit = false;
            if (typeof showMessage === 'function') {
                showMessage('O PDF ainda não foi gravado. Escolha o arquivo de novo e espere a leitura terminar antes de salvar.', 'error');
            }
            return;
        }
        var rgiPath = '';
        var rgiName = '';
        var rgiEl = document.getElementById('ueRgiFile');
        try {
            if (_pendingRgiPromise) await _pendingRgiPromise;
        } catch (rgiErr) {
            _savingUnit = false;
            if (typeof showMessage === 'function') showMessage(rgiErr.message || 'Falha ao enviar o RGI.', 'error');
            return;
        }
        if (_pendingRgi && _pendingRgi.path) {
            rgiPath = _pendingRgi.path;
            rgiName = _pendingRgi.name || '';
        } else if (rgiEl && rgiEl.files && rgiEl.files[0] && typeof uploadFn === 'function') {
            var rgiUp = await uploadFn(rgiEl.files[0], 'property-dossiers/' + pid + '/unidades', token);
            rgiPath = rgiUp.path || '';
            rgiName = rgiUp.name || '';
        }
        var current = findRow(unit) || {};
        var payload = {
            action: 'upsert',
            propertyId: pid,
            unitCode: unit,
            matricula: document.getElementById('ueMatricula').value,
            inscricaoMunicipal: document.getElementById('ueInscricao').value,
            salePrice: parseMoneyInput(document.getElementById('ueSalePrice').value),
            appraiser: document.getElementById('ueAppraiser').value,
            engineeringValue: parseMoneyInput(document.getElementById('ueValue').value),
            historicalEngineering: current.historicalEngineering || '',
            valuePerM2: parseMoneyInput(document.getElementById('ueM2').value),
            appraisalDate: document.getElementById('ueDate').value,
            notes: document.getElementById('ueNotes').value,
            archiveDocuments: current.archiveDocuments || [],
            engineeringHistory: current.engineeringHistory || [],
            reportPath: reportPath,
            reportName: reportName,
            garantiaCaixa: document.getElementById('ueGarantiaCaixa') ? document.getElementById('ueGarantiaCaixa').value : '',
            archiveCurrent: !!_archiveCurrentOnSave,
            rgiPath: rgiPath,
            rgiName: rgiName,
            rgiDate: document.getElementById('ueRgiDate') ? document.getElementById('ueRgiDate').value : '',
            archiveCurrentRgi: !!_archiveRgiOnSave
        };
        var savedName = reportName || rgiName || '';
        adminPostJson('/adminUnitEngineering', payload).then(function() {
            var msg = savedName
                ? 'Ficha gravada com ' + savedName + '.'
                : 'Ficha da unidade gravada. Preço e engenharia vigente passam a alimentar a vitrine.';
            if (typeof showMessage === 'function') showMessage(msg, 'success');
            if (typeof invalidateEngineeringCache === 'function') invalidateEngineeringCache();
            if (fileEl) fileEl.value = '';
            if (rgiEl) rgiEl.value = '';
            _pendingLaudo = null;
            _pendingRgi = null;
            _pendingLaudoPromise = null;
            _pendingRgiPromise = null;
            _archiveCurrentOnSave = false;
            _archiveRgiOnSave = false;
            return loadUnitEngineeringAdmin().then(function() {
                openUnitDrawer(unit);
            });
        }).catch(function(err) {
            if (typeof showMessage === 'function') showMessage(err.message || 'Erro ao gravar.', 'error');
        }).then(function() {
            _savingUnit = false;
        });
    }

    async function openEngineeringReport() {
        var unit = document.getElementById('ueUnitCode') && document.getElementById('ueUnitCode').value;
        var r = findRow(unit);
        var path = r && r.reportPath;
        if (!path && r && r.archiveDocuments) {
            (r.archiveDocuments || []).some(function(d) {
                if (d.kind === 'laudo' && d.storagePath) { path = d.storagePath; return true; }
                return false;
            });
        }
        if (!path) {
            if (typeof showMessage === 'function') showMessage('Nenhum laudo vinculado a esta ficha.', 'warning');
            return;
        }
        openStoredDocument(path);
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
        window.startNewUnitEngineering = startNewUnitEngineering;
        window.startNewUnitRgi = startNewUnitRgi;
        window.openCurrentRgi = openCurrentRgi;
        window.onEngineeringDateChange = onDateChange;
        window.openUnitDossier = openUnitDossier;
        window.fillUnitEngineeringForm = fillForm;
        window.closeUnitDossierDrawer = closeUnitDrawer;
        window.formatUeMoneyField = function(id) {
            var el = document.getElementById(id);
            if (!el) return;
            var n = parseMoneyInput(el.value);
            if (n !== '') el.value = formatMoney(n);
        };
    }
})();
