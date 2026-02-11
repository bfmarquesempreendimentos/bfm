// MCMV e Calculadora dos Sonhos

// Calcular financiamento
function calcularFinanciamento() {
    const valorImovel = parseFloat(document.getElementById('valorImovel').value) || 0;
    const rendaFamiliar = parseFloat(document.getElementById('rendaFamiliar').value) || 0;

    if (valorImovel <= 0 || rendaFamiliar <= 0) {
        showMessage('Por favor, preencha a renda familiar e o valor do imóvel.', 'error');
        return;
    }

    // Limitar subsídio a R$ 55.000 (Faixa 2)
    const subsidioLimitado = 55000;
    
    // Valor financiado = Valor do imóvel - Subsídio - FGTS
    const valorFinanciado = Math.max(0, valorImovel - subsidioLimitado);
    
    // Taxa de juros anual (6.5% para MCMV Faixa 2)
    const taxaAnual = 6.5;
    const taxaMensal = Math.pow(1 + taxaAnual / 100, 1/12) - 1;
    
    // Prazo em meses (30 anos)
    const prazoMeses = 360;
    
    // Cálculo da prestação (Sistema de Amortização Constante - SAC)
    const amortizacao = valorFinanciado / prazoMeses;
    const primeiraPrestacao = amortizacao + (valorFinanciado * taxaMensal);
    const ultimaPrestacao = amortizacao;
    const prestacaoMedia = (primeiraPrestacao + ultimaPrestacao) / 2;
    
    // Verificar se a renda é suficiente (prestação não pode ultrapassar 30% da renda)
    const rendaMaximaPrestacao = rendaFamiliar * 0.30;
    const aprovado = prestacaoMedia <= rendaMaximaPrestacao;
    
    // Entrada necessária (estimada)
    const entradaNecessaria = Math.max(0, valorImovel - valorFinanciado - subsidioLimitado);

    const whatsappLink = getWhatsAppLink(
        `Olá, fiz a simulação da Calculadora dos Sonhos. Minha renda é R$ ${rendaFamiliar.toLocaleString('pt-BR')} e o imóvel custa R$ ${valorImovel.toLocaleString('pt-BR')}.`
    );
    
    const resultadoHTML = `
        <div class="resultado-item ${aprovado ? 'aprovado' : 'reprovado'}">
            <h4>${aprovado ? '✅ Financiamento Aprovado!' : '❌ Financiamento Precisa de Ajustes'}</h4>
        </div>
        <div class="resultado-detalhes">
            <div class="detalhe-item">
                <span class="label">Valor do Imóvel:</span>
                <span class="value">R$ ${valorImovel.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
            </div>
            <div class="detalhe-item">
                <span class="label">Subsídio MCMV:</span>
                <span class="value">R$ ${subsidioLimitado.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
            </div>
            <div class="detalhe-item">
                <span class="label">Valor Financiado:</span>
                <span class="value">R$ ${valorFinanciado.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
            </div>
            <div class="detalhe-item">
                <span class="label">Entrada Necessária:</span>
                <span class="value">R$ ${entradaNecessaria.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
            </div>
            <div class="detalhe-item">
                <span class="label">Prestação Média (SAC):</span>
                <span class="value">R$ ${prestacaoMedia.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
            </div>
            <div class="detalhe-item">
                <span class="label">30% da Renda:</span>
                <span class="value">R$ ${rendaMaximaPrestacao.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
            </div>
            <div class="detalhe-item">
                <span class="label">Prazo:</span>
                <span class="value">360 meses (30 anos)</span>
            </div>
            ${!aprovado ? `
                <div class="alerta">
                    <p><strong>Atenção:</strong> A prestação média excede 30% da sua renda familiar. 
                    Considere aumentar o subsídio, usar mais FGTS ou escolher um imóvel de menor valor.</p>
                </div>
            ` : ''}
            ${whatsappLink ? `
                <div class="resultado-cta">
                    <a href="${whatsappLink}" class="btn btn-primary" target="_blank" rel="noopener">
                        Falar no WhatsApp
                    </a>
                </div>
            ` : ''}
        </div>
    `;
    
    document.getElementById('resultadoContent').innerHTML = resultadoHTML;
    document.getElementById('resultadoCalculadora').scrollIntoView({ behavior: 'smooth' });
}

function getWhatsAppLink(message) {
    if (typeof CONFIG === 'undefined') return '';
    const broker = typeof isBroker === 'function' && isBroker() ? (currentUser?.phone || '') : '';
    const raw = broker || CONFIG.company.whatsappSales || '';
    const digits = raw.replace(/\D/g, '');
    if (!digits) return '';
    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

// Formatar valores monetários
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

