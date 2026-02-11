// Manual do Cliente - carregamento e exibição

let manualDataCache = null;

async function loadManualData() {
    if (manualDataCache) return manualDataCache;
    const response = await fetch('data/manual-cliente.json');
    if (!response.ok) {
        throw new Error('Erro ao carregar manual');
    }
    manualDataCache = await response.json();
    return manualDataCache;
}

function ensureManualModal() {
    let modal = document.getElementById('manualModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'manualModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content manual-modal">
            <span class="close" onclick="closeManualModal()">&times;</span>
            <div class="manual-content" id="manualContent">
                <p>Carregando manual...</p>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

function closeManualModal() {
    const modal = document.getElementById('manualModal');
    if (modal) modal.style.display = 'none';
}

async function showClientManual() {
    const modal = ensureManualModal();
    const content = document.getElementById('manualContent');
    modal.style.display = 'block';
    content.innerHTML = '<p>Carregando manual...</p>';

    try {
        const data = await loadManualData();
        content.innerHTML = renderManual(data);
    } catch (error) {
        console.error(error);
        content.innerHTML = '<p>Não foi possível carregar o manual no momento.</p>';
    }
}

function renderManual(data) {
    const sections = (data.secoes || []).map((section, index) => {
        let body = '';
        if (section.conteudo) {
            body += `<p>${section.conteudo}</p>`;
        }
        if (Array.isArray(section.itens)) {
            body += section.itens.map(group => `
                <div class="manual-group">
                    <h4>${group.categoria || ''}</h4>
                    ${(group.itens || []).map(item => `
                        <div class="manual-item">
                            <strong>${item.descricao || ''}</strong>
                            ${item.prazo ? `<span class="manual-badge">${item.prazo}</span>` : ''}
                            ${item.observacoes ? `<p>${item.observacoes}</p>` : ''}
                        </div>
                    `).join('')}
                </div>
            `).join('');
        }

        return `
            <section id="section-${section.id || index}" class="manual-section">
                <h3>${section.titulo || ''}</h3>
                ${body}
            </section>
        `;
    }).join('');

    return `
        <div class="manual-header">
            <h2>${data.titulo || 'Manual do Cliente'}</h2>
            <p>${data.subtitulo || ''}</p>
        </div>
        ${sections}
    `;
}



