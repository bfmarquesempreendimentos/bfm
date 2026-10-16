/**
 * Relatório "Reservas por corretor": planilha Excel individual + envio WhatsApp + importação com aprovação.
 */
(function() {
    var WA_TEXT = 'Olá! Segue a relação das suas reservas. Por favor, atualize os campos amarelos com a situação de cada venda, pendências e previsão, e me devolva por aqui para atualizarmos o sistema.';
    var INSTRUCTION = 'Preencher os campos amarelos e devolver a planilha pelo WhatsApp.';
    var NAVY = 'FF0B1F3A';
    var YELLOW = 'FFFFF2CC';
    var HEADER_FILL = 'FF1F4E79';
    var _groups = [];
    var _linked = [];
    var _excludedCount = 0;
    var _logoCache = null;
    var _pendingImport = [];

    function esc(t) {
        if (typeof escapeHtml === 'function') return escapeHtml(t);
        return String(t == null ? '' : t)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function selectedStatusFilter() {
        var el = document.getElementById('brrStatusFilter');
        return el && el.value ? el.value : 'active';
    }

    function matchesReportFilter(r) {
        var st = String((r && r.status) || '').toLowerCase();
        if (st === 'cancelled' || st === 'rejected' || st === 'expired') return false;
        var filter = selectedStatusFilter();
        if (filter === 'active') return st === 'active';
        if (filter === 'pending') return st === 'pending';
        if (filter === 'signed') return st === 'signed';
        if (filter === 'converted') return st === 'converted';
        if (filter === 'active_pending') return st === 'active' || st === 'pending';
        if (filter === 'linked') {
            return st === 'pending' || st === 'active' || st === 'signed' || st === 'converted' || !!(r && r.renewalDue);
        }
        return st === 'active';
    }

    function brokerKey(r) {
        var email = String((r && r.brokerEmail) || '').trim().toLowerCase();
        if (email) return 'e:' + email;
        var id = String((r && r.brokerId) || '').trim();
        if (id) return 'i:' + id;
        var name = String((r && r.brokerName) || '').trim();
        if (name && name !== 'A definir' && name !== 'N/A') return 'n:' + name.toLowerCase();
        return 'unassigned';
    }

    function brokerDisplayName(r) {
        var name = String((r && r.brokerName) || '').trim();
        if (name && name !== 'A definir' && name !== 'N/A') return name;
        var email = String((r && r.brokerEmail) || '').trim();
        if (email) return email;
        return 'Sem responsável';
    }

    function normAlnum(s) {
        return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    function lookupMapValue(map, unitCode) {
        if (!map || !unitCode) return '';
        if (map[unitCode] != null && map[unitCode] !== '') return String(map[unitCode]);
        var target = normAlnum(unitCode);
        if (!target) return '';
        var keys = Object.keys(map);
        var i;
        var nk;
        for (i = 0; i < keys.length; i++) {
            nk = normAlnum(keys[i]);
            if (nk === target && map[keys[i]] != null && map[keys[i]] !== '') {
                return String(map[keys[i]]);
            }
        }
        var best = '';
        var bestLen = 0;
        for (i = 0; i < keys.length; i++) {
            nk = normAlnum(keys[i]);
            if (!nk || map[keys[i]] == null || map[keys[i]] === '') continue;
            if (target.indexOf(nk) === 0 && nk.length > bestLen) {
                bestLen = nk.length;
                best = String(map[keys[i]]);
            }
        }
        if (best) return best;
        return '';
    }

    function findProperty(id) {
        if (id == null || id === '') return null;
        if (typeof getPropertyById === 'function') {
            var found = getPropertyById(id) || getPropertyById(Number(id)) || getPropertyById(String(id));
            if (found) return found;
        }
        if (typeof properties !== 'undefined' && properties && properties.length) {
            var i;
            for (i = 0; i < properties.length; i++) {
                if (String(properties[i].id) === String(id)) return properties[i];
            }
        }
        return null;
    }

    function propertyLabel(r) {
        var p = findProperty(r.propertyId);
        var raw = (typeof getPropertyUnitsRaw === 'function') ? getPropertyUnitsRaw(r.propertyId) : null;
        var name = String((p && (p.title || p.name)) || (raw && raw.name) || (r && r.propertyTitle) || '').trim();
        var addr = String((p && (p.address || p.location)) || '').trim();
        if (name && addr) {
            var nLow = name.toLowerCase();
            var street = addr.split(',')[0];
            if (nLow.indexOf(addr.toLowerCase()) >= 0) return name;
            if (street && nLow.indexOf(street.toLowerCase()) >= 0) return name;
            return name + ' – ' + addr;
        }
        return name || addr || 'Empreendimento';
    }

    function lookupMatricula(r) {
        var raw = (typeof getPropertyUnitsRaw === 'function') ? getPropertyUnitsRaw(r.propertyId) : null;
        if (!raw || !raw.matriculas) return '';
        return lookupMapValue(raw.matriculas, r.unitCode);
    }

    function lookupEngineeringValue(r) {
        if (typeof lookupValidEngineeringValue === 'function') {
            var valid = lookupValidEngineeringValue(r.propertyId, r.unitCode);
            if (valid) return valid;
        }
        return '';
    }

    function parseBrl(str) {
        if (str == null || str === '') return null;
        if (typeof str === 'number' && !isNaN(str)) return str;
        var s = String(str).replace(/[^\d,.-]/g, '');
        if (!s) return null;
        var lastComma = s.lastIndexOf(',');
        var lastDot = s.lastIndexOf('.');
        if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
        else s = s.replace(/,/g, '');
        var n = parseFloat(s);
        return isNaN(n) ? null : n;
    }

    function naturalUnitRank(code) {
        var s = String(code || '').toLowerCase().trim();
        if (/casa\s*base|^base$/.test(s)) return [0, 0, s];
        var casa = s.match(/casa\s*0*(\d+)/);
        if (casa) return [1, parseInt(casa[1], 10), s];
        var apt = s.match(/(?:apto|ap(?:artamento)?)\s*(\d{3,4})\b/);
        if (apt) return [2, parseInt(apt[1], 10), s];
        var onlyNum = s.match(/\b(\d{3,4})\b/);
        if (onlyNum) return [2, parseInt(onlyNum[1], 10), s];
        var nums = s.match(/\d+/g);
        var n = nums ? parseInt(nums[0], 10) : 99999;
        return [3, n, s];
    }

    function cmpUnit(a, b) {
        var ra = naturalUnitRank(a);
        var rb = naturalUnitRank(b);
        if (ra[0] !== rb[0]) return ra[0] - rb[0];
        if (ra[1] !== rb[1]) return ra[1] - rb[1];
        return String(ra[2]).localeCompare(String(rb[2]), 'pt-BR', { numeric: true, sensitivity: 'base' });
    }

    function statusSistema(r) {
        if (typeof reservationDisplayStatus === 'function') return reservationDisplayStatus(r);
        if (r && r.renewalDue && r.status === 'active') return 'Aguardando decisão';
        if (typeof reservationStatusLabel === 'function') return reservationStatusLabel(r.status);
        return r.status || '';
    }

    function clientName(r) {
        var c = (r && (r.client || r.clientInfo)) || {};
        return c.name || '';
    }

    function slugName(name) {
        var s = String(name || 'corretor').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        s = s.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
        return s.slice(0, 40) || 'corretor';
    }

    function todayStamp() {
        var d = new Date();
        function pad(n) { return (n < 10 ? '0' : '') + n; }
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    function buildGroups(reservations, brokers) {
        var linked = (reservations || []).filter(matchesReportFilter);
        var byId = {};
        var unique = [];
        linked.forEach(function(r) {
            var id = String(r.id || '');
            if (!id || byId[id]) return;
            byId[id] = true;
            unique.push(r);
        });
        var map = {};
        var order = [];
        unique.forEach(function(r) {
            var k = brokerKey(r);
            if (!map[k]) {
                map[k] = {
                    key: k,
                    name: brokerDisplayName(r),
                    email: String(r.brokerEmail || '').trim().toLowerCase(),
                    phone: String(r.brokerPhone || '').trim(),
                    reservations: []
                };
                order.push(k);
            }
            map[k].reservations.push(r);
        });
        (brokers || []).forEach(function(b) {
            var email = String(b.email || '').trim().toLowerCase();
            if (!email) return;
            var k = 'e:' + email;
            if (map[k]) {
                if (b.name) map[k].name = b.name;
                if (b.phone) map[k].phone = b.phone;
            }
        });
        order.sort(function(a, b) {
            if (a === 'unassigned') return 1;
            if (b === 'unassigned') return -1;
            return map[a].name.localeCompare(map[b].name, 'pt-BR');
        });
        var groups = order.map(function(k) {
            var g = map[k];
            g.reservations.sort(function(a, b) {
                var pa = propertyLabel(a);
                var pb = propertyLabel(b);
                var c = pa.localeCompare(pb, 'pt-BR');
                if (c) return c;
                return cmpUnit(a.unitCode, b.unitCode);
            });
            return g;
        });
        var counted = 0;
        groups.forEach(function(g) { counted += g.reservations.length; });
        if (counted !== unique.length) {
            console.error('Reservas por corretor: contagem divergente', counted, unique.length);
        }
        var excluded = 0;
        (reservations || []).forEach(function(r) {
            if (!matchesReportFilter(r)) excluded++;
        });
        return { groups: groups, linked: unique, excluded: excluded };
    }

    function rowPayload(r) {
        var report = (r && r.brokerReport) || {};
        var engVal = report.engineeringValue != null && report.engineeringValue !== ''
            ? report.engineeringValue
            : lookupEngineeringValue(r);
        var engNum = parseBrl(engVal);
        return {
            property: propertyLabel(r),
            unit: r.unitCode || '',
            matricula: lookupMatricula(r),
            engineeringValid: report.engineeringValid || 'A confirmar',
            engineeringValue: engNum,
            engineeringValueRaw: engVal,
            clientName: clientName(r),
            systemStatus: statusSistema(r),
            saleStatus: report.saleStatus || '',
            pendingNext: report.pendingNext || '',
            forecast: report.forecast || '',
            reservationId: String(r.id || ''),
            propertyId: r.propertyId != null ? String(r.propertyId) : ''
        };
    }

    function loadLogoBytes() {
        if (_logoCache) return Promise.resolve(_logoCache);
        return fetch('assets/images/logo-bf-marques.png', { cache: 'force-cache' })
            .then(function(r) { return r.ok ? r.blob() : null; })
            .then(function(blob) {
                if (!blob) return null;
                return new Promise(function(resolve) {
                    var img = new Image();
                    var url = URL.createObjectURL(blob);
                    img.onload = function() {
                        var canvas = document.createElement('canvas');
                        var maxW = 220;
                        var w = img.width;
                        var h = img.height;
                        if (w > maxW) {
                            h = Math.round(h * (maxW / w));
                            w = maxW;
                        }
                        canvas.width = w;
                        canvas.height = h;
                        var ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, w, h);
                        canvas.toBlob(function(out) {
                            URL.revokeObjectURL(url);
                            if (!out) { resolve(null); return; }
                            out.arrayBuffer().then(function(buf) {
                                _logoCache = { buffer: buf, width: w, height: h };
                                resolve(_logoCache);
                            });
                        }, 'image/png');
                    };
                    img.onerror = function() {
                        URL.revokeObjectURL(url);
                        resolve(null);
                    };
                    img.src = url;
                });
            })
            .catch(function() { return null; });
    }

    function ensureExcelJS() {
        if (typeof ExcelJS !== 'undefined') return Promise.resolve();
        return new Promise(function(resolve, reject) {
            var s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
            s.onload = function() { resolve(); };
            s.onerror = function() { reject(new Error('Não foi possível carregar a biblioteca Excel.')); };
            document.head.appendChild(s);
        });
    }

    function styleHeader(cell) {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = {
            top: { style: 'thin', color: { argb: NAVY } },
            left: { style: 'thin', color: { argb: NAVY } },
            bottom: { style: 'thin', color: { argb: NAVY } },
            right: { style: 'thin', color: { argb: NAVY } }
        };
    }

    function styleCell(cell, yellow) {
        cell.font = { name: 'Calibri', size: 11 };
        cell.alignment = { vertical: 'middle', wrapText: true };
        cell.border = {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
        };
        if (yellow) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
        }
    }

    function buildWorkbook(group, logo) {
        var wb = new ExcelJS.Workbook();
        wb.creator = 'B F Marques';
        var sheet = wb.addWorksheet('Reservas', { views: [{ showGridLines: false }] });
        sheet.columns = [
            { key: 'property', width: 38 },
            { key: 'unit', width: 16 },
            { key: 'matricula', width: 14 },
            { key: 'engineeringValid', width: 18 },
            { key: 'engineeringValue', width: 18 },
            { key: 'clientName', width: 22 },
            { key: 'systemStatus', width: 20 },
            { key: 'saleStatus', width: 22 },
            { key: 'pendingNext', width: 24 },
            { key: 'forecast', width: 14 },
            { key: 'reservationId', width: 12, hidden: true },
            { key: 'propertyId', width: 10, hidden: true }
        ];
        if (logo && logo.buffer) {
            var imgId = wb.addImage({
                buffer: logo.buffer instanceof ArrayBuffer ? new Uint8Array(logo.buffer) : logo.buffer,
                extension: 'png'
            });
            sheet.addImage(imgId, {
                tl: { col: 0, row: 0 },
                ext: { width: Math.min(logo.width || 200, 220), height: Math.min(logo.height || 54, 64) }
            });
            sheet.getRow(1).height = 48;
        }
        sheet.mergeCells('A2:J2');
        var nameCell = sheet.getCell('A2');
        nameCell.value = group.name;
        nameCell.font = { bold: true, size: 16, name: 'Calibri', color: { argb: NAVY } };
        sheet.mergeCells('A3:J3');
        var dateCell = sheet.getCell('A3');
        var now = new Date();
        dateCell.value = 'Exportado em ' + now.toLocaleDateString('pt-BR');
        dateCell.font = { size: 10, name: 'Calibri', color: { argb: 'FF64748B' } };
        sheet.mergeCells('A4:J4');
        var inst = sheet.getCell('A4');
        inst.value = INSTRUCTION;
        inst.font = { italic: true, size: 11, name: 'Calibri', color: { argb: 'FF334155' } };

        var headers = [
            'Empreendimento / endereço', 'Unidade', 'Matrícula', 'Engenharia válida?',
            'Valor da engenharia (R$)', 'Nome na reserva', 'Situação no sistema',
            'Situação atual da venda', 'Pendência / próximo passo', 'Previsão',
            'reservationId', 'propertyId'
        ];
        var headerRow = sheet.getRow(6);
        headerRow.height = 32;
        headers.forEach(function(h, i) {
            var cell = headerRow.getCell(i + 1);
            cell.value = h;
            styleHeader(cell);
        });
        sheet.getColumn(11).hidden = true;
        sheet.getColumn(12).hidden = true;

        var yellowCols = { 4: true, 5: true, 8: true, 9: true, 10: true };
        var excelRowNum = 7;
        var lastProperty = null;
        group.reservations.forEach(function(r) {
            var p = rowPayload(r);
            if (lastProperty && lastProperty !== p.property) {
                excelRowNum += 1;
            }
            lastProperty = p.property;
            var excelRow = sheet.getRow(excelRowNum);
            excelRow.height = 28;
            var values = [
                p.property, p.unit, p.matricula, p.engineeringValid,
                p.engineeringValue, p.clientName, p.systemStatus,
                p.saleStatus, p.pendingNext, p.forecast,
                p.reservationId, p.propertyId
            ];
            values.forEach(function(val, i) {
                var cell = excelRow.getCell(i + 1);
                if (i === 4 && val != null && val !== '') {
                    cell.value = Number(val);
                    cell.numFmt = '"R$" #,##0.00';
                } else {
                    cell.value = val == null ? '' : val;
                }
                styleCell(cell, !!yellowCols[i + 1]);
            });
            excelRowNum += 1;
        });
        var lastDataRow = Math.max(6, excelRowNum - 1);
        sheet.autoFilter = {
            from: { row: 6, column: 1 },
            to: { row: lastDataRow, column: 10 }
        };
        sheet.views = [{ state: 'frozen', ySplit: 6, showGridLines: false }];
        sheet.pageSetup = {
            orientation: 'landscape',
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 0,
            paperSize: 9
        };
        return wb;
    }

    function downloadBlob(blob, filename) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.style.visibility = 'hidden';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    function filenameFor(group) {
        return 'Reservas_' + slugName(group.name) + '_' + todayStamp() + '.xlsx';
    }

    function selectedGroup() {
        var el = document.querySelector('input[name="brrPick"]:checked');
        if (!el) return null;
        var key = el.value;
        var i;
        for (i = 0; i < _groups.length; i++) {
            if (_groups[i].key === key) return _groups[i];
        }
        return null;
    }

    function groupsForMode(mode) {
        if (mode === 'all') return _groups.filter(function(g) { return g.reservations.length; });
        var g = selectedGroup();
        return g ? [g] : [];
    }

    async function workbookBlob(group, logo) {
        var wb = buildWorkbook(group, logo);
        var buf = await wb.xlsx.writeBuffer();
        return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }

    function blobToBase64(blob) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function() {
                var s = String(reader.result || '');
                var i = s.indexOf(',');
                resolve(i >= 0 ? s.slice(i + 1) : s);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    function renderTable() {
        var tbody = document.getElementById('brrTableBody');
        var sum = document.getElementById('brrSummary');
        var msg = document.getElementById('brrWaMessage');
        if (msg) msg.value = WA_TEXT;
        if (!tbody) return;
        if (!_groups.length) {
            tbody.innerHTML = '<tr><td colspan="5">Nenhuma reserva vinculada a responsáveis no momento.</td></tr>';
            if (sum) sum.textContent = '0 reservas vinculadas.';
            return;
        }
        if (sum) {
            var omitted = (_excludedCount || 0);
            var labels = {
                active: 'ativas',
                pending: 'pendentes',
                signed: 'assinadas',
                converted: 'convertidas em venda',
                active_pending: 'ativas e pendentes',
                linked: 'vinculadas (sem canceladas)'
            };
            var filtro = labels[selectedStatusFilter()] || 'do filtro';
            sum.textContent = _linked.length + ' reserva(s) ' + filtro + ' em ' + _groups.length +
                ' responsável(is). Cada arquivo contém só as reservas daquele corretor neste filtro.' +
                (omitted ? ' ' + omitted + ' reserva(s) ficaram de fora deste filtro.' : '');
        }
        tbody.innerHTML = _groups.map(function(g, idx) {
            var phone = g.phone || '—';
            return '<tr>' +
                '<td><input type="radio" name="brrPick" value="' + esc(g.key) + '"' + (idx === 0 ? ' checked' : '') + '></td>' +
                '<td>' + esc(g.name) + (g.email ? '<br><small>' + esc(g.email) + '</small>' : '') + '</td>' +
                '<td>' + g.reservations.length + '</td>' +
                '<td>' + esc(phone) + '</td>' +
                '<td><button type="button" class="btn btn-secondary btn-sm" data-brr-one="' + esc(g.key) + '">Gerar Excel</button></td>' +
                '</tr>';
        }).join('');
        tbody.querySelectorAll('[data-brr-one]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var radio = tbody.querySelector('input[value="' + btn.getAttribute('data-brr-one') + '"]');
                if (radio) radio.checked = true;
                exportBrokerReservationSheets('selected');
            });
        });
    }

    function loadBrokerReservationsReport() {
        var tbody = document.getElementById('brrTableBody');
        if (!tbody) return;
        if (typeof adminPostJson !== 'function') {
            tbody.innerHTML = '<tr><td colspan="5">Faça login no painel.</td></tr>';
            return;
        }
        tbody.innerHTML = '<tr><td colspan="5">Carregando reservas...</td></tr>';
        Promise.all([
            adminPostJson('/adminReservationsMutate', { action: 'list' }),
            typeof getBrokersFromAPI === 'function' ? getBrokersFromAPI(false) : Promise.resolve([])
        ]).then(function(results) {
            var rows = (results[0] && results[0].reservations) ? results[0].reservations : [];
            var brokers = Array.isArray(results[1]) ? results[1] : [];
            var built = buildGroups(rows, brokers);
            _groups = built.groups;
            _linked = built.linked;
            _excludedCount = built.excluded || 0;
            renderTable();
        }).catch(function(err) {
            tbody.innerHTML = '<tr><td colspan="5">' + esc(err.message || 'Erro ao carregar.') + '</td></tr>';
        });
    }

    async function exportBrokerReservationSheets(mode) {
        var list = groupsForMode(mode);
        if (!list.length) {
            if (typeof showMessage === 'function') showMessage('Selecione um responsável ou atualize a lista.', 'warning');
            return;
        }
        try {
            await ensureExcelJS();
            var logo = await loadLogoBytes();
            var i;
            for (i = 0; i < list.length; i++) {
                var g = list[i];
                if (g.reservations.length !== g.reservations.filter(function(r, ix, arr) {
                    return arr.findIndex(function(x) { return String(x.id) === String(r.id); }) === ix;
                }).length) {
                    throw new Error('Reservas duplicadas detectadas para ' + g.name);
                }
                var blob = await workbookBlob(g, logo);
                downloadBlob(blob, filenameFor(g));
                if (list.length > 1) await new Promise(function(ok) { setTimeout(ok, 280); });
            }
            if (typeof showMessage === 'function') {
                showMessage(list.length === 1
                    ? ('Planilha de ' + list[0].name + ' com ' + list[0].reservations.length + ' reserva(s).')
                    : (list.length + ' planilhas geradas.'), 'success');
            }
        } catch (err) {
            if (typeof showMessage === 'function') showMessage(err.message || 'Erro ao gerar Excel.', 'error');
        }
    }

    function copyBrokerReservationWaMessage() {
        var el = document.getElementById('brrWaMessage');
        var text = (el && el.value) || WA_TEXT;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function() {
                if (typeof showMessage === 'function') showMessage('Mensagem copiada.', 'success');
            });
            return;
        }
        if (el) { el.select(); document.execCommand('copy'); }
        if (typeof showMessage === 'function') showMessage('Mensagem copiada.', 'success');
    }

    function openBrokerReservationWaManual() {
        var g = selectedGroup();
        copyBrokerReservationWaMessage();
        if (!g) {
            if (typeof showMessage === 'function') showMessage('Selecione o corretor, gere o Excel e envie o arquivo na conversa.', 'info');
            return;
        }
        var digits = String(g.phone || '').replace(/\D/g, '');
        if (digits.length === 10 || digits.length === 11) digits = '55' + digits;
        var msgEl = document.getElementById('brrWaMessage');
        var waText = (msgEl && msgEl.value) || WA_TEXT;
        var url = digits.length >= 12
            ? ('https://wa.me/' + digits + '?text=' + encodeURIComponent(waText))
            : ('https://wa.me/?text=' + encodeURIComponent(waText));
        window.open(url, '_blank', 'noopener');
        exportBrokerReservationSheets('selected');
    }

    function chosenChannel() {
        var el = document.querySelector('input[name="brrWaFrom"]:checked');
        return el ? el.value : 'campaign';
    }

    async function sendBrokerReservationSheetsWhatsApp(mode) {
        var list = groupsForMode(mode);
        if (!list.length) {
            if (typeof showMessage === 'function') showMessage('Selecione um responsável.', 'warning');
            return;
        }
        var status = document.getElementById('brrSendStatus');
        try {
            await ensureExcelJS();
            var logo = await loadLogoBytes();
            var sent = 0;
            var failed = [];
            var i;
            for (i = 0; i < list.length; i++) {
                var g = list[i];
                if (!g.phone) {
                    failed.push(g.name + ' (sem WhatsApp)');
                    continue;
                }
                if (status) status.textContent = 'Enviando ' + (i + 1) + '/' + list.length + ': ' + g.name + '…';
                try {
                    var blob = await workbookBlob(g, logo);
                    var b64 = await blobToBase64(blob);
                    var res = await adminPostJson('/adminBrokerReservationReportSend', {
                        channel: chosenChannel(),
                        phone: g.phone,
                        filename: filenameFor(g),
                        caption: WA_TEXT,
                        xlsxBase64: b64,
                        brokerName: g.name,
                        reservationCount: g.reservations.length
                    });
                    if (res && res.ok) {
                        sent++;
                        if (res.fallbackToCampaign) {
                            failed.push(g.name + ' (enviado pelo número da campanha: pessoal não encontrado na conta WhatsApp)');
                        }
                    } else failed.push(g.name + ': ' + ((res && res.error) || 'falhou'));
                } catch (sendErr) {
                    failed.push(g.name + ': ' + (sendErr.message || 'falhou'));
                }
            }
            var msg = sent + ' envio(s) ok.';
            if (failed.length) msg += ' Falhas: ' + failed.join('; ');
            if (status) status.textContent = msg;
            if (typeof showMessage === 'function') showMessage(msg, failed.length ? 'warning' : 'success');
        } catch (err) {
            if (status) status.textContent = err.message || 'Erro no envio.';
            if (typeof showMessage === 'function') showMessage(err.message || 'Erro no envio.', 'error');
        }
    }

    function colIndexByHeader(headers, wanted) {
        var w = String(wanted).toLowerCase();
        var i;
        for (i = 0; i < headers.length; i++) {
            if (String(headers[i] || '').toLowerCase().indexOf(w) >= 0) return i;
        }
        return -1;
    }

    async function previewBrokerReservationImport(event) {
        var file = event.target && event.target.files && event.target.files[0];
        var box = document.getElementById('brrImportPreview');
        if (!file || !box) return;
        box.innerHTML = '<p>Lendo planilha…</p>';
        try {
            await ensureExcelJS();
            var buf = await file.arrayBuffer();
            var wb = new ExcelJS.Workbook();
            await wb.xlsx.load(buf);
            var sheet = wb.worksheets[0];
            var headerRowNum = 6;
            var headers = [];
            sheet.getRow(headerRowNum).eachCell(function(cell, col) {
                headers[col - 1] = String(cell.value || '');
            });
            if (headers.join(' ').toLowerCase().indexOf('empreendimento') < 0) {
                sheet.eachRow(function(row, num) {
                    var line = [];
                    row.eachCell(function(c) { line.push(String(c.value || '')); });
                    if (line.join(' ').toLowerCase().indexOf('empreendimento') >= 0) headerRowNum = num;
                });
                headers = [];
                sheet.getRow(headerRowNum).eachCell(function(cell, col) {
                    headers[col - 1] = String(cell.value || '');
                });
            }
            var iId = colIndexByHeader(headers, 'reservationid');
            if (iId < 0) iId = 10;
            var iEngV = colIndexByHeader(headers, 'engenharia válida');
            var iEngVal = colIndexByHeader(headers, 'valor');
            var iSale = colIndexByHeader(headers, 'situação atual');
            var iPend = colIndexByHeader(headers, 'pendência');
            var iPrev = colIndexByHeader(headers, 'previsão');
            var iUnit = colIndexByHeader(headers, 'unidade');
            var iProp = colIndexByHeader(headers, 'empreendimento');
            var items = [];
            sheet.eachRow(function(row, num) {
                if (num <= headerRowNum) return;
                var id = row.getCell(iId + 1).value;
                if (!id) return;
                items.push({
                    id: String(id),
                    unit: String(row.getCell(iUnit + 1).value || ''),
                    property: String(row.getCell(iProp + 1).value || ''),
                    engineeringValid: String((row.getCell(iEngV + 1).value) || ''),
                    engineeringValue: row.getCell(iEngVal + 1).value,
                    saleStatus: String((row.getCell(iSale + 1).value) || ''),
                    pendingNext: String((row.getCell(iPend + 1).value) || ''),
                    forecast: String((row.getCell(iPrev + 1).value) || '')
                });
            });
            _pendingImport = items;
            if (!items.length) {
                box.innerHTML = '<p>Nenhuma linha com identificador de reserva. Use o arquivo gerado por este relatório.</p>';
                return;
            }
            var rowsHtml = items.map(function(it) {
                return '<tr><td>' + esc(it.property) + '</td><td>' + esc(it.unit) + '</td><td>' +
                    esc(it.engineeringValid) + '</td><td>' + esc(it.engineeringValue) + '</td><td>' +
                    esc(it.saleStatus) + '</td><td>' + esc(it.pendingNext) + '</td><td>' + esc(it.forecast) + '</td></tr>';
            }).join('');
            box.innerHTML = '<p><strong>' + items.length + ' linha(s)</strong> prontas para conferência. A situação do sistema não será alterada.</p>' +
                '<div class="admin-table-container"><table class="admin-table"><thead><tr>' +
                '<th>Empreendimento</th><th>Unidade</th><th>Eng. válida?</th><th>Valor</th>' +
                '<th>Situação da venda</th><th>Pendência</th><th>Previsão</th></tr></thead><tbody>' +
                rowsHtml + '</tbody></table></div>' +
                '<button type="button" class="btn btn-primary" onclick="approveBrokerReservationImport()">Aprovar e gravar no sistema</button>';
        } catch (err) {
            box.innerHTML = '<p>' + esc(err.message || 'Erro ao ler o arquivo.') + '</p>';
        }
    }

    function approveBrokerReservationImport() {
        if (!_pendingImport.length) {
            if (typeof showMessage === 'function') showMessage('Nada para gravar.', 'warning');
            return;
        }
        adminPostJson('/adminReservationsMutate', {
            action: 'apply_broker_report',
            items: _pendingImport
        }).then(function(res) {
            var n = (res && res.updated) != null ? res.updated : 0;
            if (typeof showMessage === 'function') showMessage(n + ' reserva(s) atualizada(s) com o retorno do corretor.', 'success');
            _pendingImport = [];
            loadBrokerReservationsReport();
        }).catch(function(err) {
            if (typeof showMessage === 'function') showMessage(err.message || 'Erro ao gravar.', 'error');
        });
    }

    if (typeof window !== 'undefined') {
        window.loadBrokerReservationsReport = loadBrokerReservationsReport;
        window.exportBrokerReservationSheets = exportBrokerReservationSheets;
        window.copyBrokerReservationWaMessage = copyBrokerReservationWaMessage;
        window.openBrokerReservationWaManual = openBrokerReservationWaManual;
        window.sendBrokerReservationSheetsWhatsApp = sendBrokerReservationSheetsWhatsApp;
        window.previewBrokerReservationImport = previewBrokerReservationImport;
        window.approveBrokerReservationImport = approveBrokerReservationImport;
        window.BRR_WA_TEXT = WA_TEXT;
    }
})();
