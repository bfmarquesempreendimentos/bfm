// Sistema de Newsletter Trimestral

let newsletterData = null;

// Carregar newsletter
async function loadNewsletter() {
    try {
        const response = await fetch('data/newsletter-trimestral.json');
        newsletterData = await response.json();
        return newsletterData;
    } catch (error) {
        console.error('Erro ao carregar newsletter:', error);
        return null;
    }
}

// Enviar newsletter para todos os clientes
async function sendNewsletterToAllClients() {
    if (!newsletterData) {
        await loadNewsletter();
    }
    
    if (!newsletterData) {
        showMessage('Erro ao carregar newsletter.', 'error');
        return;
    }
    
    const clients = JSON.parse(localStorage.getItem('clients') || '[]');
    let sentCount = 0;
    let errorCount = 0;
    
    for (const client of clients) {
        if (client.email) {
            try {
                if (typeof sendNewsletter !== 'undefined') {
                    await sendNewsletter(client.email, client.name, newsletterData);
                    sentCount++;
                }
            } catch (error) {
                console.error(`Erro ao enviar para ${client.email}:`, error);
                errorCount++;
            }
        }
    }
    
    showMessage(`Newsletter enviada para ${sentCount} clientes. ${errorCount > 0 ? `${errorCount} erros.` : ''}`, 
                errorCount > 0 ? 'warning' : 'success');
}

// Exibir newsletter na área do cliente
function showClientNewsletter() {
    if (!newsletterData) {
        loadNewsletter().then(data => {
            if (data) {
                newsletterData = data;
                displayNewsletter();
            }
        });
    } else {
        displayNewsletter();
    }
}

// Exibir newsletter
function displayNewsletter() {
    const modal = document.createElement('div');
    modal.className = 'modal newsletter-modal';
    modal.style.display = 'block';
    
    let html = `
        <div class="modal-content newsletter-content">
            <span class="close" onclick="this.closest('.modal').remove()">&times;</span>
            <div class="newsletter-header">
                <h2><i class="fas fa-newspaper"></i> ${newsletterData.titulo}</h2>
                <p class="newsletter-period">${newsletterData.periodo}</p>
            </div>
            <div class="newsletter-body">
                <div class="newsletter-intro">
                    <p>${newsletterData.introducao}</p>
                </div>
    `;
    
    newsletterData.secoes.forEach(secao => {
        html += `
            <div class="newsletter-section">
                <h3>${secao.titulo}</h3>
                <div class="newsletter-section-content">
                    ${secao.conteudo}
                </div>
            </div>
        `;
    });
    
    if (newsletterData.dicaDoTrimestre) {
        html += `
            <div class="newsletter-tip">
                <h3><i class="fas fa-lightbulb"></i> ${newsletterData.dicaDoTrimestre}</h3>
            </div>
        `;
    }
    
    html += `
            </div>
            <div class="newsletter-footer">
                <div class="newsletter-contact">
                    <h4>${newsletterData.contato.texto}</h4>
                    <p><i class="fas fa-phone"></i> ${newsletterData.contato.telefone}</p>
                    <p><i class="fas fa-envelope"></i> ${newsletterData.contato.email}</p>
                    <p><i class="fas fa-user-circle"></i> ${newsletterData.contato.areaCliente}</p>
                </div>
            </div>
            <div class="newsletter-actions">
                <button class="btn btn-primary" onclick="window.print()">
                    <i class="fas fa-print"></i> Imprimir
                </button>
                <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">
                    Fechar
                </button>
            </div>
        </div>
    `;
    
    modal.innerHTML = html;
    document.body.appendChild(modal);
    
    // Fechar ao clicar fora
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// Inicializar
document.addEventListener('DOMContentLoaded', function() {
    loadNewsletter();
});

// Exportar
if (typeof window !== 'undefined') {
    window.showClientNewsletter = showClientNewsletter;
    window.sendNewsletterToAllClients = sendNewsletterToAllClients;
}



