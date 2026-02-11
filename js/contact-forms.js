// Sistema de Formulários de Contato

// Mostrar tab do formulário de contato
function showContactTab(tab) {
    document.querySelectorAll('.contact-form').forEach(form => form.classList.remove('active'));
    document.querySelectorAll('.contact-tab-btn').forEach(btn => btn.classList.remove('active'));
    
    if (tab === 'general') {
        document.getElementById('generalContactForm').classList.add('active');
        document.querySelectorAll('.contact-tab-btn')[0].classList.add('active');
    } else {
        document.getElementById('landOfferForm').classList.add('active');
        document.querySelectorAll('.contact-tab-btn')[1].classList.add('active');
    }
}

// Processar contato geral
async function handleGeneralContact(event) {
    event.preventDefault();
    
    const contactData = {
        name: document.getElementById('contactName').value,
        email: document.getElementById('contactEmail').value,
        phone: document.getElementById('contactPhone').value,
        subject: document.getElementById('contactSubject').value,
        message: document.getElementById('contactMessage').value,
        type: 'contato_geral'
    };
    
    // Enviar email
    if (typeof sendContactEmail !== 'undefined') {
        try {
            await sendContactEmail(contactData);
            showMessage('Mensagem enviada com sucesso! Entraremos em contato em breve.', 'success');
            document.getElementById('generalContactForm').reset();
        } catch (error) {
            console.error('Erro ao enviar email:', error);
            showMessage('Erro ao enviar mensagem. Tente novamente ou ligue para (21) 99555-7010', 'error');
        }
    } else {
        showMessage('Mensagem enviada com sucesso! Entraremos em contato em breve.', 'success');
        document.getElementById('generalContactForm').reset();
    }
}

// Processar oferta de terreno
async function handleLandOffer(event) {
    event.preventDefault();
    
    const landFeatures = Array.from(document.querySelectorAll('input[name="landFeatures"]:checked'))
        .map(cb => cb.value);
    
    const landData = {
        name: document.getElementById('landOwnerName').value,
        email: document.getElementById('landOwnerEmail').value,
        phone: document.getElementById('landOwnerPhone').value,
        subject: 'Oferta de Terreno',
        type: 'oferta_terreno',
        propertyAddress: document.getElementById('landAddress').value,
        propertySize: document.getElementById('landSize').value,
        propertyValue: document.getElementById('landValue').value,
        features: landFeatures,
        message: document.getElementById('landDescription').value || 'Oferta de terreno para venda'
    };
    
    // Enviar email
    if (typeof sendContactEmail !== 'undefined') {
        try {
            await sendContactEmail(landData);
            showMessage('Proposta de terreno enviada com sucesso! Nossa equipe entrará em contato em breve.', 'success');
            document.getElementById('landOfferForm').reset();
        } catch (error) {
            console.error('Erro ao enviar email:', error);
            showMessage('Erro ao enviar proposta. Tente novamente ou ligue para (21) 99555-7010', 'error');
        }
    } else {
        showMessage('Proposta de terreno enviada com sucesso! Nossa equipe entrará em contato em breve.', 'success');
        document.getElementById('landOfferForm').reset();
    }
}



