const { sendTextMessage, sendInteractiveButtons } = require('./whatsapp-api');

const TEMPLATES = {
  welcome: (name) => {
    const greeting = getGreeting();
    return `${greeting}, ${name || 'tudo bem'}! 😊

Eu sou a *Bia*, assistente virtual da *B F Marques Empreendimentos*.

🏠 Estamos há 15 anos construindo sonhos no Rio de Janeiro!

Como posso te ajudar hoje?

1️⃣ Ver imóveis disponíveis
2️⃣ Simular financiamento MCMV
3️⃣ Agendar uma visita
4️⃣ Falar com um consultor

_Basta digitar o número ou escrever sua dúvida!_`;
  },

  followUp24h: (name, propertyTitle) => {
    let msg = `Olá, ${name || ''}! 👋

Passando aqui para saber se ficou com alguma dúvida sobre os nossos imóveis.`;

    if (propertyTitle) {
      msg += `\n\nVi que você se interessou pelo *${propertyTitle}* — posso te contar mais detalhes ou agendar uma visita? 🏠`;
    } else {
      msg += `\n\nTemos condições especiais com *subsídio de até R$ 55.000* pelo programa MCMV! Quer que eu faça uma simulação? 💰`;
    }

    msg += `\n\n_Responda a qualquer momento, estou aqui!_`;
    return msg;
  },

  followUp72h: (name) => {
    return `Oi, ${name || ''}! 😊

Aproveitando para te avisar que temos *unidades limitadas* em alguns dos nossos empreendimentos.

🎁 *Condições especiais válidas por tempo limitado:*
• Subsídio MCMV de até R$ 55.000
• Documentação (ITBI + Registro) GRÁTIS
• Entrada facilitada

Quer que eu faça uma simulação rápida? Basta me informar sua renda mensal! 💬`;
  },

  followUp7d: (name, propertyTitle) => {
    let msg = `Olá, ${name || ''}! 👋

Passando para lembrar: nossos imóveis são ideais para quem busca *primeira moradia* ou *investimento com MCMV*.

📊 *Dados que fazem diferença:*
• *Faixa 1* (renda até R$ 2.640): subsídio de R$ 55.000 + taxa 4,25% a.a.
• *Faixa 2* (renda até R$ 4.400): subsídio de R$ 55.000 + taxa 6,5% a.a.
• Documentação (ITBI + Registro) *GRÁTIS*
• Parcela não ultrapassa 30% da renda

`;
    if (propertyTitle) {
      msg += `Você demonstrou interesse em *${propertyTitle}* – ainda temos unidades! Quer simular o financiamento ou agendar visita?`;
    } else {
      msg += `Temos imóveis a partir de *R$ 145.000* em São Gonçalo e Itaboraí. Quer que eu mostre as opções?`;
    }
    msg += `\n\n_Estou à disposição!_`;
    return msg;
  },

  followUp14d: (name) => {
    return `Oi, ${name || ''}! 😊

Não esqueci de você! Nossos empreendimentos (exceto Casa Luxo Maricá) são focados em *MCMV Faixa 1 e 2* – padrão baixo, médio-baixo e médio.

💰 *O que isso significa na prática:*
• Subsídio de *até R$ 55.000* na entrada
• Taxas de juros *reduzidas* (4,25% ou 6,5% a.a.)
• 7 dos 8 empreendimentos aceitam MCMV
• Condição especial: *ITBI e Registro grátis*

🏠 Imóveis em São Gonçalo e Itaboraí a partir de R$ 145.000.

Posso fazer uma simulação com sua renda ou agendar uma visita? Basta responder! 📱`;
  },

  followUp30d: (name) => {
    return `Olá, ${name || ''}! 🌟

Última mensagem da sequência: nossos imóveis continuam com condições especiais para *MCMV Faixa 1 e 2*.

📌 *Resumo para você decidir:*
• Renda até R$ 2.640 → Subsídio R$ 55.000 + 4,25% a.a.
• Renda até R$ 4.400 → Subsídio R$ 55.000 + 6,5% a.a.
• Prazo: até 360 meses (30 anos)
• Parcela: até 30% da sua renda
• Documentação grátis (ITBI + Registro)

Se quiser retomar a conversa ou receber novidades, é só responder. Caso contrário, não enviarei mais mensagens automáticas – mas estarei aqui quando precisar! 🙌`;
  },

  postVisit: (name, propertyTitle) => {
    return `Olá, ${name || ''}! 🏡

Muito obrigada pela visita ao *${propertyTitle || 'empreendimento'}*!

O que achou? Gostaria de saber sua opinião e esclarecer qualquer dúvida.

Lembre-se: as condições especiais que apresentamos são *por tempo limitado*. Se quiser garantir a sua unidade, posso te ajudar com os próximos passos! 📋

_Estou à disposição!_`;
  },

  documentReady: (name) => {
    return `Olá, ${name || ''}! 📄

Ótima notícia! Sua documentação está pronta para análise.

O Davi (nosso gerente) entrará em contato para combinar os próximos passos.

Se tiver qualquer dúvida, pode falar comigo! 😊`;
  },

  priceAlert: (name, propertyTitle, newPrice) => {
    const priceStr = newPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    return `🔔 *Alerta de oportunidade!*

Olá, ${name || ''}!

O *${propertyTitle}* está com condição especial: *${priceStr}*!

Essa é uma oportunidade única — as unidades estão acabando! 🏃‍♂️

Quer que eu simule o financiamento para você?`;
  },
};

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

async function sendWelcomeMessage(phone, name) {
  const text = TEMPLATES.welcome(name);
  await sendTextMessage(phone, text);
}

async function sendFollowUp(phone, name, propertyTitle, type = '24h') {
  let text;
  switch (type) {
    case '24h':
      text = TEMPLATES.followUp24h(name, propertyTitle);
      break;
    case '72h':
      text = TEMPLATES.followUp72h(name);
      break;
    case '7d':
      text = TEMPLATES.followUp7d(name, propertyTitle);
      break;
    case '14d':
      text = TEMPLATES.followUp14d(name);
      break;
    case '30d':
      text = TEMPLATES.followUp30d(name);
      break;
    case 'post-visit':
      text = TEMPLATES.postVisit(name, propertyTitle);
      break;
    default:
      text = TEMPLATES.followUp24h(name, propertyTitle);
  }
  await sendTextMessage(phone, text);
}

async function sendPostVisitMessage(phone, name, propertyTitle) {
  const text = TEMPLATES.postVisit(name, propertyTitle);
  await sendTextMessage(phone, text);
}

module.exports = {
  TEMPLATES,
  sendWelcomeMessage,
  sendFollowUp,
  sendPostVisitMessage,
  getGreeting,
};
