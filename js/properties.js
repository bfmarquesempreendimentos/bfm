// Properties management system

// Property management functions
function addProperty(propertyData) {
    const newProperty = {
        id: properties.length > 0 ? Math.max(...properties.map(p => p.id)) + 1 : 1,
        title: propertyData.title,
        type: propertyData.type,
        location: propertyData.location,
        price: parseFloat(propertyData.price),
        bedrooms: parseInt(propertyData.bedrooms),
        bathrooms: parseInt(propertyData.bathrooms),
        area: parseFloat(propertyData.area),
        parking: parseInt(propertyData.parking),
        status: 'disponivel',
        images: propertyData.images || [],
        videos: propertyData.videos || [],
        description: propertyData.description,
        features: propertyData.features || [],
        reservedUntil: null,
        reservedBy: null,
        createdAt: new Date(),
        updatedAt: new Date()
    };
    if (typeof addCreatedBy === 'function') addCreatedBy(newProperty);
    properties.push(newProperty);
    saveProperties();
    displayProperties(properties);
    
    return newProperty;
}

// Update property
function updateProperty(propertyId, updateData) {
    const propertyIndex = properties.findIndex(p => p.id === propertyId);
    if (propertyIndex === -1) {
        showMessage('Imóvel não encontrado.', 'error');
        return null;
    }
    
    var merged = Object.assign({}, properties[propertyIndex], updateData, { updatedAt: new Date() });
    if (typeof addUpdatedBy === 'function') addUpdatedBy(merged);
    properties[propertyIndex] = merged;
    
    saveProperties();
    displayProperties(properties);
    
    return properties[propertyIndex];
}

// Delete property
function deleteProperty(propertyId) {
    const propertyIndex = properties.findIndex(p => p.id === propertyId);
    if (propertyIndex === -1) {
        showMessage('Imóvel não encontrado.', 'error');
        return false;
    }
    
    // Check if property has active reservations
    const activeReservation = reservations.find(r => 
        r.propertyId === propertyId && r.status === 'active'
    );
    
    if (activeReservation) {
        showMessage('Não é possível excluir um imóvel com reserva ativa.', 'error');
        return false;
    }
    
    if (!confirm('Tem certeza que deseja excluir este imóvel?')) {
        return false;
    }
    
    properties.splice(propertyIndex, 1);
    saveProperties();
    displayProperties(properties);
    
    showMessage('Imóvel excluído com sucesso.', 'success');
    return true;
}

// Save properties to localStorage
function saveProperties() {
    localStorage.setItem('properties', JSON.stringify(properties));
}

// Load properties from localStorage
function loadPropertiesFromStorage() {
    const savedProperties = localStorage.getItem('properties');
    if (savedProperties) {
        properties = JSON.parse(savedProperties);
        if (Array.isArray(properties) && properties.length === 0) {
            localStorage.removeItem('properties');
            properties = [];
            return;
        }
        
        // Convert date strings back to Date objects
        properties.forEach(property => {
            if (property.createdAt) property.createdAt = new Date(property.createdAt);
            if (property.updatedAt) property.updatedAt = new Date(property.updatedAt);
            if (property.reservedUntil) property.reservedUntil = new Date(property.reservedUntil);
        });
    }
}

// Get property by ID
function getPropertyById(propertyId) {
    return properties.find(p => p.id === propertyId);
}

// Get properties by type
function getPropertiesByType(type) {
    return properties.filter(p => p.type === type);
}

// Get properties by status
function getPropertiesByStatus(status) {
    return properties.filter(p => p.status === status);
}

// Get properties by price range
function getPropertiesByPriceRange(minPrice, maxPrice) {
    return properties.filter(p => p.price >= minPrice && p.price <= maxPrice);
}

// Search properties
function searchProperties(query) {
    const searchTerm = query.toLowerCase();
    return properties.filter(property => 
        property.title.toLowerCase().includes(searchTerm) ||
        property.location.toLowerCase().includes(searchTerm) ||
        property.description.toLowerCase().includes(searchTerm) ||
        property.features.some(feature => feature.toLowerCase().includes(searchTerm))
    );
}

// Advanced filter properties
function advancedFilterProperties(filters) {
    return properties.filter(property => {
        // Type filter
        if (filters.type && property.type !== filters.type) return false;
        
        // Status filter
        if (filters.status && property.status !== filters.status) return false;
        
        // Price range filter
        if (filters.minPrice && property.price < filters.minPrice) return false;
        if (filters.maxPrice && property.price > filters.maxPrice) return false;
        
        // Bedrooms filter
        if (filters.minBedrooms && property.bedrooms < filters.minBedrooms) return false;
        if (filters.maxBedrooms && property.bedrooms > filters.maxBedrooms) return false;
        
        // Bathrooms filter
        if (filters.minBathrooms && property.bathrooms < filters.minBathrooms) return false;
        if (filters.maxBathrooms && property.bathrooms > filters.maxBathrooms) return false;
        
        // Area filter
        if (filters.minArea && property.area < filters.minArea) return false;
        if (filters.maxArea && property.area > filters.maxArea) return false;
        
        // Parking filter
        if (filters.minParking && property.parking < filters.minParking) return false;
        
        // Features filter
        if (filters.features && filters.features.length > 0) {
            const hasAllFeatures = filters.features.every(feature =>
                property.features.some(pFeature => 
                    pFeature.toLowerCase().includes(feature.toLowerCase())
                )
            );
            if (!hasAllFeatures) return false;
        }
        
        // Location filter
        if (filters.location) {
            const locationMatch = property.location.toLowerCase().includes(filters.location.toLowerCase());
            if (!locationMatch) return false;
        }
        
        return true;
    });
}

// Sort properties
function sortProperties(propertiesToSort, sortBy, sortOrder = 'asc') {
    const sorted = [...propertiesToSort].sort((a, b) => {
        let aValue, bValue;
        
        switch (sortBy) {
            case 'price':
                aValue = a.price;
                bValue = b.price;
                break;
            case 'area':
                aValue = a.area;
                bValue = b.area;
                break;
            case 'bedrooms':
                aValue = a.bedrooms;
                bValue = b.bedrooms;
                break;
            case 'bathrooms':
                aValue = a.bathrooms;
                bValue = b.bathrooms;
                break;
            case 'title':
                aValue = a.title.toLowerCase();
                bValue = b.title.toLowerCase();
                break;
            case 'location':
                aValue = a.location.toLowerCase();
                bValue = b.location.toLowerCase();
                break;
            case 'created':
                aValue = new Date(a.createdAt);
                bValue = new Date(b.createdAt);
                break;
            default:
                aValue = a.id;
                bValue = b.id;
        }
        
        if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
        return 0;
    });
    
    return sorted;
}

// Get property statistics
function getPropertyStatistics() {
    const stats = {
        total: properties.length,
        available: properties.filter(p => p.status === 'disponivel').length,
        reserved: properties.filter(p => p.status === 'reservado').length,
        sold: properties.filter(p => p.status === 'vendido').length,
        averagePrice: 0,
        totalValue: 0,
        byType: {},
        priceRanges: {
            'até 500k': 0,
            '500k-1M': 0,
            '1M-2M': 0,
            'acima 2M': 0
        }
    };
    
    if (properties.length > 0) {
        stats.totalValue = properties.reduce((sum, p) => sum + p.price, 0);
        stats.averagePrice = stats.totalValue / properties.length;
        
        // Count by type
        properties.forEach(property => {
            stats.byType[property.type] = (stats.byType[property.type] || 0) + 1;
            
            // Price ranges
            if (property.price <= 500000) {
                stats.priceRanges['até 500k']++;
            } else if (property.price <= 1000000) {
                stats.priceRanges['500k-1M']++;
            } else if (property.price <= 2000000) {
                stats.priceRanges['1M-2M']++;
            } else {
                stats.priceRanges['acima 2M']++;
            }
        });
    }
    
    return stats;
}

// Validate property data
function validatePropertyData(data) {
    const errors = [];
    
    if (!data.title || data.title.trim().length < 3) {
        errors.push('Título deve ter pelo menos 3 caracteres');
    }
    
    if (!data.type || !['apartamento', 'casa', 'cobertura'].includes(data.type)) {
        errors.push('Tipo de imóvel inválido');
    }
    
    if (!data.location || data.location.trim().length < 5) {
        errors.push('Localização deve ter pelo menos 5 caracteres');
    }
    
    if (!data.price || data.price <= 0) {
        errors.push('Preço deve ser maior que zero');
    }
    
    if (!data.bedrooms || data.bedrooms < 0) {
        errors.push('Número de quartos inválido');
    }
    
    if (!data.bathrooms || data.bathrooms < 0) {
        errors.push('Número de banheiros inválido');
    }
    
    if (!data.area || data.area <= 0) {
        errors.push('Área deve ser maior que zero');
    }
    
    if (data.parking < 0) {
        errors.push('Número de vagas não pode ser negativo');
    }
    
    if (!data.description || data.description.trim().length < 10) {
        errors.push('Descrição deve ter pelo menos 10 caracteres');
    }
    
    return errors;
}

// Format property for export
function formatPropertyForExport(property) {
    return {
        ID: property.id,
        Título: property.title,
        Tipo: property.type,
        Localização: property.location,
        Preço: `R$ ${property.price.toLocaleString('pt-BR')}`,
        Quartos: property.bedrooms,
        Banheiros: property.bathrooms,
        Área: `${property.area}m²`,
        Vagas: property.parking,
        Status: property.status,
        'Data Criação': formatDate(property.createdAt),
        'Última Atualização': formatDate(property.updatedAt)
    };
}

// Export properties to CSV
function exportPropertiesToCSV() {
    if (properties.length === 0) {
        showMessage('Não há imóveis para exportar.', 'warning');
        return;
    }
    
    const formattedProperties = properties.map(formatPropertyForExport);
    const headers = Object.keys(formattedProperties[0]);
    
    let csvContent = headers.join(',') + '\n';
    formattedProperties.forEach(property => {
        const row = headers.map(header => `"${property[header]}"`).join(',');
        csvContent += row + '\n';
    });
    
    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `imoveis_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showMessage('Arquivo CSV exportado com sucesso!', 'success');
}

// Import properties from JSON
function importPropertiesFromJSON(jsonData) {
    try {
        const importedProperties = JSON.parse(jsonData);
        
        if (!Array.isArray(importedProperties)) {
            throw new Error('Dados devem ser um array de imóveis');
        }
        
        let successCount = 0;
        let errorCount = 0;
        
        importedProperties.forEach((propertyData, index) => {
            const errors = validatePropertyData(propertyData);
            if (errors.length === 0) {
                addProperty(propertyData);
                successCount++;
            } else {
                console.error(`Erro no imóvel ${index + 1}:`, errors);
                errorCount++;
            }
        });
        
        showMessage(`Importação concluída: ${successCount} imóveis importados, ${errorCount} com erro.`, 
                   errorCount > 0 ? 'warning' : 'success');
        
    } catch (error) {
        showMessage(`Erro na importação: ${error.message}`, 'error');
    }
}

// Create property comparison
function compareProperties(propertyIds) {
    const propertiesToCompare = propertyIds.map(id => getPropertyById(id)).filter(Boolean);
    
    if (propertiesToCompare.length < 2) {
        showMessage('Selecione pelo menos 2 imóveis para comparar.', 'warning');
        return;
    }
    
    // In a real application, you would show a comparison table
    console.log('Property Comparison:', propertiesToCompare);
    
    return propertiesToCompare;
}

// Get similar properties
function getSimilarProperties(propertyId, limit = 3) {
    const baseProperty = getPropertyById(propertyId);
    if (!baseProperty) return [];
    
    const similar = properties
        .filter(p => p.id !== propertyId && p.status === 'disponivel')
        .map(property => {
            let score = 0;
            
            // Same type bonus
            if (property.type === baseProperty.type) score += 3;
            
            // Price similarity (within 20%)
            const priceDiff = Math.abs(property.price - baseProperty.price) / baseProperty.price;
            if (priceDiff <= 0.2) score += 2;
            else if (priceDiff <= 0.5) score += 1;
            
            // Bedrooms similarity
            const bedroomDiff = Math.abs(property.bedrooms - baseProperty.bedrooms);
            if (bedroomDiff === 0) score += 2;
            else if (bedroomDiff === 1) score += 1;
            
            // Area similarity (within 30%)
            const areaDiff = Math.abs(property.area - baseProperty.area) / baseProperty.area;
            if (areaDiff <= 0.3) score += 1;
            
            // Location similarity (same neighborhood/city)
            if (property.location.includes(baseProperty.location.split(',')[0])) score += 1;
            
            return { property, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(item => item.property);
    
    return similar;
}

// Initialize properties system
function initializePropertiesSystem() {
    // Load properties from localStorage if available
    loadPropertiesFromStorage();
    
    // If no properties in localStorage, keep the sample data
    if (properties.length === 0) {
        if (typeof loadProperties === 'function') {
            loadProperties();
        }
        return;
    }
    
    if (typeof displayProperties === 'function') {
        displayProperties(properties);
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    initializePropertiesSystem();
});

