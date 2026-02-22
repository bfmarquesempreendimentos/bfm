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

O José (nosso gerente) entrará em contato para combinar os próximos passos.

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
