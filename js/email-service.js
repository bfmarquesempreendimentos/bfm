// Sistema de Envio de Emails (Simulado - Preparado para integração real)

const COMPANY_EMAIL = 'bfmarquesempreendimentos@gmail.com';

// Enviar email (simulado - em produção usaria API como SendGrid, Mailgun, etc.)
async function sendEmail(to, subject, body, attachments = []) {
    // Em produção, isso seria uma chamada para API de email
    // Se Firebase estiver ativo, coloca na fila para Functions
    if (typeof queueEmailInFirestore === 'function') {
        await queueEmailInFirestore({ to, subject, body, attachments });
        return { to, subject, status: 'queued' };
    }
    
    // Fallback: registrar no console e salvar no localStorage
    
    const email = {
        id: Date.now(),
        to: to,
        from: COMPANY_EMAIL,
        subject: subject,
        body: body,
        attachments: attachments,
        sentAt: new Date().toISOString(),
        status: 'sent'
    };

    // Salvar email no histórico (local - comprovação jurídica)
    const emailHistory = JSON.parse(localStorage.getItem('emailHistory') || '[]');
    emailHistory.push(email);
    localStorage.setItem('emailHistory', JSON.stringify(emailHistory));

    // Salvar no Firestore para auditoria/comprovação (quando disponível)
    if (typeof saveEmailAuditToFirestore === 'function') {
        saveEmailAuditToFirestore(email).catch(e => console.warn('Audit email Firestore:', e));
    }
    
    // Log para desenvolvimento
    console.log('Email enviado:', {
        to: to,
        subject: subject,
        body: body.substring(0, 100) + '...'
    });
    
    // Em produção, descomentar e usar API real:
    /*
    try {
        const response = await fetch('/api/send-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                to: to,
                subject: subject,
                html: body,
                attachments: attachments
            })
        });
        
        if (!response.ok) {
            throw new Error('Erro ao enviar email');
        }
        
        return await response.json();
    } catch (error) {
        console.error('Erro ao enviar email:', error);
        throw error;
    }
    */
    
    return email;
}

const SITE_URL = (typeof CONFIG !== 'undefined' && CONFIG?.company?.siteUrl) || 'https://bfmarquesempreendimentos.github.io/bfm';
const ADMIN_REPAIR_LINK = (repairId) => `${SITE_URL}/admin.html?openRepair=${repairId}`;
const CLIENT_AREA_LINK = `${SITE_URL}/client-area.html`;

// Enviar email de notificação de solicitação de reparo
async function sendRepairRequestEmail(repairRequest, client) {
    const subject = `Nova Solicitação de Reparo - Protocolo #${repairRequest.id}`;
    const adminLink = ADMIN_REPAIR_LINK(repairRequest.id);

    // Email para a empresa - com link para responder
    const companyBody = `
        <h2>Nova Solicitação de Reparo</h2>
        <p><strong>Protocolo:</strong> #${repairRequest.id}</p>
        <p><strong>Cliente:</strong> ${client.name}</p>
        <p><strong>CPF:</strong> ${formatCPF(client.cpf || '')}</p>
        <p><strong>Email:</strong> ${client.email}</p>
        <p><strong>Telefone:</strong> ${formatPhone(client.phone || '')}</p>
        <p><strong>Imóvel:</strong> ${repairRequest.propertyTitle || 'N/A'}</p>
        <p><strong>Localização do Problema:</strong> ${repairRequest.location}</p>
        <p><strong>Descrição:</strong> ${repairRequest.description}</p>
        <p><strong>Prioridade:</strong> ${repairRequest.priority}</p>
        <p><strong>Data:</strong> ${formatDate(repairRequest.createdAt)}</p>
        <p><strong>Status:</strong> ${repairRequest.status}</p>
        ${repairRequest.attachments?.length ? `<p><strong>Anexos:</strong> ${repairRequest.attachments.length} arquivo(s)</p>` : ''}
        <hr>
        <p><a href="${adminLink}" style="display:inline-block;background:#3498db;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;">Responder esta solicitação</a></p>
    `;

    // Email para o cliente - SEM link, deve acessar site e fazer login
    const clientBody = `
        <h2>Solicitação de Reparo Recebida</h2>
        <p>Olá ${client.name},</p>
        <p>Sua solicitação de reparo foi recebida com sucesso!</p>
        <p><strong>Protocolo:</strong> #${repairRequest.id}</p>
        <p><strong>Imóvel:</strong> ${repairRequest.propertyTitle || 'N/A'}</p>
        <p><strong>Localização do Problema:</strong> ${repairRequest.location}</p>
        <p><strong>Descrição:</strong> ${repairRequest.description}</p>
        <p><strong>Prioridade:</strong> ${repairRequest.priority}</p>
        <p><strong>Data:</strong> ${formatDate(repairRequest.createdAt)}</p>
        <hr>
        <p>Nossa equipe técnica irá analisar sua solicitação e entrar em contato em breve.</p>
        <p><strong>Para acompanhar e responder às mensagens</strong>, acesse o site e faça login na Área do Cliente.</p>
        <p>Atenciosamente,<br>B F Marques Empreendimentos</p>
    `;

    await sendEmail(COMPANY_EMAIL, subject, companyBody);
    await sendEmail(client.email, subject, clientBody);
}

// Email ao cliente quando a empresa responde (nova mensagem no sistema)
async function sendRepairNewResponseEmailToClient(repair, responseMessage) {
    const clientEmail = repair.clientEmail || repair.client?.email;
    const clientName = repair.clientName || repair.client?.name || 'Cliente';
    if (!clientEmail) return;
    const subject = `Nova mensagem - Solicitação de Reparo #${repair.id}`;
    const body = `
        <h2>Você tem uma nova mensagem</h2>
        <p>Olá ${clientName},</p>
        <p>Há uma nova mensagem na sua solicitação de reparo <strong>#${repair.id}</strong>.</p>
        <p><strong>Imóvel:</strong> ${repair.propertyTitle || 'N/A'}</p>
        <p><strong>Protocolo:</strong> #${repair.id}</p>
        <hr>
        <p>Para visualizar e responder, acesse o site e faça login na Área do Cliente.</p>
        <p>Atenciosamente,<br>B F Marques Empreendimentos</p>
    `;
    await sendEmail(clientEmail, subject, body);
}

// Email à empresa quando o cliente responde - inclui o questionamento e link para responder
async function sendRepairClientResponseEmailToCompany(repair, clientMessage) {
    const subject = `Cliente respondeu - Reparo #${repair.id} - ${repair.clientName || 'Cliente'}`;
    const adminLink = ADMIN_REPAIR_LINK(repair.id);
    const body = `
        <h2>Cliente respondeu na Solicitação de Reparo</h2>
        <p><strong>Protocolo:</strong> #${repair.id}</p>
        <p><strong>Cliente:</strong> ${repair.clientName || '-'} (${repair.clientEmail || '-'})</p>
        <p><strong>Imóvel:</strong> ${repair.propertyTitle || 'N/A'}</p>
        <p><strong>Localização:</strong> ${repair.location || '-'}</p>
        <hr>
        <p><strong>Pergunta/Mensagem do cliente:</strong></p>
        <blockquote style="background:#f5f5f5;padding:15px;border-left:4px solid #3498db;margin:15px 0;">
            ${clientMessage}
        </blockquote>
        <hr>
        <p><a href="${adminLink}" style="display:inline-block;background:#3498db;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;">Responder no painel</a></p>
    `;
    await sendEmail(COMPANY_EMAIL, subject, body);
}

// Enviar email de contato
async function sendContactEmail(contactData) {
    const subject = `Nova Mensagem do Site - ${contactData.subject || 'Contato'}`;
    
    const body = `
        <h2>Nova Mensagem do Site</h2>
        <p><strong>Nome:</strong> ${contactData.name}</p>
        <p><strong>Email:</strong> ${contactData.email}</p>
        <p><strong>Telefone:</strong> ${contactData.phone || 'Não informado'}</p>
        <p><strong>Assunto:</strong> ${contactData.subject || 'Contato Geral'}</p>
        <p><strong>Tipo:</strong> ${contactData.type || 'Contato'}</p>
        ${contactData.propertyAddress ? `<p><strong>Endereço do Terreno:</strong> ${contactData.propertyAddress}</p>` : ''}
        ${contactData.propertySize ? `<p><strong>Tamanho do Terreno:</strong> ${contactData.propertySize}</p>` : ''}
        <p><strong>Mensagem:</strong></p>
        <p>${contactData.message}</p>
        <hr>
        <p><strong>Data:</strong> ${formatDate(new Date())}</p>
    `;
    
    await sendEmail(COMPANY_EMAIL, subject, body);
    
    // Email de confirmação para o cliente
    const confirmationBody = `
        <h2>Mensagem Recebida</h2>
        <p>Olá ${contactData.name},</p>
        <p>Recebemos sua mensagem e entraremos em contato em breve!</p>
        <p><strong>Assunto:</strong> ${contactData.subject || 'Contato Geral'}</p>
        <p>Atenciosamente,<br>B F Marques Empreendimentos</p>
    `;
    
    await sendEmail(contactData.email, 'Mensagem Recebida - B F Marques', confirmationBody);
}

// Enviar email de confirmação ao concluir cadastro (primeiro acesso)
async function sendClientRegistrationConfirmationEmail(client) {
    const subject = 'Cadastro Confirmado - B F Marques Empreendimentos';
    const body = `
        <h2>Bem-vindo à Área do Cliente!</h2>
        <p>Olá ${client.name},</p>
        <p>Seu cadastro foi realizado com sucesso na Área do Cliente da B F Marques Empreendimentos.</p>
        <p>Você já pode acessar:</p>
        <ul>
            <li><strong>Meus Imóveis</strong> – acompanhar seus imóveis</li>
            <li><strong>Documentos</strong> – acessar documentos do imóvel</li>
            <li><strong>Solicitações de Reparo</strong> – registrar e acompanhar reparos</li>
            <li><strong>Manual do Cliente</strong> – garantias e orientações</li>
            <li><strong>Histórico</strong> – acompanhar interações</li>
        </ul>
        <p>Acesse sua área em: <a href="${typeof window !== 'undefined' ? new URL('client-area.html', window.location.href).href : ''}">Área do Cliente</a></p>
        <p>Use o mesmo email e senha cadastrados para entrar.</p>
        <hr>
        <p>Atenciosamente,<br><strong>B F Marques Empreendimentos</strong></p>
    `;
    await sendEmail(client.email, subject, body);
}

// Enviar email de visita agendada (quando status vai para em_andamento)
async function sendRepairVisitScheduledEmail(repair, visitDate) {
    const clientEmail = repair.clientEmail || repair.client?.email;
    const clientName = repair.clientName || repair.client?.name || 'Cliente';
    if (!clientEmail) return;
    const formattedDate = visitDate ? formatDate(visitDate) : 'em breve';
    const subject = `Visita Técnica Agendada - Reparo #${repair.id}`;
    const body = `
        <h2>Visita Técnica Agendada</h2>
        <p>Olá ${clientName},</p>
        <p>Informamos que a visita técnica para o reparo solicitado foi agendada.</p>
        <p><strong>Protocolo:</strong> #${repair.id}</p>
        <p><strong>Imóvel:</strong> ${repair.propertyTitle || 'N/A'}</p>
        <p><strong>Localização do Problema:</strong> ${repair.location}</p>
        <p><strong>Data prevista da visita:</strong> ${formattedDate}</p>
        <hr>
        <p>Nossa equipe técnica irá ao imóvel na data informada. Em caso de imprevisto, entraremos em contato.</p>
        <p>Acompanhe o status na Área do Cliente.</p>
        <p>Atenciosamente,<br>B F Marques Empreendimentos</p>
    `;
    await sendEmail(clientEmail, subject, body);
}

// Enviar email de reparo concluído
async function sendRepairCompletedEmail(repair) {
    const clientEmail = repair.clientEmail || repair.client?.email;
    const clientName = repair.clientName || repair.client?.name || 'Cliente';
    if (!clientEmail) return;
    const subject = `Reparo Concluído - Protocolo #${repair.id}`;
    const body = `
        <h2>Reparo Concluído</h2>
        <p>Olá ${clientName},</p>
        <p>Informamos que o reparo solicitado foi concluído.</p>
        <p><strong>Protocolo:</strong> #${repair.id}</p>
        <p><strong>Imóvel:</strong> ${repair.propertyTitle || 'N/A'}</p>
        <p><strong>Localização:</strong> ${repair.location}</p>
        <p><strong>Data de conclusão:</strong> ${formatDate(new Date())}</p>
        <hr>
        <p>Por favor, confira o local do reparo no imóvel. Em caso de dúvidas ou problemas, entre em contato conosco.</p>
        <p>Atenciosamente,<br>B F Marques Empreendimentos</p>
    `;
    await sendEmail(clientEmail, subject, body);
    await sendEmail(COMPANY_EMAIL, `Reparo #${repair.id} Concluído - ${clientName}`, `
        <h2>Reparo Marcado como Concluído</h2>
        <p><strong>Protocolo:</strong> #${repair.id}</p>
        <p><strong>Cliente:</strong> ${clientName} (${clientEmail})</p>
        <p><strong>Imóvel:</strong> ${repair.propertyTitle || 'N/A'}</p>
        <p><strong>Localização:</strong> ${repair.location}</p>
        <p>Email de confirmação enviado ao cliente.</p>
    `);
}

// Enviar newsletter trimestral
async function sendNewsletter(clientEmail, clientName, newsletterContent) {
    const subject = `Newsletter Trimestral - B F Marques Empreendimentos`;
    
    const body = `
        <h2>Newsletter Trimestral - ${newsletterContent.period}</h2>
        <p>Olá ${clientName},</p>
        <p>${newsletterContent.introduction}</p>
        
        ${newsletterContent.sections.map(section => `
            <h3>${section.title}</h3>
            ${section.content}
        `).join('')}
        
        <hr>
        <p>Atenciosamente,<br>B F Marques Empreendimentos</p>
        <p><small>Você está recebendo este email porque é cliente da B F Marques Empreendimentos.</small></p>
    `;
    
    await sendEmail(clientEmail, subject, body);
}

// Enviar credenciais do cliente ao registrar venda
async function sendClientCredentialsEmail(clientName, clientEmail, generatedPassword, isNewAccount = true) {
  const siteUrl = (typeof CONFIG !== 'undefined' && CONFIG?.company?.siteUrl) || 'https://bfmarquesempreendimentos.github.io/bfm';
  const clientAreaUrl = `${siteUrl}/client-area.html`;

  const subject = isNewAccount
    ? 'Bem-vindo à Área do Cliente - B F Marques Empreendimentos'
    : 'Sua compra foi registrada - B F Marques Empreendimentos';

  const body = isNewAccount
    ? `
    <h2>Olá ${clientName},</h2>
    <p>Sua compra foi registrada e você já está cadastrado em nossa Área do Cliente!</p>
    <p><strong>Use as credenciais abaixo para acessar:</strong></p>
    <p style="background:#f5f5f5;padding:15px;border-radius:8px;font-family:monospace;">
      Email: ${clientEmail}<br>
      Senha temporária: <strong>${generatedPassword}</strong>
    </p>
    <p><strong>⚠️ Importante:</strong> No primeiro acesso, você precisará alterar esta senha por uma de sua preferência.</p>
    <p><a href="${clientAreaUrl}" style="display:inline-block;background:#3498db;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;margin-top:10px;">Acessar Área do Cliente</a></p>
    <p>Atenciosamente,<br>B F Marques Empreendimentos</p>
  `
    : `
    <h2>Olá ${clientName},</h2>
    <p>Sua compra foi registrada com sucesso!</p>
    <p>Você já possui cadastro em nossa Área do Cliente. Use o email <strong>${clientEmail}</strong> e sua senha para acessar.</p>
    <p>Se você esqueceu sua senha, use a opção "Esqueci minha senha" na tela de login.</p>
    <p><a href="${clientAreaUrl}" style="display:inline-block;background:#3498db;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;margin-top:10px;">Acessar Área do Cliente</a></p>
    <p>Atenciosamente,<br>B F Marques Empreendimentos</p>
  `;

  await sendEmail(clientEmail, subject, body);
}

// Formatar CPF
function formatCPF(cpf) {
    cpf = cpf.replace(/\D/g, '');
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

// Formatar telefone
function formatPhone(phone) {
    phone = phone.replace(/\D/g, '');
    if (phone.length === 11) {
        return phone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    } else if (phone.length === 10) {
        return phone.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    }
    return phone;
}

// Formatar data
function formatDate(date) {
    return new Date(date).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Exportar funções
if (typeof window !== 'undefined') {
    window.sendEmail = sendEmail;
    window.sendRepairRequestEmail = sendRepairRequestEmail;
    window.sendRepairNewResponseEmailToClient = sendRepairNewResponseEmailToClient;
    window.sendRepairClientResponseEmailToCompany = sendRepairClientResponseEmailToCompany;
    window.sendClientRegistrationConfirmationEmail = sendClientRegistrationConfirmationEmail;
    window.sendRepairVisitScheduledEmail = sendRepairVisitScheduledEmail;
    window.sendRepairCompletedEmail = sendRepairCompletedEmail;
    window.sendContactEmail = sendContactEmail;
    window.sendNewsletter = sendNewsletter;
    window.sendClientCredentialsEmail = sendClientCredentialsEmail;
}

