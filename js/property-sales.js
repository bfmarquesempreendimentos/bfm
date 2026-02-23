// Sistema de Propriedades Vendidas - Vinculação com CPF

// Estrutura de propriedades vendidas
// Em produção, isso viria de um banco de dados
let propertySales = JSON.parse(localStorage.getItem('propertySales') || '[]');

// Adicionar propriedade vendida
function addPropertySale(saleData) {
    if (!saleData) return null;
    const cpf = (saleData.clientCPF || '').toString().replace(/\D/g, '');
    if (cpf.length !== 11) {
        console.error('addPropertySale: CPF inválido', saleData.clientCPF);
        return null;
    }
    const sale = {
        id: Date.now(),
        propertyId: saleData.propertyId,
        propertyTitle: saleData.propertyTitle || 'Imóvel',
        unitCode: saleData.unitCode || null,
        clientCPF: cpf,
        clientName: saleData.clientName || '',
        clientEmail: saleData.clientEmail || '',
        clientPhone: saleData.clientPhone || '',
        saleDate: saleData.saleDate || new Date().toISOString(),
        salePrice: saleData.salePrice || 0,
        contractNumber: saleData.contractNumber || null,
        status: 'vendido',
        createdAt: new Date().toISOString()
    };
    
    propertySales.push(sale);
    savePropertySales();

    if (typeof savePropertySaleToFirestore === 'function') {
        savePropertySaleToFirestore(sale).catch(error => {
            console.error('Erro ao salvar venda no Firestore:', error);
        });
    }
    
    return sale;
}

// Buscar propriedade por CPF
function getPropertyByCPF(cpf) {
    const cleanCPF = cpf.replace(/\D/g, '');
    return propertySales.find(sale => sale.clientCPF === cleanCPF);
}

// Buscar todas as propriedades de um CPF (sempre lê dados atualizados)
function getPropertiesByCPF(cpf) {
    loadPropertySales();
    const cleanCPF = (cpf || '').toString().replace(/\D/g, '');
    return propertySales.filter(sale => String(sale.clientCPF || '').replace(/\D/g, '') === cleanCPF);
}

// Verificar se CPF tem propriedade vendida (sempre lê dados atualizados do localStorage)
function hasPropertySale(cpf) {
    loadPropertySales();
    const cleanCPF = (cpf || '').toString().replace(/\D/g, '');
    return propertySales.some(sale => String(sale.clientCPF || '').replace(/\D/g, '') === cleanCPF);
}

// Salvar vendas
function savePropertySales() {
    localStorage.setItem('propertySales', JSON.stringify(propertySales));
}

// Carregar vendas
function loadPropertySales() {
    propertySales = JSON.parse(localStorage.getItem('propertySales') || '[]');
}

// Converter venda em propriedade do cliente
function saleToClientProperty(sale) {
    // Buscar propriedade original
    const property = properties.find(p => p.id === sale.propertyId);
    
    return {
        id: sale.id,
        propertyId: sale.propertyId,
        title: sale.propertyTitle || property?.title || 'Imóvel',
        type: property?.type || 'apartamento',
        location: property?.location || '',
        price: sale.salePrice,
        bedrooms: property?.bedrooms || 0,
        bathrooms: property?.bathrooms || 0,
        area: property?.area || 0,
        unitCode: sale.unitCode,
        purchaseDate: sale.saleDate,
        contractNumber: sale.contractNumber,
        status: 'vendido',
        openPortion: null, // Será calculado se houver financiamento
        images: property?.images || [],
        description: property?.description || ''
    };
}

// Inicializar
loadPropertySales();

// Exportar para uso global
if (typeof window !== 'undefined') {
    window.addPropertySale = addPropertySale;
    window.getPropertyByCPF = getPropertyByCPF;
    window.getPropertiesByCPF = getPropertiesByCPF;
    window.hasPropertySale = hasPropertySale;
    window.loadPropertySales = loadPropertySales;
}

